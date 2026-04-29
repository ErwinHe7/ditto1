import statistics
from app.models import ScenarioResult, CompatibilityReport, Profile
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

async def aggregate(scenario_results: list[ScenarioResult], pa: Profile, pb: Profile) -> CompatibilityReport:
    all_overalls = [s.overall for sr in scenario_results for s in sr.judge_scores]

    for sr in scenario_results:
        scores = [s.overall for s in sr.judge_scores]
        sr.avg_score = round(statistics.mean(scores), 1) if scores else 50.0
        # with 2 judges trimmed = avg of the two (no outlier to drop); keep field consistent
        sr.trimmed_avg_score = sr.avg_score

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
    return CompatibilityReport(
        profile_a=pa, profile_b=pb,
        scenario_results=scenario_results,
        overall_score=overall,
        trimmed_overall_score=trimmed_overall,
        confidence=confidence,
        recommendation=rec,
        summary=summary
    )
