import asyncio
import json
import os
from app.models import Profile, ScenarioResult, CompatibilityReport, BestMatch
from app.graph.builder import run_simulation
from app.graph.state import SimulationState
from app.scenarios.definitions import SCENARIOS
from app.scoring.judges import judge_chemistry, judge_values
from app.scoring.aggregator import aggregate

N_LOOPS = 3
ACTIVE_SCENARIO_IDS = {
    "first_coffee",
    "late_night_vulnerable",
    "minor_conflict",
    "support_under_stress",
}
ACTIVE_SCENARIOS = [s for s in SCENARIOS if s["id"] in ACTIVE_SCENARIO_IDS]

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

def _norm_items(items: list[str]) -> set[str]:
    return {item.strip().lower() for item in items if item and item.strip()}

def _overlap_score(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 50.0
    if not a or not b:
        return 20.0
    return 100.0 * len(a & b) / len(a | b)

def _text_overlap_score(a: Profile, b: Profile) -> float:
    left = f"{a.bio} {a.communication_style} {a.looking_for}".lower().replace(",", " ")
    right = f"{b.bio} {b.communication_style} {b.looking_for}".lower().replace(",", " ")
    stop = {"and", "the", "for", "with", "who", "that", "this", "you", "someone", "looking"}
    a_words = {w for w in left.split() if len(w) > 3 and w not in stop}
    b_words = {w for w in right.split() if len(w) > 3 and w not in stop}
    return _overlap_score(a_words, b_words)

def _profile_affinity(person: Profile, candidate: Profile) -> float:
    interest_score = _overlap_score(_norm_items(person.interests), _norm_items(candidate.interests))
    values_score = _overlap_score(_norm_items(person.values), _norm_items(candidate.values))
    text_score = _text_overlap_score(person, candidate)
    age_score = max(0.0, 100.0 - abs(person.age - candidate.age) * 7.0)
    return 0.35 * values_score + 0.25 * interest_score + 0.25 * text_score + 0.15 * age_score

async def _find_best_matches(pa: Profile, pb: Profile, candidates: list[Profile]) -> dict:
    def score_one(person: Profile, candidate: Profile):
        return BestMatch(
            name=candidate.name,
            score=round(_profile_affinity(person, candidate), 1),
            bio=candidate.bio[:100],
            tag=candidate.communication_style,
        )

    others = [p for p in candidates if p.name not in (pa.name, pb.name)]

    pa_scores = [score_one(pa, c) for c in others]
    pb_scores = [score_one(pb, c) for c in others]

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
    total_scenarios = len(ACTIVE_SCENARIOS)

    scenario_results = []
    for i, scenario in enumerate(ACTIVE_SCENARIOS):
        if on_progress:
            on_progress(f"scenario {i+1}/{total_scenarios}: {scenario['name']} ({n} loops)")

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
        on_progress("ranking candidate pool for best matches...")

    all_profiles = _load_all_profiles()
    best = await _find_best_matches(pa, pb, all_profiles)

    return report.model_copy(update={
        "pa_best_matches": best["pa_best"],
        "pb_best_matches": best["pb_best"],
    })
