import asyncio
import json
import os
from app.models import Profile, ScenarioResult, CompatibilityReport, BestMatch
from app.graph.builder import run_simulation
from app.graph.state import SimulationState
from app.scenarios.definitions import SCENARIOS
from app.scoring.judges import judge_chemistry, judge_values
from app.scoring.aggregator import aggregate
from app.config import settings

N_LOOPS = 5

async def _run_sim(pa: Profile, pb: Profile, scenario: dict, sem: asyncio.Semaphore) -> list[dict]:
    async with sem:
        state: SimulationState = {
            "profile_a": pa.model_dump(),
            "profile_b": pb.model_dump(),
            "scenario": scenario,
            "msgs": [],
            "turn": 0,
            "max_turns": scenario["max_turns"],
            "finished": False,
        }
        result = await run_simulation(state)
        return result["msgs"]

async def _judge_transcript(transcript, pa_d, pb_d, sem: asyncio.Semaphore) -> list:
    async with sem:
        scores = await asyncio.gather(
            judge_chemistry(transcript, pa_d, pb_d),
            judge_values(transcript, pa_d, pb_d),
        )
        return list(scores)

async def _quick_score(pa: Profile, pb: Profile, sem: asyncio.Semaphore) -> float:
    scenario = SCENARIOS[0]  # first_coffee — fastest
    transcript = await _run_sim(pa, pb, scenario, sem)
    scores = await asyncio.gather(
        judge_chemistry(transcript, pa.model_dump(), pb.model_dump()),
        judge_values(transcript, pa.model_dump(), pb.model_dump()),
    )
    return sum(s.overall for s in scores) / 2

async def _find_best_matches(pa: Profile, pb: Profile, candidates: list[Profile], sem: asyncio.Semaphore) -> dict:
    async def score_one(person: Profile, candidate: Profile):
        try:
            s = await _quick_score(person, candidate, sem)
            return BestMatch(name=candidate.name, score=round(s, 1),
                             bio=candidate.bio[:100], tag=candidate.communication_style)
        except Exception as e:
            import traceback; traceback.print_exc()
            return None

    others = [p for p in candidates if p.name not in (pa.name, pb.name)]

    pa_scores = [r for r in await asyncio.gather(*[score_one(pa, c) for c in others]) if r]
    pb_scores = [r for r in await asyncio.gather(*[score_one(pb, c) for c in others]) if r]

    return {
        "pa_best": sorted(pa_scores, key=lambda x: x.score, reverse=True)[:2],
        "pb_best": sorted(pb_scores, key=lambda x: x.score, reverse=True)[:2],
    }

def _load_all_profiles() -> list[Profile]:
    path = os.path.join(os.path.dirname(__file__), "../../sample_profiles.json")
    with open(os.path.abspath(path)) as f:
        return [Profile(**p) for p in json.load(f)]

async def run_l3_deep_match(pa: Profile, pb: Profile, n_sims=None, on_progress=None) -> CompatibilityReport:
    n = n_sims or N_LOOPS
    sem = asyncio.Semaphore(30)
    pa_d, pb_d = pa.model_dump(), pb.model_dump()

    scenario_results = []
    for i, scenario in enumerate(SCENARIOS):
        if on_progress:
            on_progress(f"scenario {i+1}/6: {scenario['name']} ({n} loops)")

        transcripts = await asyncio.gather(*[_run_sim(pa, pb, scenario, sem) for _ in range(n)])
        batches = await asyncio.gather(*[_judge_transcript(t, pa_d, pb_d, sem) for t in transcripts])
        all_scores = [s for b in batches for s in b]

        scenario_results.append(ScenarioResult(
            scenario_id=scenario["id"],
            scenario_name=scenario["name"],
            transcripts=[list(t) for t in transcripts],
            judge_scores=all_scores,
            avg_score=0.0,
            trimmed_avg_score=0.0,
        ))

    report = await aggregate(scenario_results, pa, pb)

    if on_progress:
        on_progress("scanning candidate pool for best matches...")

    all_profiles = _load_all_profiles()
    best = await _find_best_matches(pa, pb, all_profiles, sem)

    # rebuild report with best matches included (Pydantic model_copy)
    return report.model_copy(update={
        "pa_best_matches": best["pa_best"],
        "pb_best_matches": best["pb_best"],
    })
