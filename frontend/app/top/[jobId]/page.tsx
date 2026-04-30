"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getMatch, type CompatibilityReport, type TopMatchesReport } from "@/lib/api"

const REC: Record<string, { label: string; color: string }> = {
  strong_match: { label: "Strong Match", color: "#22c55e" },
  promising: { label: "Promising", color: "#a855f7" },
  uncertain: { label: "Uncertain", color: "#f59e0b" },
  skip: { label: "Skip", color: "#ef4444" },
}

function isTopReport(value: unknown): value is TopMatchesReport {
  return Boolean(value && typeof value === "object" && (value as TopMatchesReport).kind === "top_matches" && Array.isArray((value as TopMatchesReport).reports))
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? "#22c55e" : score >= 65 ? "#a855f7" : score >= 50 ? "#f59e0b" : "#ef4444"
  return (
    <div className="h-20 w-20 rounded-full flex flex-col items-center justify-center"
      style={{ border: `2px solid ${color}`, boxShadow: `0 0 24px ${color}33` }}>
      <span className="text-2xl font-bold font-mono" style={{ color }}>{score}</span>
      <span className="text-xs" style={{ color: "rgba(255,255,255,0.56)" }}>/100</span>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1" style={{ color: "rgba(255,255,255,0.62)" }}>
        <span>{label}</span>
        <span>{value}/100</span>
      </div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: "linear-gradient(90deg,#d4af37,#a855f7)" }} />
      </div>
    </div>
  )
}

function ShareCard({ report, rank }: { report: CompatibilityReport; rank: number }) {
  const pa = report.profile_a
  const pb = report.profile_b
  const rec = REC[report.recommendation] || REC.uncertain
  const shareText = `${pa.name} x ${pb.name}: ${report.overall_score}/100 on Ditto Simulator. ${rec.label}. ${report.breakdown?.long_term_risk || ""}`
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-[28px] overflow-hidden"
      style={{ background: "#05060a", border: "1px solid rgba(255,255,255,0.14)" }}>
      <div className="px-4 py-3 text-center" style={{ background: "#1c1c1e", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-xs font-semibold" style={{ color: "#f5f5f7" }}>Messages</p>
        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>Ditto match card</p>
      </div>
      <div className="p-4" style={{ background: "linear-gradient(180deg,#0b0b10,#111117)" }}>
        <div className="ml-auto max-w-[88%] rounded-[22px] p-4"
          style={{ background: "linear-gradient(180deg,#34aadc,#007aff)", color: "#fff", borderBottomRightRadius: 6 }}>
          <p className="text-xs opacity-80 mb-1">Top Match #{rank}</p>
          <p className="text-lg font-bold">{pa.name} x {pb.name}</p>
          <p className="text-3xl font-bold font-mono mt-2">{report.overall_score}/100</p>
          <p className="text-sm mt-2 opacity-90">{rec.label}</p>
          <p className="text-xs mt-3 leading-relaxed opacity-85">{report.breakdown?.long_term_risk}</p>
        </div>
      </div>
      <div className="p-3 flex gap-2" style={{ background: "#0b0b10", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={copy} className="flex-1 rounded-full px-4 py-2 text-xs"
          style={{ background: "#1c1c1e", color: copied ? "#22c55e" : "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {copied ? "Copied" : "Copy iMessage card text"}
        </button>
      </div>
    </div>
  )
}

function MatchCard({ report, rank, onOpen }: { report: CompatibilityReport; rank: number; onOpen: () => void }) {
  const pa = report.profile_a
  const pb = report.profile_b
  const rec = REC[report.recommendation] || REC.uncertain
  const breakdown = report.breakdown

  return (
    <div className="rounded-2xl p-5"
      style={{ background: "rgba(255,255,255,0.03)", border: rank === 1 ? "1px solid rgba(212,175,55,0.32)" : "1px solid rgba(168,85,247,0.18)" }}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: rank === 1 ? "#d4af37" : "#a855f7" }}>
            Fully simulated Top Match #{rank}
          </p>
          <h2 className="text-2xl font-bold" style={{ color: "#fff" }}>{pb.name}</h2>
          <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>
            {pb.age} · {pb.gender} · {pb.communication_style}
          </p>
        </div>
        <ScoreBadge score={report.overall_score} />
      </div>

      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-4"
        style={{ background: `${rec.color}18`, border: `1px solid ${rec.color}50`, color: rec.color }}>
        {rec.label}
      </div>

      <p className="text-sm leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.82)" }}>
        {report.summary}
      </p>

      {breakdown && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="space-y-2">
            <MiniMetric label="Chemistry" value={breakdown.chemistry} />
            <MiniMetric label="Values alignment" value={breakdown.values_alignment} />
            <MiniMetric label="Emotional safety" value={breakdown.emotional_safety} />
            <MiniMetric label="Conflict handling" value={breakdown.conflict_handling} />
          </div>
          <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#d4af37" }}>Long-term risk</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>{breakdown.long_term_risk}</p>
            <p className="text-xs font-semibold uppercase tracking-wider mt-4 mb-2" style={{ color: "#a855f7" }}>What raised the score</p>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.72)" }}>{breakdown.score_increased[0]}</p>
          </div>
        </div>
      )}

      {!!report.next_chat_suggestions?.length && (
        <div className="rounded-xl p-3 mb-4" style={{ background: "rgba(212,175,55,0.055)", border: "1px solid rgba(212,175,55,0.15)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#d4af37" }}>Next chat suggestion</p>
          <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>{report.next_chat_suggestions[0]}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "rgba(255,255,255,0.58)" }}>
            Scenario scores
          </p>
          <div className="space-y-2">
            {report.scenario_results.map(sr => (
              <div key={sr.scenario_id} className="flex items-center gap-3">
                <span className="text-xs w-44 truncate" style={{ color: "rgba(255,255,255,0.68)" }}>{sr.scenario_name}</span>
                <div className="flex-1 h-2 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full" style={{ width: `${sr.trimmed_avg_score}%`, background: "linear-gradient(90deg,#d4af37,#a855f7)" }} />
                </div>
                <span className="text-xs font-mono w-14 text-right" style={{ color: "#d4af37" }}>{Math.round(sr.trimmed_avg_score)}/100</span>
              </div>
            ))}
          </div>
          <button onClick={onOpen} className="mt-4 text-sm px-4 py-2 rounded-xl"
            style={{ background: "rgba(168,85,247,0.16)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.32)" }}>
            Open full simulation report
          </button>
        </div>
        <ShareCard report={report} rank={rank} />
      </div>
    </div>
  )
}

function LoadingScreen({ progress, jobId }: { progress: string; jobId: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-xl w-full rounded-2xl p-6 text-center"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(212,175,55,0.18)" }}>
        <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#d4af37" }}>Finding Top 3 Matches</p>
        <h1 className="text-2xl font-bold mb-3"
          style={{ background: "linear-gradient(135deg,#d4af37,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Agent is virtual dating the pool
        </h1>
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.68)" }}>{progress || "Running L1/L2/L3 pipeline..."}</p>
        <p className="text-xs mt-4" style={{ color: "rgba(255,255,255,0.34)" }}>Job ID: {jobId}</p>
      </div>
    </div>
  )
}

export default function TopMatchesPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const router = useRouter()
  const [topReport, setTopReport] = useState<TopMatchesReport | null>(null)
  const [status, setStatus] = useState("pending")
  const [progress, setProgress] = useState("")
  const [errDetail, setErrDetail] = useState("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const cached = sessionStorage.getItem(`top_report:${jobId}`)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (isTopReport(parsed)) {
        setTopReport(parsed)
        setStatus("done")
        setProgress("complete")
        return
      }
    }

    const poll = async () => {
      const data = await getMatch(jobId)
      setStatus(data.status)
      setProgress(data.progress)
      if (isTopReport(data.report)) {
        setTopReport(data.report)
        sessionStorage.setItem(`top_report:${jobId}`, JSON.stringify(data.report))
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

  const sortedReports = useMemo(() => {
    return [...(topReport?.reports || [])].sort((a, b) => b.overall_score - a.overall_score).slice(0, 3)
  }, [topReport])

  const openReport = (report: CompatibilityReport, idx: number) => {
    const childId = `${jobId}-${idx + 1}`
    sessionStorage.setItem(`report:${childId}`, JSON.stringify(report))
    sessionStorage.setItem("pa", JSON.stringify(report.profile_a))
    sessionStorage.setItem("pb", JSON.stringify(report.profile_b))
    router.push(`/result/${childId}`)
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <p className="text-red-400 text-lg mb-2">Top 3 search failed</p>
          <p className="text-xs text-zinc-500 mb-4">{errDetail}</p>
          <button onClick={() => router.push("/")} className="btn-gold text-sm">Try Again</button>
        </div>
      </div>
    )
  }

  if (!topReport) return <LoadingScreen progress={progress} jobId={jobId} />

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10 fade-up">
        <button onClick={() => router.push("/")} className="text-xs mb-6 block"
          style={{ color: "rgba(255,255,255,0.65)" }}>
          Back to new search
        </button>

        <div className="text-center mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#d4af37" }}>
            Fully simulated recommendations
          </p>
          <h1 className="text-4xl font-bold mb-2"
            style={{ background: "linear-gradient(135deg,#d4af37,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Top 3 Matches for {topReport.target.name}
          </h1>
          <p className="text-sm max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.7)" }}>
            These are not just profile-fit leads. Each person below passed L1/L2 and then ran L3 full virtual dates.
          </p>
        </div>

        <div className="rounded-2xl p-5 mb-5"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(212,175,55,0.14)" }}>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center">
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "#d4af37" }}>{topReport.pipeline.candidate_pool}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>pool</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "#d4af37" }}>{topReport.pipeline.l1_target}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>L1 target</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "#d4af37" }}>{topReport.pipeline.l2_target}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>L2 target</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "#a855f7" }}>{topReport.pipeline.l3_full_dates}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>L3 full dates</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "#a855f7" }}>{topReport.pipeline.scenarios}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>scenarios</p>
            </div>
            <div>
              <p className="text-xl font-bold font-mono" style={{ color: "#a855f7" }}>{topReport.pipeline.loops_per_scenario}</p>
              <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>loops each</p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {sortedReports.map((report, idx) => (
            <MatchCard key={`${report.profile_b.name}-${idx}`} report={report} rank={idx + 1} onOpen={() => openReport(report, idx)} />
          ))}
        </div>
      </div>
    </div>
  )
}
