"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { type Profile, type ScoutMatch, startMatch, getSampleProfiles, scoutMatches } from "@/lib/api"

const SCENARIOS = [
  { name: "☕ First Coffee Date", desc: "First IRL meeting. Awkward, curious, real." },
  { name: "🌙 3am Conversation", desc: "Late night texting — someone goes vulnerable." },
  { name: "⚡ Values Disagreement", desc: "Casual chat turns into a real clash." },
  { name: "🤝 Hard Day Support", desc: "One person is struggling. Attunement check." },
]

const PERSONA_TAGS: Record<string, string> = {
  Maya: "🎨 Artist",
  Jordan: "📈 Finance",
  Sam: "💻 Engineer / Nerd",
  Riley: "🏔️ Adventurer",
  Ethan: "🤖 Software Eng",
  Zoe: "📚 Philosophy",
  Marcus: "🏃 Sports / Educator",
  Aria: "💪 Sports Science",
}

const EMPTY: Profile = {
  name: "", age: 21, gender: "female",
  bio: "", interests: [], communication_style: "",
  values: [], deal_breakers: [], looking_for: "",
}

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Other"]

const PAIRING_GENDERS = {
  a: "female",
  b: "male",
} as const

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

function isFemaleMalePair(a: Profile, b: Profile) {
  const genders = [a.gender.toLowerCase(), b.gender.toLowerCase()]
  return genders.includes("female") && genders.includes("male")
}

function blankProfile(gender: "female" | "male"): Profile {
  return { ...EMPTY, gender }
}

function LaunchOverlay() {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const phase = elapsed < 8 ? 0 : elapsed < 24 ? 1 : elapsed < 38 ? 2 : 3
  const phases = [
    "Building persona replicas",
    "Running scenario agents",
    "Consulting GPT + Claude judges",
    "Synthesizing match report",
  ]
  const activeScenario = phase === 1 ? Math.min(SCENARIOS.length - 1, Math.floor((elapsed - 8) / 4)) : -1
  const scenarioState = (index: number) => {
    if (phase === 0) return { label: "Queued", active: false, done: false }
    if (phase === 1) {
      if (index < activeScenario) return { label: "7 loops drafted", active: false, done: true }
      if (index === activeScenario) return { label: "Simulating 7 loops", active: true, done: false }
      return { label: "Queued", active: false, done: false }
    }
    if (phase === 2) return { label: "GPT + Claude scoring", active: true, done: false }
    return { label: "Folded into report", active: false, done: true }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{ background: "rgba(8,5,16,0.86)", backdropFilter: "blur(10px)" }}>
      <div className="w-full max-w-xl rounded-2xl p-6 fade-up"
        style={{ background: "#130e22", border: "1px solid rgba(212,175,55,0.22)" }}>
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(212,175,55,0.65)" }}>
              Agent run in progress
            </p>
            <h2 className="text-2xl font-bold"
              style={{ background: "linear-gradient(135deg, #d4af37, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {phases[phase]}
            </h2>
          </div>
          <span className="text-xs font-mono px-2 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.65)" }}>
            {elapsed}s
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
          {SCENARIOS.map((s, i) => {
            const state = scenarioState(i)
            return (
              <div key={s.name} className="rounded-xl px-3 py-2"
                style={{
                  background: state.active ? "rgba(168,85,247,0.12)" : state.done ? "rgba(212,175,55,0.08)" : "rgba(255,255,255,0.04)",
                  border: state.active ? "1px solid rgba(168,85,247,0.45)" : state.done ? "1px solid rgba(212,175,55,0.24)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                <p className="text-sm font-medium" style={{ color: "#f5f0ff" }}>{s.name}</p>
                <p className="text-xs mt-1" style={{ color: state.active ? "#c084fc" : state.done ? "#d4af37" : "rgba(255,255,255,0.48)" }}>
                  {state.label}
                </p>
              </div>
            )
          })}
        </div>

        <div className="space-y-2">
          {phases.map((p, i) => (
            <div key={p} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                style={{
                  background: i < phase ? "rgba(212,175,55,0.28)" : i === phase ? "rgba(168,85,247,0.28)" : "rgba(255,255,255,0.05)",
                  border: i === phase ? "1px solid rgba(168,85,247,0.65)" : "1px solid rgba(255,255,255,0.06)",
                  color: i <= phase ? "#fff" : "rgba(255,255,255,0.35)",
                }}>
                {i < phase ? "✓" : i === phase ? "•" : ""}
              </div>
              <span className="text-sm" style={{ color: i <= phase ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.42)" }}>
                {p}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Particles() {
  const pts = Array.from({ length: 18 }, (_, i) => ({
    id: i, size: Math.random() * 4 + 2,
    left: Math.random() * 100, top: Math.random() * 100,
    dur: Math.random() * 8 + 6, delay: Math.random() * 5,
    gold: Math.random() > 0.5,
  }))
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {pts.map(p => (
        <div key={p.id} className="particle" style={{
          width: p.size, height: p.size, left: `${p.left}%`, top: `${p.top}%`,
          background: p.gold ? "rgba(212,175,55,0.6)" : "rgba(147,51,234,0.5)",
          animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}
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
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl p-6 w-full max-w-xl" style={{ background: "#130e22", border: `1px solid ${color}40` }}>
        <div className="flex justify-between items-start mb-4 gap-4">
          <div>
            <h3 className="font-semibold" style={{ color }}>Choose a Persona</h3>
            <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.58)" }}>
              Suggested for {genderLabel(expectedGender)} side. Custom profiles are editable.
            </p>
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.65)" }}>✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {orderedSamples.map(p => {
            const gColor = genderColor(p.gender)
            const suggested = p.gender.toLowerCase() === expectedGender
            return (
            <button key={p.name} onClick={() => { onSelect(p); onClose() }}
              className="text-left rounded-xl p-3 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}60`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>{p.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                  {PERSONA_TAGS[p.name] || "👤 Custom"}
                </span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${gColor}20`, color: gColor }}>
                  {genderLabel(p.gender)}
                </span>
                {suggested && (
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(212,175,55,0.72)" }}>
                    suggested
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{p.bio.slice(0, 60)}...</p>
            </button>
          )})}
        </div>
        <button onClick={() => { onSelect(blankProfile(expectedGender)); onClose() }} className="mt-4 w-full text-xs py-2 rounded-xl"
          style={{ background: `${color}12`, color, border: `1px solid ${color}30` }}>
          Start custom {genderLabel(expectedGender)} profile
        </button>
      </div>
    </div>
  )
}

function ProfileForm({ label, value, onChange, accent, onPickTemplate, samples }: {
  label: string; value: Profile; onChange: (p: Profile) => void;
  accent: "gold" | "purple"; onPickTemplate: () => void; samples: Profile[]
}) {
  const set = (k: keyof Profile, v: unknown) => onChange({ ...value, [k]: v })
  const setList = (k: keyof Profile, raw: string) => set(k, raw.split(",").map(s => s.trim()).filter(Boolean))
  const color = accent === "gold" ? "#d4af37" : "#a855f7"
  const borderColor = accent === "gold" ? "rgba(212,175,55,0.2)" : "rgba(168,85,247,0.2)"

  return (
    <div className="flex-1 min-w-0 rounded-2xl p-5 flex flex-col gap-3"
      style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${borderColor}` }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-sm font-bold" style={{ color }}>{label}</h2>
          <span className="text-xs px-1.5 py-0.5 rounded inline-block mt-1"
            style={{ background: `${genderColor(value.gender)}20`, color: genderColor(value.gender) }}>
            {genderLabel(value.gender)}
          </span>
        </div>
        <button onClick={onPickTemplate} className="text-xs px-3 py-1 rounded-full"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
          Pick persona ↗
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Name</label>
          <input className="inp" placeholder="e.g. Maya" value={value.name} onChange={e => set("name", e.target.value)} />
        </div>
        <div>
          <label className="label">Age</label>
          <input className="inp" type="number" min={18} max={40} value={value.age} onChange={e => set("age", +e.target.value)} />
        </div>
      </div>

      <div>
        <label className="label">Gender</label>
        <select className="inp" value={value.gender} onChange={e => set("gender", e.target.value)}>
          {GENDER_OPTIONS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Bio <span className="text-dim">(2–4 sentences)</span></label>
        <textarea className="inp" style={{ height: 68, resize: "none" }}
          placeholder="Who are you? What drives you?" value={value.bio} onChange={e => set("bio", e.target.value)} />
      </div>

      <div>
        <label className="label">Interests <span className="text-dim">(comma-separated)</span></label>
        <input className="inp" placeholder="design, hiking, jazz" value={value.interests.join(", ")} onChange={e => setList("interests", e.target.value)} />
      </div>

      <div>
        <label className="label">Communication Style</label>
        <input className="inp" placeholder="e.g. playful, direct, thoughtful" value={value.communication_style} onChange={e => set("communication_style", e.target.value)} />
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
    </div>
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
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#c084fc" }}>Agentic Scout Top 3</p>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.52)" }}>L1 scan + 3 quick dates each</span>
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
              <button onClick={() => onUse(m.profile)} className="flex-1 text-xs py-2 rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.78)", border: "1px solid rgba(255,255,255,0.08)" }}>
                Use
              </button>
              <button onClick={() => onRun(m.profile)} className="flex-1 text-xs py-2 rounded-lg"
                style={{ background: "rgba(212,175,55,0.16)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.32)" }}>
                Simulate
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
  const [pb, setPb] = useState<Profile>({ ...EMPTY, gender: "male" })
  const [loading, setLoading] = useState(false)
  const [scouting, setScouting] = useState(false)
  const [err, setErr] = useState("")
  const [samples, setSamples] = useState<Profile[]>([])
  const [picker, setPicker] = useState<"a" | "b" | null>(null)
  const [scoutResults, setScoutResults] = useState<ScoutMatch[]>([])

  useEffect(() => {
    getSampleProfiles().then(s => {
      setSamples(s)
      const female = s.find(p => p.gender.toLowerCase() === "female")
      const male = s.find(p => p.gender.toLowerCase() === "male")
      if (female && male) { setPa(female); setPb(male) }
      else if (s.length >= 2) { setPa(s[0]); setPb(s[1]) }
    })
  }, [])

  const runMatchWith = async (partner: Profile) => {
    if (!pa.name || !partner.name || !pa.bio || !partner.bio) {
      setErr("Fill in at least Name and Bio for both people.")
      return
    }
    if (!isFemaleMalePair(pa, partner)) {
      setErr("For this demo, choose one Female and one Male profile. Custom profiles still work: set the gender fields before running.")
      return
    }
    setErr("")
    setLoading(true)
    setPb(partner)
    try {
      const data = await startMatch(pa, partner)
      if (data.status === "error") {
        throw new Error(data.error_detail || data.progress || "Simulation failed")
      }
      // store all profiles in sessionStorage for result page
      sessionStorage.setItem("all_profiles", JSON.stringify(samples))
      sessionStorage.setItem("pa", JSON.stringify(pa))
      sessionStorage.setItem("pb", JSON.stringify(partner))
      if (data.report) {
        sessionStorage.setItem(`report:${data.job_id}`, JSON.stringify(data.report))
      }
      router.push(`/result/${data.job_id}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }

  const submit = async () => runMatchWith(pb)

  const scoutPool = async () => {
    if (!pa.name || !pa.bio) {
      setErr("Fill Person A's Name and Bio before scouting.")
      return
    }
    if (!["female", "male"].includes(pa.gender.toLowerCase())) {
      setErr("Set Person A to Female or Male for this candidate-pool scout.")
      return
    }
    setErr("")
    setScouting(true)
    try {
      const matches = await scoutMatches(pa, 3)
      setScoutResults(matches)
      if (matches[0]?.profile) setPb(matches[0].profile)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setScouting(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      <Particles />
      {loading && <LaunchOverlay />}

      {picker && (
        <PersonaPicker
          samples={samples}
          accent={picker === "a" ? "gold" : "purple"}
          onSelect={p => picker === "a" ? setPa(p) : setPb(p)}
          onClose={() => setPicker(null)}
          expectedGender={PAIRING_GENDERS[picker]}
        />
      )}

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 text-xs font-medium"
            style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: "#d4af37" }}>
            ✦ Agentic Dating Simulator
          </div>
          <h1 className="text-5xl font-bold tracking-tight mb-3"
            style={{ background: "linear-gradient(135deg, #d4af37 0%, #e8c84a 35%, #c4a0f0 65%, #a855f7 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Ditto Match
          </h1>
          <p className="text-sm max-w-md mx-auto" style={{ color: "rgba(255,255,255,0.75)" }}>
            Two AI persona replicas. Four high-signal scenarios. Two independent judges.<br />
            Simulate the date before you go on it.
          </p>
        </div>

        {/* Scenario strip */}
        <div className="mb-6 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,175,55,0.1)" }}>
          <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.6)" }}>
            4 Simulation Scenarios · Each run 7× · Judged by GPT-5.5 &amp; Claude Opus 4.7
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SCENARIOS.map((s, i) => (
              <div key={i} className="rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.03)" }}>
                <p className="text-sm font-medium" style={{ color: "#f5f0ff" }}>{s.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Forms */}
        <div className="flex gap-4 mb-5">
          <ProfileForm label="Person A" value={pa} onChange={setPa} accent="gold"
            onPickTemplate={() => setPicker("a")} samples={samples} />
          <div className="flex items-center justify-center px-1">
            <div style={{ color: "rgba(212,175,55,0.3)", fontSize: 20 }}>⟷</div>
          </div>
          <ProfileForm label="Person B" value={pb} onChange={setPb} accent="purple"
            onPickTemplate={() => setPicker("b")} samples={samples} />
        </div>

        <ScoutResults
          matches={scoutResults}
          onUse={profile => setPb(profile)}
          onRun={profile => runMatchWith(profile)}
        />

        {err && <p className="text-center text-sm mb-3" style={{ color: "#f87171" }}>{err}</p>}

        <div className="flex flex-col items-center gap-2">
          <button onClick={scoutPool} disabled={loading || scouting} className="text-sm px-5 py-3 rounded-xl"
            style={{ background: "rgba(168,85,247,0.14)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.32)" }}>
            {scouting ? "Running L1/L2 Dates..." : "Find Top 3 Matches"}
          </button>
          <button onClick={submit} disabled={loading || scouting} className="btn-gold">
            {loading ? "Launching Simulation..." : "✦ Run Compatibility Simulation"}
          </button>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            L1/L2 scout runs 3 quick dates per candidate · Full L3 uses 4 scenarios × 7 loops
          </p>
        </div>
      </div>

      {/* CSS helpers */}
      <style>{`
        .label { display:block; font-size:11px; color:rgba(255,255,255,0.7); margin-bottom:4px; }
        .text-dim { color:rgba(255,255,255,0.55); }
      `}</style>
    </div>
  )
}
