"""
L2 medium filter — lightweight simulation per pair.

Production target: 1 scenario (first_coffee) x 3 turns x 1 cheap judge.
  ~$0.001/pair on gpt-4o-mini. 100 candidates -> ~$0.10, ~20s parallel.
  Cuts the L1 pool down to a tractable Top-K for full L3 deep simulation.
"""
import asyncio
from app.models import Profile
from app.graph.builder import run_simulation
from app.scenarios.definitions import SCENARIOS
from app.scoring.judges import judge_chemistry

QUICK_SCENARIO = next((s for s in SCENARIOS if s["id"] == "first_coffee"), SCENARIOS[0])
QUICK_TURNS = 3

async def _quick_score(target: Profile, candidate: Profile, sem: asyncio.Semaphore) -> tuple[Profile, float]:
    async with sem:
        scenario = {**QUICK_SCENARIO, "max_turns": QUICK_TURNS}
        state = {
            "profile_a": target.model_dump(),
            "profile_b": candidate.model_dump(),
            "scenario": scenario,
            "msgs": [],
            "turn": 0,
            "max_turns": QUICK_TURNS,
            "finished": False,
        }
        try:
            result = await run_simulation(state)
            score = await judge_chemistry(result["msgs"], state["profile_a"], state["profile_b"])
            return (candidate, float(score.overall))
        except Exception:
            return (candidate, 50.0)

async def l2_medium_filter(target: Profile, candidates: list[Profile], top_k: int = 10) -> list[Profile]:
    """
    Run a 3-turn first_coffee simulation against each candidate, score with the
    cheap chemistry judge, return top_k by overall score.
    """
    if not candidates:
        return []
    sem = asyncio.Semaphore(15)
    scored = await asyncio.gather(*[_quick_score(target, c, sem) for c in candidates])
    scored.sort(key=lambda x: x[1], reverse=True)
    return [c for c, _ in scored[:top_k]]
