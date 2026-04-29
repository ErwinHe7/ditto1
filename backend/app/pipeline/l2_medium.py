"""
L2 medium filter - lightweight simulation per pair.

Production target: 1 scenario x 3-5 turns x 3 quick dates with a cheap judge.
100 candidates -> top 10 in seconds when parallelized, then L3 can spend the
expensive models only on a tiny set.

This demo uses the fast persona model for the short dates and a deterministic
interaction scorer instead of spending GPT-5.5/Opus calls in the middle tier.
"""
import asyncio
import re
from app.models import Profile
from app.graph.builder import run_simulation
from app.scenarios.definitions import SCENARIOS

QUICK_SCENARIO = next((s for s in SCENARIOS if s["id"] == "first_coffee"), SCENARIOS[0])
QUICK_TURNS = 3
QUICK_DATES_PER_PAIR = 3

QUICK_SEEDS = [
    "I think this is us, right?",
    "Okay, this place is busier than I expected.",
    "I got here early and immediately forgot how to act casual.",
]

def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))

def _overlap(a: list[str], b: list[str]) -> float:
    left = set()
    right = set()
    for item in a:
        left.update(_tokens(item))
    for item in b:
        right.update(_tokens(item))
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)

def _score_transcript(target: Profile, candidate: Profile, msgs: list[dict]) -> float:
    joined = " ".join(m["text"] for m in msgs).lower()
    question_count = joined.count("?")
    repair_words = sum(joined.count(w) for w in ["sorry", "fair", "makes sense", "i get", "tell me", "what do you mean"])
    curiosity_words = sum(joined.count(w) for w in ["why", "how", "what", "tell me", "curious"])
    transcript_len = min(1.0, sum(len(m["text"]) for m in msgs) / 900)
    shared_values = _overlap(target.values, candidate.values)
    shared_interests = _overlap(target.interests, candidate.interests)
    base = (
        52
        + min(question_count, 6) * 3.0
        + min(repair_words, 5) * 2.5
        + min(curiosity_words, 8) * 1.2
        + transcript_len * 8
        + shared_values * 12
        + shared_interests * 8
    )
    return max(35.0, min(92.0, base))

def _quick_scenario(run_idx: int) -> dict:
    variants = [
        "The line is long, so they start talking before ordering.",
        "The first table is too loud, so they decide whether to move.",
        "One person admits they almost cancelled because the day was chaotic.",
    ]
    return {
        **QUICK_SCENARIO,
        "max_turns": QUICK_TURNS,
        "opener_prompt": (
            f"{QUICK_SCENARIO['opener_prompt']}\n\n"
            f"Quick-date variation: {variants[run_idx % len(variants)]}"
        ),
    }

async def _quick_score_once(target: Profile, candidate: Profile, sem: asyncio.Semaphore, run_idx: int) -> float:
    async with sem:
        scenario = _quick_scenario(run_idx)
        state = {
            "profile_a": target.model_dump(),
            "profile_b": candidate.model_dump(),
            "scenario": scenario,
            "msgs": [],
            "turn": 0,
            "max_turns": QUICK_TURNS,
            "finished": False,
            "seed_user_message": QUICK_SEEDS[run_idx % len(QUICK_SEEDS)],
        }
        try:
            result = await run_simulation(state)
            return _score_transcript(target, candidate, result["msgs"])
        except Exception:
            return 50.0

async def _quick_score(target: Profile, candidate: Profile, sem: asyncio.Semaphore) -> tuple[Profile, float]:
    scores = await asyncio.gather(*[
        _quick_score_once(target, candidate, sem, run_idx=i)
        for i in range(QUICK_DATES_PER_PAIR)
    ])
    return (candidate, round(sum(scores) / len(scores), 1))

async def l2_medium_rank(target: Profile, candidates: list[Profile], top_k: int = 10) -> list[tuple[Profile, float]]:
    """
    Run 3 short first-date simulations against each candidate, return ranked
    (candidate, score) tuples by averaged interaction score.
    """
    if not candidates:
        return []
    sem = asyncio.Semaphore(15)
    scored = await asyncio.gather(*[_quick_score(target, c, sem) for c in candidates])
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]

async def l2_medium_filter(target: Profile, candidates: list[Profile], top_k: int = 10) -> list[Profile]:
    """Compatibility wrapper: return only profiles."""
    scored = await l2_medium_rank(target, candidates, top_k=top_k)
    return [c for c, _ in scored[:top_k]]
