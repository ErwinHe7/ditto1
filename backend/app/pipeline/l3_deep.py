import asyncio
from app.models import Profile, ScenarioResult
from app.graph.builder import run_simulation
from app.graph.state import SimulationState
from app.scenarios.definitions import SCENARIOS
from app.scoring.judges import judge_chemistry, judge_values, judge_holistic
from app.scoring.aggregator import aggregate
from app.config import settings

async def _run_sim(pa: Profile, pb: Profile, scenario: dict, sem: asyncio.Semaphore):
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

async def _judge_one(transcript, pa_d, pb_d, sem: asyncio.Semaphore):
    async with sem:
        scores = await asyncio.gather(
            judge_chemistry(transcript, pa_d, pb_d),
            judge_values(transcript, pa_d, pb_d),
            judge_holistic(transcript, pa_d, pb_d),
        )
        return list(scores)

async def run_l3_deep_match(pa: Profile, pb: Profile, n_sims=None, on_progress=None):
    n = n_sims or settings.n_simulations_per_scenario
    sem = asyncio.Semaphore(settings.llm_concurrency)
    pa_d = pa.model_dump()
    pb_d = pb.model_dump()

    scenario_results = []
    for i, scenario in enumerate(SCENARIOS):
        if on_progress:
            on_progress(f"scenario {i+1}/{len(SCENARIOS)}: {scenario['name']}")

        transcripts = await asyncio.gather(*[_run_sim(pa, pb, scenario, sem) for _ in range(n)])
        all_scores = []
        judge_batches = await asyncio.gather(*[_judge_one(t, pa_d, pb_d, sem) for t in transcripts])
        for batch in judge_batches:
            all_scores.extend(batch)

        scenario_results.append(ScenarioResult(
            scenario_id=scenario["id"],
            scenario_name=scenario["name"],
            transcripts=[list(t) for t in transcripts],
            judge_scores=all_scores,
            avg_score=0.0,
        ))

    return await aggregate(scenario_results, pa, pb)
