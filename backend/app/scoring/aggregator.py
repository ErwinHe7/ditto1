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
        # trimmed: drop highest + lowest if 3+ judges
        if len(scores) >= 3:
            sr.trimmed_avg_score = round(statistics.mean(sorted(scores)[1:-1]), 1)
        else:
            sr.trimmed_avg_score = sr.avg_score

    overall = round(statistics.mean(all_overalls)) if all_overalls else 50
    std = statistics.stdev(all_overalls) if len(all_overalls) > 1 else 15
    confidence = round(max(0.1, min(1.0, 1.0 - std / 40)), 2)

    # trimmed overall: per-scenario trimmed avg
    trimmed_overalls = [sr.trimmed_avg_score for sr in scenario_results]
    trimmed_overall = round(statistics.mean(trimmed_overalls)) if trimmed_overalls else overall

    if overall >= 75 and confidence >= 0.7:
        rec = "strong_match"
    elif overall >= 65:
        rec = "promising"
    elif overall >= 50:
        rec = "uncertain"
    else:
        rec = "skip"

    summary = await generate_summary(scenario_results, pa, pb)
    return CompatibilityReport(
        profile_a=pa, profile_b=pb,
        scenario_results=scenario_results,
        overall_score=overall,
        trimmed_overall_score=trimmed_overall,
        confidence=confidence,
        recommendation=rec,
        summary=summary
    )
