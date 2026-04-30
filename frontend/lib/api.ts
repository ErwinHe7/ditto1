const BASE = process.env.NEXT_PUBLIC_API_URL || "https://backend-mocha-beta-95.vercel.app"

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
  relationship_intent?: string
  chat_history?: string
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

export interface BehaviorImpact {
  loop_index: number
  target: string
  delta: number
  reason: string
}

export interface MatchBreakdown {
  chemistry: number
  values_alignment: number
  emotional_safety: number
  conflict_handling: number
  long_term_risk: string
  score_increased: string[]
  score_lowered: string[]
}

export interface ScenarioResult {
  scenario_id: string
  scenario_name: string
  transcripts: Array<Array<{ speaker: string; text: string }>>
  judge_scores: JudgeScore[]
  avg_score: number
  trimmed_avg_score: number
  behavior_impacts?: BehaviorImpact[]
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
  breakdown?: MatchBreakdown
  next_chat_suggestions?: string[]
  affection_score?: number
  affection_tips?: string[]
  pa_best_matches: BestMatch[]
  pb_best_matches: BestMatch[]
}

export interface TopMatchesReport {
  kind: "top_matches"
  target: Profile
  pipeline: {
    candidate_pool: number
    l1_target: number
    l2_target: number
    l3_full_dates: number
    scenarios: number
    loops_per_scenario: number
  }
  reports: CompatibilityReport[]
}

export interface MatchStatus {
  job_id: string
  status: "pending" | "running" | "done" | "error" | "not_found"
  progress: string
  report?: CompatibilityReport | TopMatchesReport | { pa_best: BestMatch[]; pb_best: BestMatch[] }
  reports?: CompatibilityReport[]
  error_detail?: string
}

export interface MatchStartResponse extends MatchStatus {
  report?: CompatibilityReport
}

export interface BestMatch {
  name: string
  score: number
  bio: string
  tag: string
  gender?: string
}

export interface ScoutMatch extends BestMatch {
  age: number
  why: string
  boosters: string[]
  profile: Profile
}

export async function startMatch(pa: Profile, pb: Profile): Promise<MatchStartResponse> {
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

export interface ScoutOptions {
  topN?: number
  lookingForGender?: string
  relationshipIntent?: string
  customCandidate?: Profile | null
}

export async function scoutMatches(profile: Profile, options: ScoutOptions | number = 3): Promise<ScoutMatch[]> {
  const opts = typeof options === "number" ? { topN: options } : options
  const r = await fetch(`${BASE}/scout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      top_n: opts.topN ?? 3,
      looking_for_gender: opts.lookingForGender ?? "opposite",
      relationship_intent: opts.relationshipIntent ?? "any",
      custom_candidate: opts.customCandidate ?? null,
    }),
  })
  if (!r.ok) throw new Error(await r.text())
  const data = await r.json()
  return data.matches || []
}

export async function findTopMatches(profile: Profile, options: ScoutOptions = {}): Promise<{ job_id: string; report?: TopMatchesReport; reports?: CompatibilityReport[]; status: string; progress: string; error_detail?: string }> {
  const r = await fetch(`${BASE}/match/top`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      top_n: options.topN ?? 3,
      looking_for_gender: options.lookingForGender ?? "opposite",
      relationship_intent: options.relationshipIntent ?? "any",
      custom_candidate: options.customCandidate ?? null,
    }),
  })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
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
