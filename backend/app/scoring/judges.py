import json
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
    if "```" in raw:
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    start, end = raw.find("{"), raw.rfind("}") + 1
    d = json.loads(raw[start:end])
    return JudgeScore(judge_id=judge_id, **d)

async def judge_chemistry(transcript, pa, pb) -> JudgeScore:
    text = _fmt_transcript(transcript, pa, pb)
    raw = await chat(
        [{"role": "system", "content": CHEMISTRY_SYS}, {"role": "user", "content": text}],
        model=JUDGE_CHEMISTRY_MODEL, temperature=0.3, max_tokens=400, json_mode=True
    )
    return _parse(raw, "chemistry")

async def judge_values(transcript, pa, pb) -> JudgeScore:
    text = _fmt_transcript(transcript, pa, pb)
    raw = await chat(
        [{"role": "system", "content": VALUES_SYS}, {"role": "user", "content": text}],
        model=JUDGE_VALUES_MODEL, temperature=0.3, max_tokens=400, json_mode=True
    )
    return _parse(raw, "values")
