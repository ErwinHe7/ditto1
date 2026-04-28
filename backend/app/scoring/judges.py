import json
import asyncio
from app.models import JudgeScore
from app.agents.llm import chat, JUDGE_CHEMISTRY_MODEL, JUDGE_VALUES_MODEL

SCORE_FORMAT = '{"chemistry": int, "values_alignment": int, "energy_match": int, "conflict_handling": int, "curiosity": int, "overall": int, "reasoning": "2-3 sentences"}'

CHEMISTRY_SYS = f"""You are a relationship therapist evaluating chemistry between two people.
Score 0-100 on: chemistry (spark, banter), values_alignment, energy_match, conflict_handling, curiosity.
Be skeptical. 70+ should be rare. Most ok-but-meh chats score 50-65.
Return ONLY valid JSON: {SCORE_FORMAT}"""

VALUES_SYS = f"""You evaluate long-term compatibility, not short-term chemistry.
Focus on: life direction alignment, conflict resolution, attachment style, deal-breaker compatibility.
A fun conversation with mismatched values should score under 60 overall.
Return ONLY valid JSON: {SCORE_FORMAT}"""

def _fmt_transcript(transcript, pa, pb) -> str:
    lines = [f"{pa['name']}: {pa['bio'][:80]}", f"{pb['name']}: {pb['bio'][:80]}", "---"]
    for m in transcript:
        name = pa["name"] if m["speaker"] == "A" else pb["name"]
        lines.append(f"{name}: {m['text']}")
    return "\n".join(lines)

def _parse(raw: str, judge_id: str) -> JudgeScore:
    raw = raw.strip()
    if not raw:
        raise ValueError(f"Empty response from {judge_id}")
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    start, end = raw.find("{"), raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in {judge_id} response: {raw[:100]}")
    d = json.loads(raw[start:end])
    return JudgeScore(judge_id=judge_id, **d)

async def _call_with_retry(msgs, model, judge_id, retries=3) -> str:
    for attempt in range(retries):
        try:
            raw = await chat(msgs, model=model, temperature=0.3, max_tokens=400, json_mode=True)
            if raw and raw.strip():
                return raw
        except Exception as e:
            if attempt == retries - 1:
                raise
            await asyncio.sleep(1 * (attempt + 1))
    raise ValueError(f"{judge_id} returned empty after {retries} attempts")

async def judge_chemistry(transcript, pa, pb) -> JudgeScore:
    text = _fmt_transcript(transcript, pa, pb)
    raw = await _call_with_retry(
        [{"role": "system", "content": CHEMISTRY_SYS}, {"role": "user", "content": text}],
        JUDGE_CHEMISTRY_MODEL, "chemistry"
    )
    return _parse(raw, "chemistry")

async def judge_values(transcript, pa, pb) -> JudgeScore:
    text = _fmt_transcript(transcript, pa, pb)
    raw = await _call_with_retry(
        [{"role": "system", "content": VALUES_SYS}, {"role": "user", "content": text}],
        JUDGE_VALUES_MODEL, "values"
    )
    return _parse(raw, "values")
