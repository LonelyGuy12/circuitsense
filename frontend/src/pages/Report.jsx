import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle, CheckCircle, Shield, Zap,
  Loader2, ChevronLeft, ExternalLink
} from 'lucide-react'
import { getCircuit } from '../api/client'
import FindingCard from '../components/FindingCard'
import CircuitDiagram from '../components/CircuitDiagram'

function SummaryBanner({ summary, findings }) {
  const critical = findings.filter(f => f.severity === 'critical').length
  const warnings = findings.filter(f => f.severity === 'warning').length
  const infos    = findings.filter(f => f.severity === 'info').length
  const total    = findings.length

  const color = critical > 0 ? 'red' : warnings > 0 ? 'amber' : 'green'
  const colors = {
    red:   'from-red-500/20 to-red-500/5 border-red-500/30',
    amber: 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
    green: 'from-green-500/20 to-green-500/5 border-green-500/30',
  }

  return (
    <div className={`card bg-gradient-to-r ${colors[color]} p-6 space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white">{summary}</h2>
        </div>
        {total === 0
          ? <CheckCircle size={32} className="text-green-400 shrink-0" />
          : <AlertCircle size={32} className="text-red-400 shrink-0" />}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          {critical > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/15 border border-red-500/25 px-3 py-1.5">
              <Zap size={13} className="text-red-400" />
              <span className="text-sm font-semibold text-red-300">{critical} Critical</span>
            </div>
          )}
          {warnings > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-500/25 px-3 py-1.5">
              <AlertCircle size={13} className="text-amber-400" />
              <span className="text-sm font-semibold text-amber-300">{warnings} Warning{warnings !== 1 ? 's' : ''}</span>
            </div>
          )}
          {infos > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-blue-500/15 border border-blue-500/25 px-3 py-1.5">
              <CheckCircle size={13} className="text-blue-400" />
              <span className="text-sm font-semibold text-blue-300">{infos} Info</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FindingsGroup({ title, icon, findings, emptyMsg }) {
  if (findings.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        </div>
        <div className="rounded-xl border border-white/5 bg-surface-900/40 p-4
                        text-center text-slate-500 text-sm">
          {emptyMsg}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="badge bg-surface-700 text-slate-400 border border-white/5">
          {findings.length}
        </span>
      </div>
      <div className="space-y-2">
        {findings.map(f => <FindingCard key={f.id || f.title} finding={f} />)}
      </div>
    </div>
  )
}

export default function Report() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCircuit(id)
      .then(setData)
      .catch(err => setError(err?.response?.data?.detail || err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Loader2 size={28} className="animate-spin text-brand-400" />
        <span className="text-sm">Loading report…</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto card p-8 text-center space-y-3">
        <AlertCircle size={32} className="text-red-400 mx-auto" />
        <p className="text-slate-300">{error || 'Report not found'}</p>
        <button onClick={() => nav('/')} className="btn-ghost">← Home</button>
      </div>
    )
  }

  const findings = data.findings || []
  const correctness = findings.filter(f => f.layer === 'correctness')
  const security = findings.filter(f => f.layer === 'security')

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Nav */}
      <div className="flex items-center justify-between gap-4">
        <button onClick={() => nav('/')} className="btn-ghost">
          <ChevronLeft size={15} /> New Analysis
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-mono">ID: {id.slice(0, 8)}…</span>
          <span className={`badge ${data.analysis_status === 'done'
              ? 'badge-info' : data.analysis_status === 'error'
              ? 'badge-critical' : 'badge-warning'}`}>
            {data.analysis_status}
          </span>
        </div>
      </div>

      {/* Summary banner */}
      <SummaryBanner
        summary={data.summary || 'Analysis complete'}
        findings={findings}
      />

      {/* Circuit diagram */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Circuit Diagram</h3>
        <CircuitDiagram netlist={data.netlist} />
      </div>

      {/* Findings — Layer A */}
      <FindingsGroup
        title="Electrical Correctness"
        icon={<Zap size={15} className="text-amber-400" />}
        findings={correctness}
        emptyMsg="✅ No electrical issues detected."
      />

      {/* Findings — Layer B */}
      <FindingsGroup
        title="Security Analysis"
        icon={<Shield size={15} className="text-purple-400" />}
        findings={security}
        emptyMsg="✅ No security concerns detected."
      />

      {/* Re-analyze */}
      <div className="card p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-200">Want to modify the circuit?</p>
          <p className="text-xs text-slate-500 mt-0.5">Go back and adjust components, then re-run.</p>
        </div>
        <button onClick={() => nav(`/review/${id}`)} className="btn-ghost shrink-0">
          <ExternalLink size={14} /> Edit & Re-run
        </button>
      </div>
    </div>
  )
}
