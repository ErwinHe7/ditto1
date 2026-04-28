import asyncio
import json
import os
from app.models import Profile, ScenarioResult, CompatibilityReport
from app.graph.builder import run_simulation
from app.graph.state import SimulationState
from app.scenarios.definitions import SCENARIOS
from app.scoring.judges import judge_chemistry, judge_values
from app.scoring.aggregator import aggregate
from app.config import settings

N_LOOPS = 10  # simulations per scenario

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
    """Single scenario × 1 sim × 2 judges — fast candidate screening."""
    scenario = SCENARIOS[0]  # first_coffee
    transcript = await _run_sim(pa, pb, scenario, sem)
    scores = await asyncio.gather(
        judge_chemistry(transcript, pa.model_dump(), pb.model_dump()),
        judge_values(transcript, pa.model_dump(), pb.model_dump()),
    )
    return sum(s.overall for s in scores) / len(scores)

async def _find_best_matches(
    pa: Profile, pb: Profile, all_profiles: list[Profile], sem: asyncio.Semaphore
) -> dict:
    """For each person, score against every other candidate and return top 2."""
    candidates = [p for p in all_profiles if p.name not in (pa.name, pb.name)]

    async def score_pair(person: Profile, candidate: Profile):
        try:
            s = await _quick_score(person, candidate, sem)
            return {"name": candidate.name, "score": round(s, 1),
                    "bio": candidate.bio[:100], "tag": candidate.communication_style}
        except Exception:
            return None

    pa_tasks = [score_pair(pa, c) for c in candidates]
    pb_tasks = [score_pair(pb, c) for c in candidates]

    pa_results = [r for r in await asyncio.gather(*pa_tasks) if r]
    pb_results = [r for r in await asyncio.gather(*pb_tasks) if r]

    return {
        "pa_best": sorted(pa_results, key=lambda x: x["score"], reverse=True)[:2],
        "pb_best": sorted(pb_results, key=lambda x: x["score"], reverse=True)[:2],
    }

def _load_all_profiles() -> list[Profile]:
    path = os.path.join(os.path.dirname(__file__), "../../sample_profiles.json")
    with open(os.path.abspath(path)) as f:
        return [Profile(**p) for p in json.load(f)]

async def run_l3_deep_match(
    pa: Profile, pb: Profile,
    n_sims: int | None = None,
    on_progress=None
) -> CompatibilityReport:
    n = n_sims or N_LOOPS
    sem = asyncio.Semaphore(settings.llm_concurrency)
    pa_d = pa.model_dump()
    pb_d = pb.model_dump()

    scenario_results = []
    for i, scenario in enumerate(SCENARIOS):
        if on_progress:
            on_progress(f"scenario {i+1}/{len(SCENARIOS)}: {scenario['name']} ({n} loops)")

        # run N simulations concurrently
        transcripts = await asyncio.gather(*[_run_sim(pa, pb, scenario, sem) for _ in range(n)])

        # judge each transcript (2 judges each)
        judge_batches = await asyncio.gather(*[_judge_transcript(t, pa_d, pb_d, sem) for t in transcripts])
        all_scores = [s for batch in judge_batches for s in batch]

        scenario_results.append(ScenarioResult(
            scenario_id=scenario["id"],
            scenario_name=scenario["name"],
            transcripts=[list(t) for t in transcripts],
            judge_scores=all_scores,
            avg_score=0.0,
            trimmed_avg_score=0.0,
        ))

    report = await aggregate(scenario_results, pa, pb)

    # best-match scan against the full pool
    if on_progress:
        on_progress("scanning candidate pool for best matches...")
    try:
        all_profiles = _load_all_profiles()
        best = await _find_best_matches(pa, pb, all_profiles, sem)
        report.pa_best_matches = best["pa_best"]
        report.pb_best_matches = best["pb_best"]
    except Exception:
        report.pa_best_matches = []
        report.pb_best_matches = []

    return report
