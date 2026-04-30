"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  type Profile,
  type ScoutMatch,
  findTopMatches,
  getSampleProfiles,
  scoutMatches,
  startMatch,
} from "@/lib/api"

const SCENARIOS = [
  { name: "First coffee date", desc: "First IRL meeting. Awkward, curious, real." },
  { name: "3am vulnerable conversation", desc: "Late-night texting where one person opens up." },
  { name: "Disagreement on values", desc: "A casual chat turns into a real values clash." },
  { name: "One person is having a hard day", desc: "Support, attunement, and repair under stress." },
]

const PERSONA_TAGS: Record<string, string> = {
  Maya: "Artist",
  Jordan: "Finance",
  Sam: "Engineer",
  Riley: "Adventurer",
  Ethan: "Software",
  Zoe: "Philosophy",
  Marcus: "Sports",
  Aria: "Sports science",
}

const EMPTY: Profile = {
  name: "",
  age: 21,
  gender: "female",
  bio: "",
  interests: [],
  communication_style: "",
  values: [],
  deal_breakers: [],
  looking_for: "",
  relationship_intent: "serious",
  chat_history: "",
}

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Other"]
const LOOKING_FOR_OPTIONS = [
  { id: "men", label: "Men" },
  { id: "women", label: "Women" },
  { id: "everyone", label: "Everyone" },
]
const INTENT_OPTIONS = [
  { id: "serious", label: "Serious" },
  { id: "casual", label: "Casual" },
  { id: "unsure", label: "Unsure" },
  { id: "any", label: "Any" },
]

function cleanProfile(profile: Profile): Profile {
  return {
    ...EMPTY,
    ...profile,
    interests: profile.interests || [],
    values: profile.values || [],
    deal_breakers: profile.deal_breakers || [],
    relationship_intent: profile.relationship_intent || "unsure",
    chat_history: profile.chat_history || "",
  }
}

function genderLabel(gender: string) {
  const normalized = gender.toLowerCase()
  if (normalized === "female") return "Female"
  if (normalized === "male") return "Male"
  if (normalized === "non-binary") return "Non-binary"
  return gender || "Other"
}

function genderColor(gender: string) {
  const normalized = gender.toLowerCase()
  if (normalized === "female") return "#f472b6"
  if (normalized === "male") return "#60a5fa"
  return "#c084fc"
}

function listFromText(raw: unknown) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === "string") return raw.split(",").map(s => s.trim()).filter(Boolean)
  return []
}

function profileFromText(current: Profile, raw: string): Profile {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      return cleanProfile({
        ...current,
        ...parsed,
        interests: listFromText(parsed.interests),
        values: listFromText(parsed.values),
        deal_breakers: listFromText(parsed.deal_breakers),
      })
    }
  } catch {
    // Plain text dating profiles are expected here.
  }
  return cleanProfile({
    ...current,
    bio: raw.slice(0, 1200),
  })
}

function blankProfile(gender: "female" | "male"): Profile {
  return cleanProfile({ ...EMPTY, gender })
}

function StagePill({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2"
      style={{
        background: active ? "rgba(168,85,247,0.13)" : done ? "rgba(212,175,55,0.09)" : "rgba(255,255,255,0.04)",
        border: active ? "1px solid rgba(168,85,247,0.45)" : done ? "1px solid rgba(212,175,55,0.25)" : "1px solid rgba(255,255,255,0.07)",
      }}>
      <span className="h-2.5 w-2.5 rounded-full"
        style={{ background: done ? "#d4af37" : active ? "#a855f7" : "rgba(255,255,255,0.25)" }} />
      <span className="text-sm" style={{ color: active || done ? "#fff" : "rgba(255,255,255,0.55)" }}>{label}</span>
    </div>
  )
}

function AgentRunOverlay({ mode, targetName, candidates }: { mode: "top3" | "pair"; targetName: string; candidates: Profile[] }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const phase = mode === "top3"
    ? elapsed < 6 ? 0 : elapsed < 18 ? 1 : elapsed < 44 ? 2 : 3
    : elapsed < 8 ? 1 : elapsed < 34 ? 2 : 3
  const activeCandidate = candidates.length ? candidates[elapsed % candidates.length] : null
  const scenarioIdx = Math.min(3, Math.floor((elapsed / 5) % 4))
  const loopIdx = (elapsed % 7) + 1

  const stages = mode === "top3"
    ? [
      "L1 coarse filtering: pool -> 100 candidates",
      "L2 quick dates: 3 short dates each -> 10 leads",
      "L3 full virtual dates: 4 scenarios x 7 loops",
      "Ranking only fully simulated Top 3 matches",
    ]
    : [
      "Preparing selected pair",
      "L3 full virtual date: 4 scenarios x 7 loops",
      "GPT + Claude judging every transcript",
      "Synthesizing compatibility report",
    ]

  const transcriptPreview = [
    { side: "left", name: targetName || "You", text: "I want the real read, not just a profile match." },
    { side: "right", name: activeCandidate?.name || "Candidate", text: "Then let us test the little moments: curiosity, conflict, and care." },
    { side: "left", name: targetName || "You", text: `Scenario ${scenarioIdx + 1}, loop ${loopIdx}/7 is running now.` },
  ]

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: "rgba(8,5,16,0.88)", backdropFilter: "blur(10px)" }}>
      <div className="w-full max-w-3xl rounded-2xl p-5 fade-up"
        style={{ background: "#130e22", border: "1px solid rgba(212,175,55,0.22)" }}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(212,175,55,0.68)" }}>
              Agentic dating run
            </p>
            <h2 className="text-2xl font-bold"
              style={{ background: "linear-gradient(135deg, #d4af37, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {stages[phase]}
            </h2>
            <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.6)" }}>
              Current virtual date: {targetName || "You"} x {activeCandidate?.name || "candidate"} · {SCENARIOS[scenarioIdx].name} · loop {loopIdx}/7
            </p>
          </div>
          <span className="text-xs font-mono px-2 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)" }}>
            {elapsed}s
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            {stages.map((stage, i) => (
              <StagePill key={stage} label={stage} active={i === phase} done={i < phase} />
            ))}
          </div>

          <div className="rounded-[28px] overflow-hidden"
            style={{ background: "#05060a", border: "1px solid rgba(255,255,255,0.14)" }}>
            <div className="px-4 py-3 text-center" style={{ background: "#1c1c1e", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-xs font-semibold" style={{ color: "#f5f5f7" }}>Messages</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>live virtual date preview</p>
            </div>
            <div className="p-3 space-y-2 min-h-52" style={{ background: "linear-gradient(180deg,#0b0b10,#111117)" }}>
              {transcriptPreview.map((m, i) => (
                <div key={i} className={`flex ${m.side === "left" ? "justify-start" : "justify-end"}`}>
                  <div className="max-w-[82%]">
                    <p className={`text-[10px] mb-1 ${m.side === "left" ? "text-left" : "text-right"}`}
                      style={{ color: "rgba(255,255,255,0.42)" }}>{m.name}</p>
                    <div className="px-3 py-2 text-xs leading-relaxed"
                      style={{
                        background: m.side === "left" ? "#2c2c2e" : "linear-gradient(180deg,#34aadc,#007aff)",
                        color: "#fff",
                        borderRadius: m.side === "left" ? "18px 18px 18px 5px" : "18px 18px 5px 18px",
                      }}>
                      {m.text}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3" style={{ background: "#0b0b10", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="rounded-full px-4 py-2 text-sm" style={{ background: "#1c1c1e", color: "rgba(255,255,255,0.36)" }}>
                iMessage
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PersonaPicker({ samples, onSelect, onClose, accent, expectedGender }: {
  samples: Profile[]
  onSelect: (p: Profile) => void
  onClose: () => void
  accent: "gold" | "purple"
  expectedGender: "female" | "male"
}) {
  const color = accent === "gold" ? "#d4af37" : "#a855f7"
  const orderedSamples = [
    ...samples.filter(p => p.gender.toLowerCase() === expectedGender),
    ...samples.filter(p => p.gender.toLowerCase() !== expectedGender),
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl p-6 w-full max-w-xl" style={{ background: "#130e22", border: `1px solid ${color}40` }}>
        <div className="flex justify-between items-start mb-4 gap-4">
          <div>
            <h3 className="font-semibold" style={{ color }}>Choose a Persona</h3>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.58)" }}>
              Each card is labeled by gender so the default demo stays male/female.
            </p>
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.65)" }}>x</button>
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {orderedSamples.map(p => {
            const gColor = genderColor(p.gender)
            const suggested = p.gender.toLowerCase() === expectedGender
            return (
              <button key={p.name} onClick={() => { onSelect(cleanProfile(p)); onClose() }}
                className="text-left rounded-xl p-3 transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>{p.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                    {PERSONA_TAGS[p.name] || "Custom"}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${gColor}20`, color: gColor }}>
                    {genderLabel(p.gender)}
                  </span>
                  {suggested && <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(212,175,55,0.72)" }}>suggested</span>}
                </div>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{p.bio.slice(0, 68)}...</p>
              </button>
            )
          })}
        </div>
        <button onClick={() => { onSelect(blankProfile(expectedGender)); onClose() }} className="mt-4 w-full text-xs py-2 rounded-xl"
          style={{ background: `${color}12`, color, border: `1px solid ${color}30` }}>
          Start custom {genderLabel(expectedGender)} profile
        </button>
      </div>
    </div>
  )
}

function ProfileForm({ label, value, onChange, accent, onPickTemplate, allowUpload }: {
  label: string
  value: Profile
  onChange: (p: Profile) => void
  accent: "gold" | "purple"
  onPickTemplate: () => void
  allowUpload?: boolean
}) {
  const set = (k: keyof Profile, v: unknown) => onChange(cleanProfile({ ...value, [k]: v }))
  const setList = (k: keyof Profile, raw: string) => set(k, raw.split(",").map(s => s.trim()).filter(Boolean))
  const color = accent === "gold" ? "#d4af37" : "#a855f7"
  const borderColor = accent === "gold" ? "rgba(212,175,55,0.2)" : "rgba(168,85,247,0.2)"

  const readFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onChange(profileFromText(value, String(reader.result || "")))
    reader.readAsText(file)
  }

  return (
    <div className="flex-1 min-w-0 rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${borderColor}` }}>
      <div className="flex items-center justify-between mb-1 gap-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color }}>{label}</h2>
          <span className="text-xs px-1.5 py-0.5 rounded inline-block mt-1"
            style={{ background: `${genderColor(value.gender)}20`, color: genderColor(value.gender) }}>
            {genderLabel(value.gender)}
          </span>
        </div>
        <button onClick={onPickTemplate} className="text-xs px-3 py-1 rounded-full"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
          Pick persona
        </button>
      </div>

      {allowUpload && (
        <label className="text-xs rounded-xl px-3 py-2 cursor-pointer text-center"
          style={{ background: `${color}10`, color, border: `1px solid ${color}30` }}>
          Upload or paste dating profile
          <input type="file" accept=".txt,.md,.json" className="hidden" onChange={e => readFile(e.target.files?.[0])} />
        </label>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Name</label>
          <input className="inp" placeholder="e.g. Maya" value={value.name} onChange={e => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Age</label>
          <input className="inp" type="number" min={18} max={80} value={value.age} onChange={e => set("age", +e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Gender</label>
          <select className="inp" value={value.gender} onChange={e => set("gender", e.target.value)}>
            {GENDER_OPTIONS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Intent</label>
          <select className="inp" value={value.relationship_intent || "unsure"} onChange={e => set("relationship_intent", e.target.value)}>
            {INTENT_OPTIONS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label">
          Bio {allowUpload ? <span className="text-dim">(or paste profile text)</span> : <span className="text-dim">(public profile snippet)</span>}
        </label>
        <textarea className="inp" style={{ height: 78, resize: "vertical" }}
          placeholder={allowUpload ? "Who are you? What drives you? What kind of relationship are you looking for?" : "What does this candidate's profile say? Keep it to the observable public details."}
          value={value.bio} onChange={e => set("bio", e.target.value)} />
      </div>

      <div>
        <label className="label">Interests <span className="text-dim">(comma-separated)</span></label>
        <input className="inp" placeholder="design, hiking, jazz" value={value.interests.join(", ")} onChange={e => setList("interests", e.target.value)} />
      </div>

      <div>
        <label className="label">Communication Style</label>
        <input className="inp" placeholder="playful, direct, thoughtful" value={value.communication_style} onChange={e => set("communication_style", e.target.value)} />
      </div>

      <div>
        <label className="label">Core Values <span className="text-dim">(comma-separated)</span></label>
        <input className="inp" placeholder="creativity, honesty, ambition" value={value.values.join(", ")} onChange={e => setList("values", e.target.value)} />
      </div>

      <div>
        <label className="label">Deal-breakers <span className="text-dim">(optional)</span></label>
        <input className="inp" placeholder="flaky, no humor" value={value.deal_breakers.join(", ")} onChange={e => setList("deal_breakers", e.target.value)} />
      </div>

      <div>
        <label className="label">Looking For</label>
        <input className="inp" placeholder="someone who makes me think differently" value={value.looking_for} onChange={e => set("looking_for", e.target.value)} />
      </div>

      {allowUpload && (
        <div>
          <label className="label">Paste Chat History <span className="text-dim">(optional)</span></label>
          <textarea className="inp" style={{ height: 66, resize: "vertical" }}
            placeholder="Optional: paste a previous chat sample for tone and behavior signals."
            value={value.chat_history || ""} onChange={e => set("chat_history", e.target.value)} />
        </div>
      )}
    </div>
  )
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-3 py-2 rounded-lg text-xs font-medium"
      style={{
        background: active ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.04)",
        color: active ? "#d4af37" : "rgba(255,255,255,0.68)",
        border: active ? "1px solid rgba(212,175,55,0.38)" : "1px solid rgba(255,255,255,0.08)",
      }}>
      {label}
    </button>
  )
}

function ScoutResults({ matches, onUse, onRun }: {
  matches: ScoutMatch[]
  onUse: (profile: Profile) => void
  onRun: (profile: Profile) => void
}) {
  if (!matches.length) return null
  return (
    <div className="rounded-2xl p-5 mb-5" style={{ background: "rgba(168,85,247,0.05)", border: "1px solid rgba(168,85,247,0.18)" }}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#c084fc" }}>Candidate Leads</p>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.52)" }}>L1/L2 only, not called Top Match yet</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {matches.map((m, i) => (
          <div key={`${m.name}-${i}`} className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold font-mono" style={{ color: i === 0 ? "#d4af37" : "#a855f7" }}>#{i + 1}</span>
                  <p className="text-sm font-semibold" style={{ color: "#fff" }}>{m.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${genderColor(m.gender || "")}20`, color: genderColor(m.gender || "") }}>
                    {genderLabel(m.gender || "")}
                  </span>
                </div>
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.58)" }}>{m.age} · {m.tag}</p>
              </div>
              <span className="text-xs font-mono px-2 py-1 rounded"
                style={{ background: "rgba(212,175,55,0.14)", color: "#d4af37" }}>
                {Math.round(m.score)}/100
              </span>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>{m.why}</p>
            <div className="space-y-1.5">
              {m.boosters.slice(0, 2).map((tip, idx) => (
                <p key={idx} className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  + {tip}
                </p>
              ))}
            </div>
            <div className="flex gap-2 mt-auto">
              <button onClick={() => onUse(cleanProfile(m.profile))} className="flex-1 text-xs py-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Use as custom
              </button>
              <button onClick={() => onRun(cleanProfile(m.profile))} className="flex-1 text-xs py-2 rounded-lg"
                style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.32)" }}>
                Full date
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [pa, setPa] = useState<Profile>(EMPTY)
  const [pb, setPb] = useState<Profile>({ ...EMPTY, gender: "male", relationship_intent: "serious" })
  const [lookingForGender, setLookingForGender] = useState("men")
  const [relationshipIntent, setRelationshipIntent] = useState("serious")
  const [includeCustomCandidate, setIncludeCustomCandidate] = useState(true)
  const [loadingPair, setLoadingPair] = useState(false)
  const [loadingTop, setLoadingTop] = useState(false)
  const [scouting, setScouting] = useState(false)
  const [err, setErr] = useState("")
  const [samples, setSamples] = useState<Profile[]>([])
  const [picker, setPicker] = useState<"a" | "b" | null>(null)
  const [scoutResults, setScoutResults] = useState<ScoutMatch[]>([])

  useEffect(() => {
    getSampleProfiles().then(s => {
      const cleaned = s.map(cleanProfile)
      setSamples(cleaned)
      const female = cleaned.find(p => p.gender.toLowerCase() === "female")
      const male = cleaned.find(p => p.gender.toLowerCase() === "male")
      if (female) setPa(female)
      if (male) setPb(male)
    })
  }, [])

  const overlayCandidates = useMemo(() => {
    const preferred = lookingForGender === "men"
      ? samples.filter(p => p.gender.toLowerCase() === "male")
      : lookingForGender === "women"
        ? samples.filter(p => p.gender.toLowerCase() === "female")
        : samples
    return preferred.slice(0, 10)
  }, [lookingForGender, samples])

  const customCandidate = includeCustomCandidate && pb.name && pb.bio ? cleanProfile(pb) : null

  const runMatchWith = async (partner: Profile) => {
    if (!pa.name || !partner.name || !pa.bio || !partner.bio) {
      setErr("Fill in at least Name and Bio for both people.")
      return
    }
    setErr("")
    setLoadingPair(true)
    setPb(partner)
    try {
      const data = await startMatch(cleanProfile(pa), cleanProfile(partner))
      if (data.status === "error") {
        throw new Error(data.error_detail || data.progress || "Simulation failed")
      }
      sessionStorage.setItem("all_profiles", JSON.stringify(samples))
      sessionStorage.setItem("pa", JSON.stringify(cleanProfile(pa)))
      sessionStorage.setItem("pb", JSON.stringify(cleanProfile(partner)))
      if (data.report) {
        sessionStorage.setItem(`report:${data.job_id}`, JSON.stringify(data.report))
      }
      router.push(`/result/${data.job_id}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
      setLoadingPair(false)
    }
  }

  const runTopMatches = async () => {
    if (!pa.name || !pa.bio) {
      setErr("Fill or upload your profile before finding matches.")
      return
    }
    setErr("")
    setLoadingTop(true)
    try {
      const data = await findTopMatches(cleanProfile(pa), {
        topN: 3,
        lookingForGender,
        relationshipIntent,
        customCandidate,
      })
      if (data.status === "error") {
        throw new Error(data.error_detail || data.progress || "Top 3 search failed")
      }
      const topReport = data.report || {
        kind: "top_matches" as const,
        target: cleanProfile(pa),
        pipeline: {
          candidate_pool: samples.length,
          l1_target: 100,
          l2_target: 10,
          l3_full_dates: data.reports?.length || 0,
          scenarios: 4,
          loops_per_scenario: 7,
        },
        reports: data.reports || [],
      }
      sessionStorage.setItem("all_profiles", JSON.stringify(samples))
      sessionStorage.setItem("pa", JSON.stringify(cleanProfile(pa)))
      sessionStorage.setItem(`top_report:${data.job_id}`, JSON.stringify(topReport))
      router.push(`/top/${data.job_id}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
      setLoadingTop(false)
    }
  }

  const scoutPool = async () => {
    if (!pa.name || !pa.bio) {
      setErr("Fill or upload your profile before scouting.")
      return
    }
    setErr("")
    setScouting(true)
    try {
      const matches = await scoutMatches(cleanProfile(pa), {
        topN: 3,
        lookingForGender,
        relationshipIntent,
        customCandidate,
      })
      setScoutResults(matches)
      if (matches[0]?.profile) setPb(cleanProfile(matches[0].profile))
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setScouting(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      {loadingTop && <AgentRunOverlay mode="top3" targetName={pa.name} candidates={overlayCandidates} />}
      {loadingPair && <AgentRunOverlay mode="pair" targetName={pa.name} candidates={[pb]} />}

      {picker && (
        <PersonaPicker
          samples={samples}
          accent={picker === "a" ? "gold" : "purple"}
          onSelect={p => picker === "a" ? setPa(p) : setPb(p)}
          onClose={() => setPicker(null)}
          expectedGender={picker === "a" ? "female" : "male"}
        />
      )}

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-xs font-medium"
            style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: "#d4af37" }}>
            Agentic Dating Simulator
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-3"
            style={{ background: "linear-gradient(135deg, #d4af37 0%, #e8c84a 38%, #c4a0f0 68%, #a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Ditto Simulator
          </h1>
          <p className="text-sm max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.75)" }}>
            Paste your profile, let the agent screen the pool, run virtual dates, and return the three strongest fully simulated matches.
          </p>
        </div>

        <div className="mb-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,175,55,0.1)" }}>
          <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.62)" }}>
            4 Simulation Scenarios
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SCENARIOS.map((s, i) => (
              <div key={i} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-sm font-medium" style={{ color: "#f5f0ff" }}>{s.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5 mb-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(168,85,247,0.16)" }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#d4af37" }}>Looking for</p>
              <div className="flex flex-wrap gap-2">
                {LOOKING_FOR_OPTIONS.map(opt => (
                  <FilterButton key={opt.id} label={opt.label} active={lookingForGender === opt.id} onClick={() => setLookingForGender(opt.id)} />
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#a855f7" }}>Relationship intent</p>
              <div className="flex flex-wrap gap-2">
                {INTENT_OPTIONS.map(opt => (
                  <FilterButton key={opt.id} label={opt.label} active={relationshipIntent === opt.id} onClick={() => setRelationshipIntent(opt.id)} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4 mb-5">
          <ProfileForm label="Your Profile" value={pa} onChange={setPa} accent="gold"
            onPickTemplate={() => setPicker("a")} allowUpload />
          <div>
            <ProfileForm label="Custom Candidate" value={pb} onChange={setPb} accent="purple"
              onPickTemplate={() => setPicker("b")} />
            <label className="mt-3 flex items-center gap-2 text-xs rounded-xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.035)", color: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <input type="checkbox" checked={includeCustomCandidate} onChange={e => setIncludeCustomCandidate(e.target.checked)} />
              Include this custom candidate in the Find Top 3 pool
            </label>
          </div>
        </div>

        <ScoutResults
          matches={scoutResults}
          onUse={profile => setPb(profile)}
          onRun={profile => runMatchWith(profile)}
        />

        {err && <p className="text-center text-sm mb-3" style={{ color: "#f87171" }}>{err}</p>}

        <div className="flex flex-col md:flex-row items-center justify-center gap-3">
          <button onClick={runTopMatches} disabled={loadingTop || loadingPair || scouting} className="btn-gold">
            {loadingTop ? "Finding Top 3 Matches..." : "Find Top 3 Matches"}
          </button>
          <button onClick={scoutPool} disabled={loadingTop || loadingPair || scouting} className="text-sm px-5 py-3 rounded-xl"
            style={{ background: "rgba(168,85,247,0.14)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.32)" }}>
            {scouting ? "Scanning Leads..." : "Preview Candidate Leads"}
          </button>
          <button onClick={() => runMatchWith(pb)} disabled={loadingTop || loadingPair || scouting} className="text-sm px-5 py-3 rounded-xl"
            style={{ background: "rgba(255,255,255,0.055)", color: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Run Custom Pair
          </button>
        </div>

        <p className="text-center text-xs mt-3" style={{ color: "rgba(255,255,255,0.55)" }}>
          Only L3-simulated candidates are labeled Top Matches. L1/L2 results stay as candidate leads.
        </p>

        <div className="mt-8 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,175,55,0.1)" }}>
          <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.62)" }}>
            Production-style matching pipeline
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-sm font-semibold" style={{ color: "#f5f0ff" }}>L1 Coarse Filter</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>Embedding-style similarity and rules: pool to 100.</p>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-sm font-semibold" style={{ color: "#f5f0ff" }}>L2 Quick Dates</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>One light scenario, three short loops each: 100 to 10.</p>
            </div>
            <div className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
              <p className="text-sm font-semibold" style={{ color: "#f5f0ff" }}>L3 Full Virtual Dates</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>4 scenarios x 7 loops, GPT + Claude judges, final Top 3.</p>
            </div>
          </div>
        </div>

      </div>

      <style>{`
        .label { display:block; font-size:11px; color:rgba(255,255,255,0.7); margin-bottom:4px; }
        .text-dim { color:rgba(255,255,255,0.55); }
      `}</style>
    </div>
  )
}
