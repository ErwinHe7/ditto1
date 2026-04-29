"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { type Profile, startMatch, getSampleProfiles } from "@/lib/api"

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

const GENDER_OPTIONS = ["Female", "Male", "Non-binary", "Bisexual", "Other"]

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

function PersonaPicker({ samples, onSelect, onClose, accent }: {
  samples: Profile[]; onSelect: (p: Profile) => void; onClose: () => void; accent: "gold" | "purple"
}) {
  const color = accent === "gold" ? "#d4af37" : "#a855f7"
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="rounded-2xl p-6 w-full max-w-lg" style={{ background: "#130e22", border: `1px solid ${color}40` }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold" style={{ color }}>Choose a Persona</h3>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.65)" }}>✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
          {samples.map(p => (
            <button key={p.name} onClick={() => { onSelect(p); onClose() }}
              className="text-left rounded-xl p-3 transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = `${color}60`)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold" style={{ color: "#ffffff" }}>{p.name}</span>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
                  {PERSONA_TAGS[p.name] || "👤 Custom"}
                </span>
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{p.bio.slice(0, 60)}...</p>
            </button>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 w-full text-xs py-2 rounded-xl"
          style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)" }}>
          Enter custom profile instead
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
        <h2 className="text-sm font-bold" style={{ color }}>{label}</h2>
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

export default function Home() {
  const router = useRouter()
  const [pa, setPa] = useState<Profile>(EMPTY)
  const [pb, setPb] = useState<Profile>({ ...EMPTY, gender: "male" })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState("")
  const [samples, setSamples] = useState<Profile[]>([])
  const [picker, setPicker] = useState<"a" | "b" | null>(null)

  useEffect(() => {
    getSampleProfiles().then(s => {
      setSamples(s)
      if (s.length >= 2) { setPa(s[0]); setPb(s[1]) }
    })
  }, [])

  const submit = async () => {
    if (!pa.name || !pb.name || !pa.bio || !pb.bio) {
      setErr("Fill in at least Name and Bio for both people.")
      return
    }
    setErr("")
    setLoading(true)
    try {
      const data = await startMatch(pa, pb)
      if (data.status === "error") {
        throw new Error(data.error_detail || data.progress || "Simulation failed")
      }
      // store all profiles in sessionStorage for result page
      sessionStorage.setItem("all_profiles", JSON.stringify(samples))
      sessionStorage.setItem("pa", JSON.stringify(pa))
      sessionStorage.setItem("pb", JSON.stringify(pb))
      if (data.report) {
        sessionStorage.setItem(`report:${data.job_id}`, JSON.stringify(data.report))
      }
      router.push(`/result/${data.job_id}`)
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      <Particles />

      {picker && (
        <PersonaPicker
          samples={samples}
          accent={picker === "a" ? "gold" : "purple"}
          onSelect={p => picker === "a" ? setPa(p) : setPb(p)}
          onClose={() => setPicker(null)}
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
            4 Simulation Scenarios · Each run 3× · Judged by GPT-5.5 &amp; Claude Opus 4.7
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

        {err && <p className="text-center text-sm mb-3" style={{ color: "#f87171" }}>{err}</p>}

        <div className="flex flex-col items-center gap-2">
          <button onClick={submit} disabled={loading} className="btn-gold">
            {loading ? "Launching Simulation..." : "✦ Run Compatibility Simulation"}
          </button>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
            ~1–3 min · Fast best-match recommendations included
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
