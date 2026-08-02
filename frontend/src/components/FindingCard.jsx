import { AlertTriangle, Info, Zap, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

const SEVERITY_CONFIG = {
  critical: {
    className: 'badge-critical',
    icon: <Zap size={11} />,
    border: 'border-red-500/20',
    glow: 'hover:border-red-500/40',
    bg: 'bg-red-500/5',
  },
  warning: {
    className: 'badge-warning',
    icon: <AlertTriangle size={11} />,
    border: 'border-amber-500/20',
    glow: 'hover:border-amber-500/40',
    bg: 'bg-amber-500/5',
  },
  info: {
    className: 'badge-info',
    icon: <Info size={11} />,
    border: 'border-blue-500/20',
    glow: 'hover:border-blue-500/40',
    bg: 'bg-blue-500/5',
  },
}

export default function FindingCard({ finding }) {
  const [expanded, setExpanded] = useState(finding.severity === 'critical')
  const cfg = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info

  return (
    <div
      className={`rounded-xl border ${cfg.border} ${cfg.bg} ${cfg.glow}
                  transition-all duration-200 overflow-hidden`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 p-4 text-left"
        id={`finding-${finding.id}`}
      >
        <span className={cfg.className + ' mt-0.5 shrink-0'}>
          {cfg.icon}
          {finding.severity}
        </span>
        <span className="flex-1 text-sm font-semibold text-slate-200 leading-snug">
          {finding.title}
        </span>
        <span className="shrink-0 text-slate-500 mt-0.5">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {/* Body — collapsible */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-fade-in">
          <div className="divider !my-0 !mb-3" />

          {/* Related components */}
          {finding.related_component_ids?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {finding.related_component_ids.map(id => (
                <span
                  key={id}
                  className="px-2 py-0.5 rounded-md bg-surface-700 text-slate-300
                             text-xs font-mono border border-white/5"
                >
                  {id}
                </span>
              ))}
            </div>
          )}

          <p className="text-sm text-slate-300 leading-relaxed">
            {finding.explanation}
          </p>

          {/* Fix suggestion */}
          <div className="rounded-lg bg-surface-800/60 border border-white/5 p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Fix suggestion
            </p>
            <p className="text-sm text-slate-300 leading-relaxed">
              {finding.fix_suggestion}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
