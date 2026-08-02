import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, Zap, Shield, ChevronRight,
  Loader2, AlertCircle, Plus, Cpu
} from 'lucide-react'
import { listCircuits } from '../api/client'

function statusBadge(status) {
  const map = {
    done:    'badge-info',
    error:   'badge-critical',
    running: 'badge-warning',
    pending: 'bg-surface-700 text-slate-400 border border-white/5',
  }
  return `badge ${map[status] || map.pending}`
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return `${Math.round(diff)}s ago`
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  return new Date(dateStr).toLocaleDateString()
}

export default function History() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    listCircuits()
      .then(setData)
      .catch(err => setError(err?.response?.data?.detail || err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Loader2 size={28} className="animate-spin text-brand-400" />
        <span className="text-sm">Loading history…</span>
      </div>
    )
  }

  const submissions = data?.submissions || []

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">History</h1>
          <p className="text-slate-400 text-sm mt-1">All past circuit submissions</p>
        </div>
        <button
          id="new-analysis"
          onClick={() => nav('/')}
          className="btn-primary"
        >
          <Plus size={15} /> New Analysis
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {submissions.length === 0 ? (
        <div className="card p-12 text-center space-y-4">
          <Cpu size={40} className="text-slate-600 mx-auto" />
          <p className="text-slate-400">No circuits analysed yet.</p>
          <button onClick={() => nav('/')} className="btn-primary mx-auto">
            <Plus size={15} /> Analyse your first circuit
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(sub => {
            const findings = sub.findings || []
            const critical = findings.filter(f => f.severity === 'critical').length
            const warnings = findings.filter(f => f.severity === 'warning').length
            const security = findings.filter(f => f.layer === 'security').length

            return (
              <button
                key={sub.id}
                id={`history-${sub.id.slice(0, 8)}`}
                onClick={() => nav(sub.analysis_status === 'done' ? `/report/${sub.id}` : `/review/${sub.id}`)}
                className="card w-full text-left p-4 hover:border-white/15 hover:-translate-y-0.5
                           transition-all duration-200 group"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/20
                                  flex items-center justify-center shrink-0 mt-0.5
                                  group-hover:bg-brand-500/25 transition-colors">
                    <Cpu size={18} className="text-brand-400" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-slate-300 font-semibold">
                        {sub.id.slice(0, 8)}…
                      </span>
                      <span className={statusBadge(sub.analysis_status)}>
                        {sub.analysis_status}
                      </span>
                      <span className="badge bg-surface-700 text-slate-500 border border-white/5">
                        {sub.input_method}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={11} /> {timeAgo(sub.created_at)}
                      </span>
                      <span>
                        {sub.netlist?.components?.length || 0} components
                      </span>
                      {sub.analysis_status === 'done' && (
                        <>
                          {critical > 0 && (
                            <span className="flex items-center gap-1 text-red-400">
                              <Zap size={11} /> {critical} critical
                            </span>
                          )}
                          {warnings > 0 && (
                            <span className="text-amber-400">
                              {warnings} warning{warnings !== 1 ? 's' : ''}
                            </span>
                          )}
                          {security > 0 && (
                            <span className="flex items-center gap-1 text-purple-400">
                              <Shield size={11} /> {security} security
                            </span>
                          )}
                          {findings.length === 0 && (
                            <span className="text-green-400">✅ No issues</span>
                          )}
                        </>
                      )}
                    </div>

                    {sub.summary && (
                      <p className="text-xs text-slate-500 mt-1.5 truncate">
                        {sub.summary}
                      </p>
                    )}
                  </div>

                  <ChevronRight size={16} className="text-slate-600 group-hover:text-brand-400
                                                      transition-colors shrink-0 self-center" />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
