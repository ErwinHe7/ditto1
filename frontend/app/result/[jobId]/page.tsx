"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { getMatch, type CompatibilityReport, type ScenarioResult, type JudgeScore, type BestMatch } from "@/lib/api"

const REC = {
  strong_match: { label: "Strong Match — go on a real date", color: "#22c55e", glow: "rgba(34,197,94,0.4)" },
  promising:    { label: "Promising — keep the conversation going", color: "#a855f7", glow: "rgba(168,85,247,0.4)" },
  uncertain:    { label: "Uncertain — hard to call from here", color: "#f59e0b", glow: "rgba(245,158,11,0.4)" },
  skip:         { label: "Skip — not a fit", color: "#ef4444", glow: "rgba(239,68,68,0.4)" },
}

const JUDGE_LABELS: Record<string, string> = {
  chemistry: "GPT-5.5 — Chemistry",
  values: "Claude Opus 4.7 — Values",
}

const JUDGES_PER_SIM = 2

const SCENARIO_ICONS: Record<string, string> = {
  first_coffee: "☕",
  late_night_vulnerable: "🌙",
  minor_conflict: "⚡",
  travel_planning: "✈️",
  meet_friends: "👥",
  support_under_stress: "🤝",
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = size * 0.38
  const circ = 2 * Math.PI * r
  const pct = score / 100
  const offset = circ * (1 - pct)
  const color = score >= 70 ? "#22c55e" : score >= 55 ? "#a855f7" : score >= 40 ? "#f59e0b" : "#ef4444"
  const cx = size / 2, cy = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.09} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={size * 0.09}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 1.2s ease" }} />
      <text x={cx} y={cy - 2} textAnchor="middle" dominantBaseline="central" fill="white"
        fontSize={size * 0.22} fontWeight="bold">{score}</text>
      <text x={cx} y={cy + size * 0.18} textAnchor="middle" fill="rgba(255,255,255,0.65)" fontSize={size * 0.1}>/100</text>
    </svg>
  )
}

function DimBar({ label, val }: { label: string; val: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-28 shrink-0" style={{ color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <div className="flex-1 rounded-full" style={{ height: 5, background: "rgba(255,255,255,0.06)" }}>
        <div className="dim-fill" style={{ width: `${val}%` }} />
      </div>
      <span className="text-xs w-7 text-right font-mono" style={{ color: "rgba(240,232,255,0.6)" }}>{val}</span>
    </div>
  )
}

function JudgeCard({ js }: { js: JudgeScore }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(212,175,55,0.1)" }}>
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-semibold" style={{ color: "#d4af37" }}>{JUDGE_LABELS[js.judge_id] || js.judge_id}</span>
        <span className="text-sm font-bold font-mono" style={{ color: js.overall >= 65 ? "#a855f7" : "#f0c040" }}>{js.overall}</span>
      </div>
      <div className="space-y-1.5 mb-3">
        <DimBar label="Chemistry" val={js.chemistry} />
        <DimBar label="Values align" val={js.values_alignment} />
        <DimBar label="Energy match" val={js.energy_match} />
        <DimBar label="Conflict style" val={js.conflict_handling} />
        <DimBar label="Curiosity" val={js.curiosity} />
      </div>
      <p className="text-xs italic" style={{ color: "rgba(255,255,255,0.65)" }}>{js.reasoning}</p>
    </div>
  )
}

function CurrentMatchCard({ partnerName, score }: { partnerName: string; score: number }) {
  return (
    <div className="flex items-start gap-3 mb-3 p-3 rounded-xl"
      style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.24)" }}>
      <span className="text-lg font-bold font-mono mt-0.5" style={{ color: "#d4af37" }}>Now</span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>{partnerName}</p>
          <span className="text-xs font-mono px-2 py-0.5 rounded"
            style={{ background: "rgba(212,175,55,0.18)", color: "#d4af37" }}>
            full simulation {score}/100
          </span>
        </div>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.62)" }}>
          This is the pair you just ran through all scenario transcripts and both judges.
        </p>
      </div>
    </div>
  )
}

function CandidateLeadCard({ match, index }: { match: BestMatch; index: number }) {
  return (
    <div className="flex items-start gap-3 mb-2 p-3 rounded-xl"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(168,85,247,0.15)" }}>
      <span className="text-lg font-bold font-mono mt-0.5" style={{ color: index === 0 ? "#d4af37" : "#a855f7" }}>
        #{index + 1}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>{match.name}</p>
          <span className="text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(168,85,247,0.16)", color: "#c084fc" }}>
            profile-fit lead
          </span>
          {match.gender && (
            <span className="text-xs px-2 py-0.5 rounded"
              style={{
                background: match.gender.toLowerCase() === "male" ? "rgba(96,165,250,0.16)" : "rgba(244,114,182,0.16)",
                color: match.gender.toLowerCase() === "male" ? "#93c5fd" : "#f9a8d4",
              }}>
              {match.gender.toLowerCase() === "male" ? "Male" : match.gender.toLowerCase() === "female" ? "Female" : match.gender}
            </span>
          )}
          {match.tag && <span className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{match.tag}</span>}
        </div>
        <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>{match.bio}</p>
        <p className="text-[11px] mt-1" style={{ color: "rgba(255,255,255,0.42)" }}>
          Not yet simulated. Run this pair to get a comparable compatibility score.
        </p>
      </div>
    </div>
  )
}

function AffectionPanel({ score, tips }: { score?: number; tips?: string[] }) {
  if (!score && !tips?.length) return null
  return (
    <div className="rounded-2xl p-6 mb-6" style={{ background: "rgba(212,175,55,0.045)", border: "1px solid rgba(212,175,55,0.14)" }}>
      <div className="flex flex-col md:flex-row gap-5 md:items-start">
        <div className="shrink-0">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(212,175,55,0.7)" }}>
            Interest Signal
          </p>
          <div className="text-4xl font-bold font-mono" style={{ color: "#d4af37" }}>
            {score || 50}<span className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>/100</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
          {(tips || []).slice(0, 3).map((tip, i) => (
            <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <p className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "rgba(168,85,247,0.74)" }}>
                lift {i + 1}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.74)" }}>{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScenarioCard({ sr, paName, pbName }: { sr: ScenarioResult; paName: string; pbName: string }) {
  const [open, setOpen] = useState(false)
  const [simIdx, setSimIdx] = useState(0)
  const transcript = sr.transcripts[simIdx] || []
  const judgesForSim = sr.judge_scores.slice(simIdx * JUDGES_PER_SIM, simIdx * JUDGES_PER_SIM + JUDGES_PER_SIM)
  const icon = SCENARIO_ICONS[sr.scenario_id] || "🎭"

  const exportLog = () => {
    const lines = [`=== ${sr.scenario_name} — Sim #${simIdx + 1} ===\n`]
    transcript.forEach(m => {
      lines.push(`${m.speaker === "A" ? paName : pbName}: ${m.text}\n`)
    })
    lines.push(`\n--- Judge Scores ---\n`)
    judgesForSim.forEach(js => {
      lines.push(`${JUDGE_LABELS[js.judge_id]}: ${js.overall}/100\n${js.reasoning}\n\n`)
    })
    const blob = new Blob([lines.join("")], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `ditto-${sr.scenario_id}-sim${simIdx + 1}.txt`
    a.click()
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,175,55,0.12)" }}>
      <button onClick={() => setOpen(!open)} className="w-full px-5 py-4 flex items-center justify-between text-left"
        style={{ transition: "background 0.15s" }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#f5f0ff" }}>{sr.scenario_name}</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
              avg: <span style={{ color: "#d4af37" }}>{Math.round(sr.avg_score)}</span>
              {" "}&nbsp;·&nbsp; trimmed: <span style={{ color: "#a855f7" }}>{Math.round(sr.trimmed_avg_score)}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex gap-2">
            {sr.judge_scores.slice(0, JUDGES_PER_SIM).map((js, i) => (
              <span key={i} className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: "rgba(168,85,247,0.15)", color: "#c084fc" }}>
                {js.overall}
              </span>
            ))}
          </div>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
          <div className="flex items-center gap-2 mt-4 mb-3">
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>Simulation run:</span>
            {sr.transcripts.map((_, i) => (
              <button key={i} onClick={() => setSimIdx(i)}
                className="w-7 h-7 rounded text-xs font-mono transition-all"
                style={{
                  background: i === simIdx ? "rgba(212,175,55,0.3)" : "rgba(255,255,255,0.05)",
                  color: i === simIdx ? "#d4af37" : "rgba(255,255,255,0.75)",
                  border: i === simIdx ? "1px solid rgba(212,175,55,0.5)" : "1px solid transparent"
                }}>
                {i + 1}
              </button>
            ))}
            <button onClick={exportLog} className="ml-auto text-xs px-3 py-1 rounded-lg"
              style={{ background: "rgba(168,85,247,0.15)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}>
              Export Log
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Conversation */}
            <div>
              <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: "rgba(212,175,55,0.6)" }}>Conversation</p>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                {transcript.map((m, i) => {
                  const isA = m.speaker === "A"
                  return (
                    <div key={i} className={`flex ${isA ? "justify-start" : "justify-end"}`}>
                      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
                        style={isA
                          ? { background: "rgba(255,255,255,0.06)", color: "#ffffff", borderBottomLeftRadius: 4 }
                          : { background: "rgba(168,85,247,0.2)", color: "#f5f0ff", borderBottomRightRadius: 4, border: "1px solid rgba(168,85,247,0.2)" }
                        }>
                        <p className="text-xs font-semibold mb-1" style={{ opacity: 0.5 }}>
                          {isA ? paName : pbName}
                        </p>
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Judges */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(212,175,55,0.6)" }}>Judge Verdicts</p>
              {judgesForSim.map((js, i) => <JudgeCard key={i} js={js} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LoadingScreen({ progress, jobId }: { progress: string; jobId: string }) {
  const [dots, setDots] = useState(".")
  const msgs = [
    "Generating persona replicas...",
    "Simulating first coffee date...",
    "Testing emotional vulnerability...",
    "Running conflict scenarios...",
    "Consulting the judge panel...",
    "Computing compatibility matrix...",
  ]
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const d = setInterval(() => setDots(p => p.length >= 3 ? "." : p + "."), 500)
    const m = setInterval(() => setMsgIdx(p => (p + 1) % msgs.length), 3000)
    return () => { clearInterval(d); clearInterval(m) }
  }, [])

  const loadingScenarios = ["☕ First Coffee", "🌙 3am Talk", "⚡ Conflict", "🤝 Hard Day"]
  const currentMatch = progress.match(/scenario (\d+)\/(\d+)/)
  const currentScenario = currentMatch ? +currentMatch[1] - 1 : -1

  return (
    <div className="relative min-h-screen flex items-center justify-center">
      <div className="text-center max-w-lg px-6 fade-up">
        <div className="text-5xl mb-6">✦</div>
        <h1 className="text-2xl font-bold mb-2"
          style={{ background: "linear-gradient(135deg, #d4af37, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Simulating Your Match
        </h1>
        <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.75)" }}>
          {progress || msgs[msgIdx]}{dots}
        </p>

        {/* Scenario progress */}
        <div className="space-y-2 mb-8 text-left">
          {loadingScenarios.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs"
                style={{
                  background: i < currentScenario ? "rgba(212,175,55,0.3)" : i === currentScenario ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.05)",
                  border: i === currentScenario ? "1px solid #d4af37" : "1px solid transparent",
                }}>
                {i < currentScenario ? "✓" : i === currentScenario ? "◉" : ""}
              </div>
              <span className="text-sm" style={{ color: i <= currentScenario ? "#ffffff" : "rgba(255,255,255,0.55)" }}>{s}</span>
              {i === currentScenario && <div className="flex-1 progress-bar" />}
            </div>
          ))}
        </div>

        <p className="text-xs" style={{ color: "rgba(240,232,255,0.25)" }}>Job ID: {jobId}</p>
      </div>
    </div>
  )
}

export default function ResultPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const router = useRouter()
  const [status, setStatus] = useState("pending")
  const [progress, setProgress] = useState("")
  const [report, setReport] = useState<CompatibilityReport | null>(null)
  const [errDetail, setErrDetail] = useState("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const cached = sessionStorage.getItem(`report:${jobId}`)
    if (cached) {
      setReport(JSON.parse(cached) as CompatibilityReport)
      setStatus("done")
      setProgress("complete")
      return
    }

    const poll = async () => {
      const data = await getMatch(jobId)
      setStatus(data.status)
      setProgress(data.progress)
      if (data.report) {
        setReport(data.report as CompatibilityReport)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
      if (data.status === "error") {
        setErrDetail(data.error_detail || "")
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
    }
    poll()
    intervalRef.current = setInterval(poll, 2000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [jobId])

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <p className="text-red-400 text-lg mb-2">Simulation failed</p>
          <p className="text-xs text-zinc-500 mb-4">{errDetail}</p>
          <button onClick={() => router.push("/")} className="btn-gold text-sm">← Try Again</button>
        </div>
      </div>
    )
  }

  if (!report) return <LoadingScreen progress={progress} jobId={jobId} />

  const pa = report.profile_a
  const pb = report.profile_b
  const rec = REC[report.recommendation] || REC.uncertain
  const nSims = report.scenario_results[0]?.transcripts.length || "?"

  const exportFullReport = () => {
    const lines = [`DITTO COMPATIBILITY REPORT\n${pa.name} × ${pb.name}\n${"=".repeat(50)}\n\n`]
    lines.push(`Overall Score: ${report.overall_score}/100 (trimmed: ${report.trimmed_overall_score}/100)\n`)
    if (report.affection_score) lines.push(`Interest Signal: ${report.affection_score}/100\n`)
    lines.push(`Confidence: ${Math.round(report.confidence * 100)}%\n`)
    lines.push(`Recommendation: ${rec.label}\n\n`)
    lines.push(`Summary:\n${report.summary}\n\n`)
    if (report.affection_tips?.length) {
      lines.push(`Interest Lifts:\n${report.affection_tips.map(t => `- ${t}`).join("\n")}\n\n`)
    }
    lines.push(`${"=".repeat(50)}\nSCENARIO RESULTS\n${"=".repeat(50)}\n\n`)
    report.scenario_results.forEach(sr => {
      lines.push(`${sr.scenario_name}\nAvg: ${sr.avg_score} | Trimmed: ${sr.trimmed_avg_score}\n\n`)
      sr.transcripts.slice(0, 2).forEach((t, i) => {
        lines.push(`--- Simulation ${i + 1} ---\n`)
        t.forEach(m => lines.push(`${m.speaker === "A" ? pa.name : pb.name}: ${m.text}\n`))
        lines.push("\n")
      })
    })
    const blob = new Blob([lines.join("")], { type: "text/plain" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `ditto-report-${pa.name}-${pb.name}.txt`.toLowerCase().replace(/\s+/g, "-")
    a.click()
  }

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-10 fade-up">
        {/* Back */}
        <button onClick={() => router.push("/")} className="text-xs mb-6 block"
          style={{ color: "rgba(255,255,255,0.65)" }}>
          ← New simulation
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-1"
            style={{ background: "linear-gradient(135deg, #d4af37, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            {pa.name} × {pb.name}
          </h1>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
            {report.scenario_results.length} scenarios · {nSims} loops each · 2 judges · fast pool scan included
          </p>
        </div>

        {/* Hero card */}
        <div className="rounded-2xl p-8 mb-6 card-glow" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(212,175,55,0.2)" }}>
          <div className="flex flex-col md:flex-row items-center gap-8">
            {/* Score rings */}
            <div className="flex gap-6 items-end">
              <div className="text-center">
                <ScoreRing score={report.overall_score} size={120} />
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>Raw Avg</p>
              </div>
              <div className="text-center">
                <ScoreRing score={report.trimmed_overall_score} size={96} />
                <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.65)" }}>Trimmed Avg</p>
              </div>
            </div>

            {/* Summary */}
            <div className="flex-1 text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
                style={{ background: `${rec.color}18`, border: `1px solid ${rec.color}50`, color: rec.color }}>
                ● {rec.label}
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(212,175,55,0.6)" }}>AI Judge Summary</p>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.9)" }}>{report.summary}</p>
              <div className="flex gap-4 mt-4 text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
                <span>Confidence: <span style={{ color: "#d4af37" }}>{Math.round(report.confidence * 100)}%</span></span>
                <span>|</span>
                <button onClick={exportFullReport} style={{ color: "#a855f7", textDecoration: "underline" }}>Export Full Report</button>
              </div>
            </div>
          </div>
        </div>

        <AffectionPanel score={report.affection_score} tips={report.affection_tips} />

        {/* Scenario breakdown bar chart */}
        <div className="rounded-2xl p-6 mb-6" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(212,175,55,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "rgba(212,175,55,0.6)" }}>
            Scenario Scores — Raw vs Trimmed
          </p>
          <div className="space-y-3">
            {report.scenario_results.map(sr => {
              const icon = SCENARIO_ICONS[sr.scenario_id] || "🎭"
              return (
                <div key={sr.scenario_id}>
                  <div className="flex justify-between text-xs mb-1" style={{ color: "rgba(255,255,255,0.75)" }}>
                    <span>{icon} {sr.scenario_name}</span>
                    <span style={{ color: "#d4af37" }}>{Math.round(sr.avg_score)} / <span style={{ color: "#a855f7" }}>{Math.round(sr.trimmed_avg_score)}</span></span>
                  </div>
                  <div className="relative h-2 rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="absolute inset-y-0 left-0 rounded-full opacity-40"
                      style={{ width: `${sr.avg_score}%`, background: "#d4af37" }} />
                    <div className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${sr.trimmed_avg_score}%`, background: "linear-gradient(90deg,#d4af37,#a855f7)", height: "60%", top: "20%" }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs mt-3" style={{ color: "rgba(255,255,255,0.55)" }}>
            Gold = Chemistry judge (GPT-5.5). Purple = Values judge (Claude Opus 4.7).
          </p>
        </div>

        {/* Candidate recommendations */}
        {(report.pa_best_matches?.length > 0 || report.pb_best_matches?.length > 0) && (
          <div className="rounded-2xl p-6 mt-6 mb-2" style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "#a855f7" }}>
              Current Match + Other Candidate Leads
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {([
                { name: pa.name, partner: pb.name, best: report.pa_best_matches },
                { name: pb.name, partner: pa.name, best: report.pb_best_matches },
              ] as { name: string; partner: string; best: BestMatch[] }[]).map(({ name, partner, best }) => (
                <div key={name}>
                  <p className="text-xs font-semibold mb-3" style={{ color: "#d4af37" }}>For {name}:</p>
                  <CurrentMatchCard partnerName={partner} score={report.overall_score} />
                  <p className="text-xs font-semibold mb-2 mt-4" style={{ color: "rgba(255,255,255,0.62)" }}>
                    Other leads from the pool:
                  </p>
                  {best.length === 0 ? (
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>No other profiles to compare</p>
                  ) : (
                    best.map((m, i) => <CandidateLeadCard key={`${name}-${m.name}-${i}`} match={m} index={i} />)
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scenario cards */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(212,175,55,0.6)" }}>
            Conversation Logs + Judge Verdicts
          </p>
          {report.scenario_results.map(sr => (
            <ScenarioCard key={sr.scenario_id} sr={sr} paName={pa.name} pbName={pb.name} />
          ))}
        </div>
      </div>
    </div>
  )
}
