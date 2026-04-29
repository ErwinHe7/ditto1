import asyncio
import json
import os
import math
import re
from app.models import Profile, ScenarioResult, CompatibilityReport, BestMatch, ScoutMatch, JudgeScore
from app.graph.builder import run_simulation
from app.graph.state import SimulationState
from app.scenarios.definitions import SCENARIOS
from app.scoring.judges import judge_chemistry, judge_values
from app.scoring.aggregator import aggregate

N_LOOPS = 7
ACTIVE_SCENARIO_IDS = {
    "first_coffee",
    "late_night_vulnerable",
    "minor_conflict",
    "support_under_stress",
}
ACTIVE_SCENARIOS = [s for s in SCENARIOS if s["id"] in ACTIVE_SCENARIO_IDS]

SCENARIO_VARIANTS = {
    "first_coffee": [
        "A rainy afternoon; one person arrives damp and mildly embarrassed.",
        "The cafe is crowded and the only open table is near the espresso machine.",
        "One person is five minutes late but texts an honest apology first.",
        "The barista mixes up an order, giving them an easy first joke.",
        "They both notice the playlist at the same time, but have opposite takes.",
        "One person came straight from class or work and is still switching gears.",
        "They meet at an outdoor table and a nearby conversation keeps interrupting.",
    ],
    "late_night_vulnerable": [
        "One person is awake after an anxious dream and texts first.",
        "A song sends one person into an old memory they did not expect.",
        "One person is stuck finishing work and admits they feel behind in life.",
        "A photo from years ago makes one person miss who they used to be.",
        "One person nearly sends a guarded answer, then decides to be honest.",
        "A family stressor comes up and the conversation gets softer than usual.",
        "Both are tired enough that jokes fall away and sincerity becomes easier.",
    ],
    "minor_conflict": [
        "They disagree about whether ambition should dominate your twenties.",
        "They disagree about spending money on experiences versus saving aggressively.",
        "They disagree about whether routines are grounding or suffocating.",
        "They disagree about how much partners should merge friend groups.",
        "They disagree about whether art and work should be practical.",
        "They disagree about taking risks when the outcome is uncertain.",
        "They disagree about family obligations and personal independence.",
    ],
    "support_under_stress": [
        "One person had a bad critique or review and feels exposed.",
        "One person lost a work opportunity and is trying not to spiral.",
        "One person is exhausted from family pressure and needs gentleness.",
        "One person is disappointed in themself and expects judgment.",
        "One person is physically tired and emotionally thin after a long day.",
        "One person is grieving a small loss they feel silly naming.",
        "One person asks for company but does not know how to ask for help.",
    ],
}

def _scenario_for_loop(scenario: dict, loop_idx: int) -> dict:
    variants = SCENARIO_VARIANTS.get(scenario["id"], [])
    if not variants:
        return scenario
    variant = variants[loop_idx % len(variants)]
    return {
        **scenario,
        "description": f"{scenario['description']} Variation: {variant}",
        "opener_prompt": (
            f"{scenario['opener_prompt']}\n\n"
            f"Loop variation: {variant}\n"
            "Do not reuse a generic opening. Start from this concrete situation."
        ),
    }

def _seed_for_loop(scenario: dict, loop_idx: int) -> str:
    seeds = {
        "first_coffee": [
            "I think this is us, right?",
            "Hey, sorry, is this seat taken?",
            "Okay, first impression: this place is louder than I expected.",
            "I ordered before I got nervous and changed my mind.",
            "You found the place okay?",
            "I was trying to look casual and absolutely failed.",
            "This playlist is doing a lot right now.",
        ],
        "late_night_vulnerable": [
            "You still awake?",
            "I know it's late, but my brain will not turn off.",
            "Can I say something kind of real?",
            "I found an old photo and now I'm weirdly sad.",
            "This is maybe too much for 2am, but...",
            "I almost didn't text this.",
            "Are you in the mood for a real answer?",
        ],
        "minor_conflict": [
            "Okay, I might disagree with you on this.",
            "Wait, do you actually believe that?",
            "That makes sense, but I see it differently.",
            "I don't want to fake agree here.",
            "This is one of those things I care about more than I expected.",
            "Can I push back a little?",
            "I think this is where we're different.",
        ],
        "support_under_stress": [
            "I had a rough day and I don't want to pretend I didn't.",
            "Can I be low-energy tonight?",
            "I think I need a minute before I can be normal.",
            "Today got to me more than I expected.",
            "I don't need you to fix it, but I don't want to be alone with it.",
            "I'm embarrassed by how much this bothered me.",
            "I could use a softer conversation tonight.",
        ],
    }
    options = seeds.get(scenario["id"], ["Hey."])
    return options[loop_idx % len(options)]

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

async def _run_sim(pa: Profile, pb: Profile, scenario: dict, sem: asyncio.Semaphore, loop_idx: int = 0) -> list[dict]:
    async with sem:
        varied_scenario = _scenario_for_loop(scenario, loop_idx)
        state: SimulationState = {
            "profile_a": pa.model_dump(),
            "profile_b": pb.model_dump(),
            "scenario": varied_scenario,
            "msgs": [],
            "turn": 0,
            "max_turns": varied_scenario["max_turns"],
            "finished": False,
            "seed_user_message": _seed_for_loop(scenario, loop_idx),
        }
        try:
            result = await run_simulation(state)
            return result["msgs"]
        except Exception:
            return [
                {"speaker": "A", "text": _seed_for_loop(scenario, loop_idx)},
                {"speaker": "B", "text": "I want to answer that properly. Tell me a little more about what you mean."},
            ]

async def _judge_transcript(transcript, pa_d, pb_d, sem: asyncio.Semaphore) -> list:
    async with sem:
        try:
            scores = await asyncio.gather(
                judge_chemistry(transcript, pa_d, pb_d),
                judge_values(transcript, pa_d, pb_d),
            )
            return list(scores)
        except Exception:
            fallback_reason = "A transient judge/model error occurred, so Ditto used a conservative fallback score for this loop."
            return [
                JudgeScore(
                    judge_id="chemistry",
                    chemistry=50,
                    values_alignment=50,
                    energy_match=50,
                    conflict_handling=50,
                    curiosity=50,
                    overall=50,
                    reasoning=fallback_reason,
                ),
                JudgeScore(
                    judge_id="values",
                    chemistry=50,
                    values_alignment=50,
                    energy_match=50,
                    conflict_handling=50,
                    curiosity=50,
                    overall=50,
                    reasoning=fallback_reason,
                ),
            ]

async def _run_scenario_batch(
    scenario: dict,
    scenario_idx: int,
    total_scenarios: int,
    n: int,
    pa: Profile,
    pb: Profile,
    pa_d: dict,
    pb_d: dict,
    sem: asyncio.Semaphore,
    on_progress=None,
) -> ScenarioResult:
    if on_progress:
        on_progress(f"scenario {scenario_idx+1}/{total_scenarios}: {scenario['name']} ({n} loops)")

    transcripts = await asyncio.gather(*[_run_sim(pa, pb, scenario, sem, loop_idx=i) for i in range(n)])
    batches = await asyncio.gather(*[_judge_transcript(t, pa_d, pb_d, sem) for t in transcripts])
    all_scores = [s for b in batches for s in b]

    return ScenarioResult(
        scenario_id=scenario["id"],
        scenario_name=scenario["name"],
        transcripts=[list(t) for t in transcripts],
        judge_scores=all_scores,
        avg_score=0.0,
        trimmed_avg_score=0.0,
    )

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

def _top_dimension(profile: Profile) -> str:
    vector = _dimension_vector(profile)
    if not vector:
        return "their world"
    return max(vector.items(), key=lambda item: item[1])[0].replace("_", " ")

def _shared_labels(a: list[str], b: list[str]) -> list[str]:
    b_tokens = _norm_items(b)
    shared = []
    for item in a:
        if _tokens(item) & b_tokens:
            shared.append(item)
    return shared

def _opposite_gender_candidates(person: Profile, candidates: list[Profile]) -> list[Profile]:
    gender = person.gender.lower()
    if gender == "female":
        return [candidate for candidate in candidates if candidate.gender.lower() == "male"]
    if gender == "male":
        return [candidate for candidate in candidates if candidate.gender.lower() == "female"]
    return candidates

def _match_reason(person: Profile, candidate: Profile) -> str:
    shared_values = _shared_labels(person.values, candidate.values)
    shared_interests = _shared_labels(person.interests, candidate.interests)
    if shared_values:
        return f"Shared value signal around {', '.join(shared_values[:2])}, with enough contrast to test in simulation."
    if shared_interests:
        return f"Shared interest signal around {', '.join(shared_interests[:2])}, plus compatible conversation texture."
    return f"Strong {_top_dimension(person)} to {_top_dimension(candidate)} profile resonance from the pool scan."

def _affection_boosters(person: Profile, candidate: Profile) -> list[str]:
    tips = []
    if candidate.interests:
        tips.append(f"Ask one specific follow-up about {candidate.interests[0]} instead of giving a generic compliment.")
    if candidate.values:
        tips.append(f"Show {candidate.values[0]} through a concrete choice or story, not a claim.")
    if candidate.communication_style:
        tips.append(f"Meet their communication rhythm: {candidate.communication_style}.")
    if candidate.deal_breakers:
        tips.append(f"Avoid their likely turnoff: {candidate.deal_breakers[0]}.")
    return tips[:3]

def _pair_affection_tips(pa: Profile, pb: Profile) -> list[str]:
    return [
        f"For {pb.name}: {_affection_boosters(pa, pb)[0] if _affection_boosters(pa, pb) else 'Ask a concrete follow-up and make room for their pace.'}",
        f"For {pa.name}: {_affection_boosters(pb, pa)[0] if _affection_boosters(pb, pa) else 'Reflect back one detail they care about before changing topics.'}",
        "Across the next chat: reward vulnerability with curiosity before advice.",
    ]

def _affection_score(report: CompatibilityReport) -> int:
    scores = []
    for sr in report.scenario_results:
        for judge in sr.judge_scores:
            scores.append(
                0.45 * judge.chemistry
                + 0.35 * judge.curiosity
                + 0.20 * judge.energy_match
            )
    if not scores:
        return 50
    return round(sum(scores) / len(scores))

def _to_scout_match(person: Profile, candidate: Profile, score: float) -> ScoutMatch:
    return ScoutMatch(
        name=candidate.name,
        age=candidate.age,
        score=round(score, 1),
        bio=candidate.bio[:140],
        tag=candidate.communication_style,
        gender=candidate.gender,
        why=_match_reason(person, candidate),
        boosters=_affection_boosters(person, candidate),
        profile=candidate,
    )

def scout_profile_matches_from_scores(
    person: Profile,
    scored_candidates: list[tuple[Profile, float]],
    top_n: int = 3,
) -> list[ScoutMatch]:
    return [_to_scout_match(person, candidate, score) for candidate, score in scored_candidates[:top_n]]

def scout_profile_matches(person: Profile, candidates: list[Profile], top_n: int = 3) -> list[ScoutMatch]:
    others = [p for p in candidates if p.name.lower() != person.name.lower()]
    eligible = _opposite_gender_candidates(person, others)
    if not eligible:
        eligible = others
    raw_scores = [(candidate, _profile_affinity(person, candidate)) for candidate in eligible]
    raw_values = [score for _, score in raw_scores]
    minimum = min(raw_values, default=0.0)
    maximum = max(raw_values, default=1.0)
    ranked = []
    for candidate, raw in raw_scores:
        score = _calibrated_score(raw, minimum, maximum)
        ranked.append(_to_scout_match(person, candidate, score))
    return sorted(ranked, key=lambda x: x.score, reverse=True)[:top_n]

async def _find_best_matches(pa: Profile, pb: Profile, candidates: list[Profile]) -> dict:
    def score_candidates(person: Profile):
        eligible = _opposite_gender_candidates(person, others)
        if not eligible:
            eligible = others
        raw_scores = [(candidate, _profile_affinity(person, candidate)) for candidate in eligible]
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
            gender=candidate.gender,
        )

    others = [p for p in candidates if p.name not in (pa.name, pb.name)]

    pa_scores = score_candidates(pa)
    pb_scores = score_candidates(pb)

    return {
        "pa_best": sorted(pa_scores, key=lambda x: x.score, reverse=True)[:3],
        "pb_best": sorted(pb_scores, key=lambda x: x.score, reverse=True)[:3],
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

    scenario_results = await asyncio.gather(*[
        _run_scenario_batch(scenario, i, total_scenarios, n, pa, pb, pa_d, pb_d, sem, on_progress)
        for i, scenario in enumerate(ACTIVE_SCENARIOS)
    ])

    report = await aggregate(scenario_results, pa, pb)

    if on_progress:
        on_progress("ranking candidate pool for best matches...")

    all_profiles = _load_all_profiles()
    best = await _find_best_matches(pa, pb, all_profiles)

    return report.model_copy(update={
        "affection_score": _affection_score(report),
        "affection_tips": _pair_affection_tips(pa, pb),
        "pa_best_matches": best["pa_best"],
        "pb_best_matches": best["pb_best"],
    })


async def find_top_matches_via_simulation(
    target: Profile,
    candidates: list[Profile],
    top_n: int = 3,
    on_progress=None,
) -> list[CompatibilityReport]:
    """
    Tiered auto-matching: L1 coarse -> L2 light sim -> L3 deep sim.

      L1 (ms):  embedding-style cosine over the full candidate pool   -> top 100
      L2 (s):   1 scenario x 3 short dates per pair                   -> top 10
      L3 (min): full ACTIVE_SCENARIOS x N_LOOPS x judges per pair      -> ranked top_n

    Returns top_n CompatibilityReports, sorted by overall_score desc.
    Each report carries the same fields as run_l3_deep_match output (transcripts,
    judge scores, affection tips, etc.) so the existing match UI can render them.
    """
    from app.pipeline.l1_coarse import l1_coarse_filter
    from app.pipeline.l2_medium import l2_medium_filter

    pool = [c for c in candidates if c.name.lower() != target.name.lower()]

    if on_progress:
        on_progress(f"L1 coarse scan over {len(pool)} candidates...")
    l1_pool = await l1_coarse_filter(target, pool, top_k=100)

    if on_progress:
        on_progress(f"L2 light simulation across {len(l1_pool)} candidates...")
    l2_pool = await l2_medium_filter(target, l1_pool, top_k=10)

    reports: list[CompatibilityReport] = []
    for i, candidate in enumerate(l2_pool):
        if on_progress:
            on_progress(f"L3 deep date {i+1}/{len(l2_pool)}: {target.name} x {candidate.name}")
        try:
            report = await run_l3_deep_match(target, candidate, on_progress=None)
            reports.append(report)
        except Exception as e:
            if on_progress:
                on_progress(f"  skipped {candidate.name}: {e}")

    reports.sort(key=lambda r: r.overall_score, reverse=True)
    return reports[:top_n]
