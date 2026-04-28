const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export interface Profile {
  name: string
  age: number
  gender: string
  bio: string
  interests: string[]
  communication_style: string
  values: string[]
  deal_breakers: string[]
  looking_for: string
}

export interface JudgeScore {
  judge_id: string
  chemistry: number
  values_alignment: number
  energy_match: number
  conflict_handling: number
  curiosity: number
  overall: number
  reasoning: string
}

export interface ScenarioResult {
  scenario_id: string
  scenario_name: string
  transcripts: Array<Array<{ speaker: string; text: string }>>
  judge_scores: JudgeScore[]
  avg_score: number
  trimmed_avg_score: number
}

export interface CompatibilityReport {
  profile_a: Profile
  profile_b: Profile
  scenario_results: ScenarioResult[]
  overall_score: number
  trimmed_overall_score: number
  confidence: number
  recommendation: "strong_match" | "promising" | "uncertain" | "skip"
  summary: string
  pa_best_matches: BestMatch[]
  pb_best_matches: BestMatch[]
}

export interface MatchStatus {
  job_id: string
  status: "pending" | "running" | "done" | "error" | "not_found"
  progress: string
  report?: CompatibilityReport | { pa_best: BestMatch[]; pb_best: BestMatch[] }
  error_detail?: string
}

export interface BestMatch {
  name: string
  score: number
  bio: string
  tag: string
}

export async function startMatch(pa: Profile, pb: Profile): Promise<{ job_id: string }> {
  const r = await fetch(`${BASE}/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_a: pa, profile_b: pb }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getMatch(jobId: string): Promise<MatchStatus> {
  const r = await fetch(`${BASE}/match/${jobId}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

export async function getSampleProfiles(): Promise<Profile[]> {
  try {
    const r = await fetch(`${BASE}/sample-profiles`)
    if (!r.ok) return []
    return r.json()
  } catch { return [] }
}

export async function startBestMatches(pa: Profile, pb: Profile, allProfiles: Profile[]): Promise<{ job_id: string }> {
  const r = await fetch(`${BASE}/best-matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_a: pa, profile_b: pb, all_profiles: allProfiles }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
