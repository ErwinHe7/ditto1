import asyncio
import json
import os
import math
import re
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

AFFINITY_DIMENSIONS = {
    "creativity": [
        "art", "artist", "design", "typography", "photography", "ceramics", "music",
        "theatre", "poetry", "film", "beauty", "aesthetic", "font", "museum", "writing",
        "writer", "creative", "creativity", "craft",
    ],
    "curiosity": [
        "philosophy", "ethics", "science", "learning", "reading", "consciousness",
        "question", "curious", "curiosity", "world", "history", "debate", "ideas",
        "intellectual", "bookstores", "books",
    ],
    "ambition": [
        "ambition", "ambitious", "startup", "building", "build", "finance", "investing",
        "career", "competitive", "plan", "discipline", "growth", "performance",
    ],
    "adventure": [
        "adventure", "adventurous", "travel", "skiing", "surfing", "hiking", "camping",
        "road", "trip", "spontaneous", "freedom", "cities", "outdoors",
    ],
    "warmth": [
        "warm", "kindness", "compassion", "community", "family", "loyalty", "listens",
        "support", "joy", "care", "people", "teacher", "education",
    ],
    "depth": [
        "deep", "depth", "emotional", "authenticity", "honesty", "truth", "meaning",
        "vulnerable", "genuine", "connection", "intimacy", "thoughtful",
    ],
    "playfulness": [
        "playful", "humor", "laugh", "comedy", "banter", "sarcastic", "fun", "jokes",
        "podcasts", "storyteller",
    ],
    "health": [
        "health", "gym", "running", "marathons", "training", "sports", "basketball",
        "ultimate", "frisbee", "yoga", "nutrition", "bouldering", "fitness",
    ],
}

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

def _profile_text(profile: Profile) -> str:
    parts = [
        profile.bio,
        profile.communication_style,
        profile.looking_for,
        " ".join(profile.interests),
        " ".join(profile.values),
        " ".join(profile.deal_breakers),
    ]
    return " ".join(parts).lower()

def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))

def _norm_items(items: list[str]) -> set[str]:
    out = set()
    for item in items:
        out.update(_tokens(item))
    return out

def _overlap_score(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 50.0
    if not a or not b:
        return 20.0
    return 100.0 * len(a & b) / len(a | b)

def _text_overlap_score(a: Profile, b: Profile) -> float:
    stop = {"and", "the", "for", "with", "who", "that", "this", "you", "someone", "looking", "about"}
    a_words = {w for w in _tokens(_profile_text(a)) if len(w) > 3 and w not in stop}
    b_words = {w for w in _tokens(_profile_text(b)) if len(w) > 3 and w not in stop}
    return _overlap_score(a_words, b_words)

def _dimension_vector(profile: Profile) -> dict[str, float]:
    text = _profile_text(profile)
    tokens = _tokens(text)
    vector = {}
    for dim, keywords in AFFINITY_DIMENSIONS.items():
        hits = 0.0
        for keyword in keywords:
            if " " in keyword:
                hits += 2.0 if keyword in text else 0.0
            else:
                hits += 1.0 if keyword in tokens else 0.0
        vector[dim] = min(1.0, hits / 4.0)
    return vector

def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    dot = sum(a[k] * b[k] for k in a)
    a_mag = math.sqrt(sum(v * v for v in a.values()))
    b_mag = math.sqrt(sum(v * v for v in b.values()))
    if not a_mag or not b_mag:
        return 0.35
    return dot / (a_mag * b_mag)

def _profile_affinity(person: Profile, candidate: Profile) -> float:
    interest_score = _overlap_score(_norm_items(person.interests), _norm_items(candidate.interests))
    values_score = _overlap_score(_norm_items(person.values), _norm_items(candidate.values))
    text_score = _text_overlap_score(person, candidate)
    age_score = max(0.0, 100.0 - abs(person.age - candidate.age) * 7.0)
    semantic_score = 100.0 * _cosine(_dimension_vector(person), _dimension_vector(candidate))
    return (
        0.50 * semantic_score
        + 0.20 * values_score
        + 0.15 * interest_score
        + 0.10 * text_score
        + 0.05 * age_score
    )

def _calibrated_score(raw: float, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        relative = 0.5
    else:
        relative = (raw - minimum) / (maximum - minimum)
    score = 50.0 + raw * 0.22 + relative * 22.0
    return max(45.0, min(92.0, score))

async def _find_best_matches(pa: Profile, pb: Profile, candidates: list[Profile]) -> dict:
    def score_candidates(person: Profile):
        raw_scores = [(candidate, _profile_affinity(person, candidate)) for candidate in others]
        raw_values = [score for _, score in raw_scores]
        minimum = min(raw_values, default=0.0)
        maximum = max(raw_values, default=1.0)
        return [
            score_one(candidate, _calibrated_score(raw, minimum, maximum))
            for candidate, raw in raw_scores
        ]

    def score_one(candidate: Profile, score: float):
        return BestMatch(
            name=candidate.name,
            score=round(score, 1),
            bio=candidate.bio[:100],
            tag=candidate.communication_style,
        )

    others = [p for p in candidates if p.name not in (pa.name, pb.name)]

    pa_scores = score_candidates(pa)
    pb_scores = score_candidates(pb)

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
