import statistics
from app.models import BehaviorImpact, MatchBreakdown, ScenarioResult, CompatibilityReport, Profile
from app.agents.llm import chat, SUMMARY_MODEL

async def generate_summary(scenario_results, pa: Profile, pb: Profile) -> str:
    snippets = []
    for sr in scenario_results:
        for js in sr.judge_scores[:2]:
            snippets.append(f"[{sr.scenario_name}/{js.judge_id}] {js.reasoning}")
    prompt = (f"Summarize the romantic compatibility between {pa.name} and {pb.name} "
              f"in 3-5 sentences based on these AI judge evaluations:\n\n" + "\n".join(snippets[:20]))
    return await chat(
        [{"role": "system", "content": "Write concise, specific dating compatibility summaries. Be direct and honest."},
         {"role": "user", "content": prompt}],
        model=SUMMARY_MODEL, temperature=0.5, max_tokens=250
    )

def _mean(values: list[float], fallback: float = 50.0) -> float:
    return statistics.mean(values) if values else fallback

def _profile_anchor(profile: Profile, fallback: str) -> str:
    if profile.values:
        return profile.values[0]
    if profile.interests:
        return profile.interests[0]
    return fallback

def _impact_reason(pa: Profile, pb: Profile, chemistry: float, curiosity: float, conflict: float) -> str:
    if curiosity >= 75 and chemistry >= 70:
        return f"{pa.name} asked specific follow-ups and made {pb.name}'s world feel welcome."
    if conflict >= 72:
        return f"{pa.name} stayed curious during tension instead of trying to win the point."
    if curiosity < 52:
        return f"{pa.name} did not ask enough follow-ups before shifting the topic."
    if conflict < 52:
        return f"The exchange got a little positional, so emotional safety dipped."
    return f"The chat created steady warmth, but could use one more concrete moment of curiosity."

def _behavior_impacts(sr: ScenarioResult, pa: Profile, pb: Profile) -> list[BehaviorImpact]:
    if not sr.transcripts:
        return []
    judges_per_loop = max(1, len(sr.judge_scores) // len(sr.transcripts))
    impacts: list[BehaviorImpact] = []
    for idx, _ in enumerate(sr.transcripts):
        scores = sr.judge_scores[idx * judges_per_loop:(idx + 1) * judges_per_loop]
        chemistry = _mean([s.chemistry for s in scores])
        curiosity = _mean([s.curiosity for s in scores])
        conflict = _mean([s.conflict_handling for s in scores])
        interest = 0.45 * chemistry + 0.35 * curiosity + 0.20 * _mean([s.energy_match for s in scores])
        delta = round(max(-10, min(10, (interest - 60) / 4)))
        target = pb.name if idx % 2 == 0 else pa.name
        actor = pa if target == pb.name else pb
        recipient = pb if target == pb.name else pa
        impacts.append(BehaviorImpact(
            loop_index=idx,
            target=target,
            delta=delta,
            reason=_impact_reason(actor, recipient, chemistry, curiosity, conflict),
        ))
    return impacts

def _long_term_risk(values_alignment: int, conflict_handling: int, energy_match: int) -> str:
    if values_alignment < 58:
        return "Core values may diverge under bigger life decisions."
    if conflict_handling < 58:
        return "Disagreements may feel sharper than the chemistry can absorb."
    if energy_match < 56:
        return "Different social pace or daily rhythm could create fatigue over time."
    if values_alignment >= 72 and conflict_handling >= 70:
        return "No major long-term red flag surfaced in these simulations."
    return "The main unknown is whether early warmth survives routine stress and planning."

def _breakdown(scenario_results: list[ScenarioResult], pa: Profile, pb: Profile) -> MatchBreakdown:
    scores = [s for sr in scenario_results for s in sr.judge_scores]
    chemistry = round(_mean([s.chemistry for s in scores]))
    values_alignment = round(_mean([s.values_alignment for s in scores]))
    energy_match = round(_mean([s.energy_match for s in scores]))
    conflict_handling = round(_mean([s.conflict_handling for s in scores]))
    curiosity = round(_mean([s.curiosity for s in scores]))
    emotional_safety = round(_mean([(s.curiosity + s.conflict_handling) / 2 for s in scores]))

    increased = []
    lowered = []

    if chemistry >= 68:
        increased.append("Warm conversational chemistry and low-friction banter.")
    if curiosity >= 68:
        increased.append("Specific follow-up questions made the other person feel seen.")
    if values_alignment >= 68:
        increased.append(f"Shared value signal around {_profile_anchor(pa, 'meaning')} and {_profile_anchor(pb, 'connection')}.")
    if conflict_handling >= 68:
        increased.append("Conflict moments stayed curious rather than defensive.")
    if energy_match >= 68:
        increased.append("The pacing felt mutually energizing across several scenarios.")

    if chemistry < 60:
        lowered.append("The simulated conversations sometimes felt polite instead of magnetic.")
    if values_alignment < 62:
        lowered.append("Values alignment is the biggest unresolved compatibility question.")
    if conflict_handling < 62:
        lowered.append("Pushback moments need more validation before problem-solving.")
    if curiosity < 62:
        lowered.append("One or both people could ask more concrete follow-ups.")
    if energy_match < 62:
        lowered.append("Their day-to-day rhythm may not naturally sync without effort.")

    return MatchBreakdown(
        chemistry=chemistry,
        values_alignment=values_alignment,
        emotional_safety=emotional_safety,
        conflict_handling=conflict_handling,
        long_term_risk=_long_term_risk(values_alignment, conflict_handling, energy_match),
        score_increased=increased[:4] or ["The pair showed enough responsiveness to keep exploring."],
        score_lowered=lowered[:4] or ["No severe penalty appeared, but real-life consistency is still untested."],
    )

def _next_chat_suggestions(pa: Profile, pb: Profile, breakdown: MatchBreakdown) -> list[str]:
    pb_interest = pb.interests[0] if pb.interests else "something they mentioned"
    pa_value = pa.values[0] if pa.values else "one value you care about"
    suggestions = [
        f"Ask {pb.name} one concrete follow-up about {pb_interest}, then pause long enough for a real answer.",
        f"Share a short story that shows {pa_value} instead of naming it as a trait.",
        "If disagreement appears, reflect their point first, then offer your own view.",
    ]
    if breakdown.values_alignment < 62:
        suggestions.append("Before a real date, ask one low-pressure question about life pace and priorities.")
    if breakdown.emotional_safety >= 72:
        suggestions.append("A slightly more vulnerable prompt is likely safe with this person.")
    return suggestions[:4]

async def aggregate(scenario_results: list[ScenarioResult], pa: Profile, pb: Profile) -> CompatibilityReport:
    all_overalls = [s.overall for sr in scenario_results for s in sr.judge_scores]

    for sr in scenario_results:
        scores = [s.overall for s in sr.judge_scores]
        sr.avg_score = round(statistics.mean(scores), 1) if scores else 50.0
        # with 2 judges trimmed = avg of the two (no outlier to drop); keep field consistent
        sr.trimmed_avg_score = sr.avg_score
        sr.behavior_impacts = _behavior_impacts(sr, pa, pb)

    overall = round(statistics.mean(all_overalls)) if all_overalls else 50
    std = statistics.stdev(all_overalls) if len(all_overalls) > 1 else 15
    confidence = round(max(0.1, min(1.0, 1.0 - std / 40)), 2)
    trimmed_overall = overall  # same for 2 judges

    if overall >= 75 and confidence >= 0.7:
        rec = "strong_match"
    elif overall >= 65:
        rec = "promising"
    elif overall >= 50:
        rec = "uncertain"
    else:
        rec = "skip"

    try:
        summary = await generate_summary(scenario_results, pa, pb)
    except Exception:
        summary = (
            f"{pa.name} and {pb.name} were scored from simulated scenario transcripts, "
            "but the summary model had a transient error. Use the scenario scores and judge notes below for the detailed read."
        )
    breakdown = _breakdown(scenario_results, pa, pb)
    return CompatibilityReport(
        profile_a=pa, profile_b=pb,
        scenario_results=scenario_results,
        overall_score=overall,
        trimmed_overall_score=trimmed_overall,
        confidence=confidence,
        recommendation=rec,
        summary=summary,
        breakdown=breakdown,
        next_chat_suggestions=_next_chat_suggestions(pa, pb, breakdown),
    )
