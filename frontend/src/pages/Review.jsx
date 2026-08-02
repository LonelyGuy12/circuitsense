import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { Zap, Loader2, CheckCircle, AlertCircle, Info, Eye } from 'lucide-react'
import { getCircuit, submitManualNetlist, analyzeCircuit } from '../api/client'
import CircuitDiagram from '../components/CircuitDiagram'

export default function Review() {
  const { id } = useParams()   // 'new' for photo-extracted, otherwise a real id
  const location = useLocation()
  const nav = useNavigate()

  const [netlist, setNetlist] = useState(null)
  const [confidence, setConfidence] = useState(null)
  const [notes, setNotes] = useState(null)
  const [submissionId, setSubmissionId] = useState(id !== 'new' ? id : null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState(null)

  // Layer toggles
  const [runLayerA, setRunLayerA] = useState(true)
  const [runLayerB, setRunLayerB] = useState(true)

  // ── Load netlist ─────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        if (id === 'new') {
          // Photo extraction result passed via router state
          const { extraction } = location.state || {}
          if (!extraction) { nav('/'); return }
          setNetlist(extraction.netlist)
          setConfidence(extraction.confidence)
          setNotes(extraction.extraction_notes)
        } else {
          const data = await getCircuit(id)
          setNetlist(data.netlist)
          setSubmissionId(id)
          if (data.summary) setNotes(data.summary)
        }
      } catch (err) {
        setError(err?.response?.data?.detail || err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  // ── Run analysis ─────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    setError(null)
    setAnalyzing(true)
    try {
      let sid = submissionId

      // If photo-extracted netlist not yet stored, store it first
      if (!sid) {
        const stored = await submitManualNetlist(netlist)
        sid = stored.id
        setSubmissionId(sid)
      }

      await analyzeCircuit(sid, { runLayerA, runLayerB })
      nav(`/report/${sid}`)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
        <Loader2 size={28} className="animate-spin text-brand-400" />
        <span className="text-sm">Loading netlist…</span>
      </div>
    )
  }

  if (error && !netlist) {
    return (
      <div className="max-w-2xl mx-auto card p-8 text-center space-y-3">
        <AlertCircle size={32} className="text-red-400 mx-auto" />
        <p className="text-slate-300">{error}</p>
        <button onClick={() => nav('/')} className="btn-ghost">← Back</button>
      </div>
    )
  }

  const componentCount = netlist?.components?.length || 0
  const connectionCount = netlist?.connections?.length || 0

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Review Circuit</h1>
          <p className="text-slate-400 text-sm mt-1">
            Verify the parsed netlist before running analysis.
          </p>
        </div>
        <button onClick={() => nav('/')} className="btn-ghost shrink-0">
          ← Back
        </button>
      </div>

      {/* Confidence banner (photo mode) */}
      {confidence && (
        <div className={`rounded-xl border p-4 flex items-start gap-3
          ${confidence === 'high'
            ? 'bg-green-500/8 border-green-500/20 text-green-300'
            : confidence === 'medium'
            ? 'bg-amber-500/8 border-amber-500/20 text-amber-300'
            : 'bg-red-500/8 border-red-500/20 text-red-300'}`}
        >
          {confidence === 'high' ? <CheckCircle size={16} className="mt-0.5 shrink-0" /> : <Info size={16} className="mt-0.5 shrink-0" />}
          <div>
            <p className="text-sm font-semibold capitalize">
              Extraction confidence: {confidence}
            </p>
            {notes && <p className="text-xs mt-1 opacity-80">{notes}</p>}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Components', value: componentCount },
          { label: 'Connections', value: connectionCount },
          { label: 'Supply', value: netlist?.supply_voltage ? `${netlist.supply_voltage} V` : 'N/A' },
        ].map(stat => (
          <div key={stat.label} className="card p-4 text-center">
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="section-label mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Circuit diagram preview */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <Eye size={15} className="text-brand-400" />
          <span className="text-sm font-semibold text-slate-200">Circuit Preview</span>
        </div>
        <CircuitDiagram netlist={netlist} />
      </div>

      {/* Component table */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Components</span>
          <span className="badge bg-surface-700 text-slate-400 border border-white/5 !uppercase-none">
            {componentCount}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['ID', 'Type', 'Value', 'Pins'].map(h => (
                  <th key={h} className="px-4 py-3 text-left section-label font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {netlist?.components?.map((comp, i) => (
                <tr key={comp.id}
                    className={`border-b border-white/3 transition-colors hover:bg-white/2
                                ${i % 2 === 0 ? '' : 'bg-white/[0.02]'}`}>
                  <td className="px-4 py-3 font-mono text-brand-400 font-semibold">{comp.id}</td>
                  <td className="px-4 py-3 text-slate-300">{comp.type}</td>
                  <td className="px-4 py-3 text-slate-400 font-mono">
                    {comp.value != null ? `${comp.value} ${comp.unit || ''}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {comp.pins?.map(p => (
                        <span key={p.name}
                              className="px-1.5 py-0.5 rounded bg-surface-700 text-slate-400 text-xs font-mono border border-white/5">
                          {p.name}{p.node ? ` → ${p.node}` : ''}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analysis options */}
      <div className="card p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-200">Analysis Options</p>
        <div className="flex gap-6">
          {[
            { key: 'a', label: 'Layer A — Electrical Correctness', val: runLayerA, set: setRunLayerA },
            { key: 'b', label: 'Layer B — Security Analysis (LLM)', val: runLayerB, set: setRunLayerB },
          ].map(opt => (
            <label key={opt.key}
                   className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                id={`layer-${opt.key}`}
                checked={opt.val}
                onChange={e => opt.set(e.target.checked)}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-sm">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        id="run-analysis"
        onClick={handleAnalyze}
        disabled={analyzing || componentCount === 0}
        className="btn-primary w-full justify-center py-3.5 text-base"
      >
        {analyzing
          ? <><Loader2 size={16} className="animate-spin" /> Running Analysis…</>
          : <><Zap size={16} /> Run Analysis</>}
      </button>
    </div>
  )
}
