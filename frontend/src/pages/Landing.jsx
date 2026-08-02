import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Plus, Trash2, Cpu, Zap, ChevronRight,
  Camera, FileText, AlertCircle, Loader2, PenTool
} from 'lucide-react'
import { submitManualNetlist, extractNetlistFromPhoto } from '../api/client'
import SchematicBuilder from '../components/SchematicBuilder'

const COMPONENT_TYPES = [
  'resistor', 'capacitor', 'LED', 'diode', 'IC',
  'battery', 'switch', 'transistor', 'inductor',
  'voltage_regulator', 'microcontroller', 'crystal', 'fuse', 'relay', 'unknown',
]

const UNIT_HINTS = {
  resistor: 'ohm',
  capacitor: 'F',
  inductor: 'H',
  battery: 'V',
  voltage_regulator: 'V',
}

let compCounter = 1

function newComponent() {
  return {
    id: `C${compCounter++}`,
    type: 'resistor',
    value: '',
    unit: 'ohm',
    pins: [{ name: 'a', node: '' }, { name: 'b', node: '' }],
  }
}

export default function Landing() {
  const nav = useNavigate()

  const [mode, setMode] = useState('photo') // 'manual' | 'photo'
  const [components, setComponents] = useState([newComponent()])
  const [supplyVoltage, setSupplyVoltage] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Photo state
  const [dragOver, setDragOver] = useState(false)
  const [photo, setPhoto] = useState(null)
  const fileRef = useRef()

  // ── Manual helpers ────────────────────────────────────────────────────────

  const addComponent = () => setComponents(cs => [...cs, newComponent()])

  const removeComponent = (i) =>
    setComponents(cs => cs.filter((_, idx) => idx !== i))

  const updateComp = (i, field, val) =>
    setComponents(cs => cs.map((c, idx) => {
      if (idx !== i) return c
      const updated = { ...c, [field]: val }
      if (field === 'type') updated.unit = UNIT_HINTS[val] || ''
      return updated
    }))

  const updatePin = (compIdx, pinIdx, field, val) =>
    setComponents(cs => cs.map((c, i) => {
      if (i !== compIdx) return c
      const pins = c.pins.map((p, j) =>
        j === pinIdx ? { ...p, [field]: val } : p
      )
      return { ...c, pins }
    }))

  const addPin = (compIdx) =>
    setComponents(cs => cs.map((c, i) => {
      if (i !== compIdx) return c
      return { ...c, pins: [...c.pins, { name: `pin${c.pins.length + 1}`, node: '' }] }
    }))

  const removePin = (compIdx, pinIdx) =>
    setComponents(cs => cs.map((c, i) => {
      if (i !== compIdx) return c
      return { ...c, pins: c.pins.filter((_, j) => j !== pinIdx) }
    }))

  // ── Build netlist from form data ──────────────────────────────────────────

  const buildNetlist = () => {
    const connections = []
    const comps = components.map(c => {
      const pins = c.pins.map(p => {
        if (p.node) connections.push({ component_id: c.id, pin_name: p.name, node: p.node })
        return { name: p.name, node: p.node || null }
      })
      return {
        id: c.id,
        type: c.type,
        value: c.value ? parseFloat(c.value) : null,
        unit: c.unit || null,
        pins,
        properties: {},
      }
    })
    return {
      components: comps,
      connections,
      supply_voltage: supplyVoltage ? parseFloat(supplyVoltage) : null,
    }
  }

  // ── Submit manual ─────────────────────────────────────────────────────────

  const handleManualSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (components.length === 0) return setError('Add at least one component.')
    setLoading(true)
    try {
      const netlist = buildNetlist()
      const submission = await submitManualNetlist(netlist)
      nav(`/review/${submission.id}`)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleBuildSubmit = async (netlist) => {
    setError(null)
    setLoading(true)
    try {
      const submission = await submitManualNetlist(netlist)
      nav(`/review/${submission.id}`)
    } catch (err) {
      setError(err?.response?.data?.detail || err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Photo ────────────────────────────────────────────────────────────────

  const handleFile = (file) => {
    if (!file?.type.startsWith('image/')) return setError('Please upload an image file.')
    setPhoto(file)
    setError(null)
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const handlePhotoSubmit = async (e) => {
    e.preventDefault()
    if (!photo) return setError('Please select a photo.')
    setError(null)
    setLoading(true)
    try {
      const result = await extractNetlistFromPhoto(photo)
      nav('/review/new', { state: { extraction: result, photo } })
    } catch (err) {
      const detail = err?.response?.data?.detail
      // Vision model doesn't support images → switch to manual entry
      if (err?.response?.status === 503 || detail?.code === 'VISION_UNSUPPORTED') {
        setMode('manual')
        setError(
          '📷 Vision extraction is not available with the current AI model. ' +
          'Switched to Manual Entry — please describe your circuit using the form below.'
        )
      } else {
        setError(detail?.message || detail || err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-slide-up">
      {/* Hero */}
      <div className="text-center space-y-3 pt-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full
                        bg-brand-500/10 border border-brand-500/20 text-brand-400 text-xs font-semibold">
          <Zap size={11} />
          AI-Powered Circuit Analysis
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">
          Analyse your circuit
        </h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto">
          Upload a photo or enter components manually. We run deterministic electrical
          checks + LLM-powered security analysis in seconds.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex bg-surface-900 rounded-xl p-1 mb-8 shadow-inner overflow-hidden border border-white/5">
        <button
          onClick={() => setMode('photo')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all
            ${mode === 'photo' ? 'bg-surface-800 text-brand-400 shadow-sm border border-white/5' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/50'}`}
        >
          <Camera size={16} /> Photo Upload
        </button>
        <button
          onClick={() => setMode('build')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all
            ${mode === 'build' ? 'bg-surface-800 text-brand-400 shadow-sm border border-white/5' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/50'}`}
        >
          <PenTool size={16} /> Draw Schematic
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-all
            ${mode === 'manual' ? 'bg-surface-800 text-brand-400 shadow-sm border border-white/5' : 'text-slate-400 hover:text-slate-200 hover:bg-surface-800/50'}`}
        >
          <FileText size={16} /> Manual Entry
        </button>
      </div>

      {/* ── MANUAL ENTRY ── */}
      {mode === 'manual' && (
        <form onSubmit={handleManualSubmit} className="space-y-4">
          {/* Supply voltage */}
          <div className="card p-4 flex items-center gap-4">
            <Zap size={18} className="text-amber-400 shrink-0" />
            <div className="flex-1">
              <label className="section-label block mb-1">Supply Voltage (optional)</label>
              <input
                id="supply-voltage"
                type="number"
                step="any"
                min="0"
                placeholder="e.g. 5.0"
                value={supplyVoltage}
                onChange={e => setSupplyVoltage(e.target.value)}
                className="input"
              />
            </div>
            <span className="text-slate-500 text-sm self-end mb-3">V</span>
          </div>

          {/* Components */}
          <div className="space-y-3">
            {components.map((comp, ci) => (
              <div key={ci} className="card p-4 space-y-3 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Cpu size={14} className="text-brand-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-200 flex-1">
                    Component {ci + 1}
                  </span>
                  {components.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeComponent(ci)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>

                {/* ID + Type + Value + Unit */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="section-label block mb-1">ID</label>
                    <input
                      id={`comp-id-${ci}`}
                      className="input"
                      value={comp.id}
                      onChange={e => updateComp(ci, 'id', e.target.value)}
                      placeholder="R1"
                    />
                  </div>
                  <div>
                    <label className="section-label block mb-1">Type</label>
                    <select
                      id={`comp-type-${ci}`}
                      className="input"
                      value={comp.type}
                      onChange={e => updateComp(ci, 'type', e.target.value)}
                    >
                      {COMPONENT_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="section-label block mb-1">Value</label>
                    <input
                      id={`comp-val-${ci}`}
                      type="number"
                      step="any"
                      className="input"
                      value={comp.value}
                      onChange={e => updateComp(ci, 'value', e.target.value)}
                      placeholder="e.g. 150"
                    />
                  </div>
                  <div>
                    <label className="section-label block mb-1">Unit</label>
                    <input
                      id={`comp-unit-${ci}`}
                      className="input"
                      value={comp.unit}
                      onChange={e => updateComp(ci, 'unit', e.target.value)}
                      placeholder="ohm / F / V"
                    />
                  </div>
                </div>

                {/* Pins */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="section-label">Pins & Connections</label>
                    <button
                      type="button"
                      onClick={() => addPin(ci)}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <Plus size={11} /> Add pin
                    </button>
                  </div>
                  <div className="space-y-2">
                    {comp.pins.map((pin, pi) => (
                      <div key={pi} className="flex gap-2 items-center">
                        <input
                          id={`pin-name-${ci}-${pi}`}
                          className="input flex-1"
                          placeholder="pin name"
                          value={pin.name}
                          onChange={e => updatePin(ci, pi, 'name', e.target.value)}
                        />
                        <span className="text-slate-600 text-xs">→</span>
                        <input
                          id={`pin-node-${ci}-${pi}`}
                          className="input flex-1"
                          placeholder="node (VCC / GND / node1)"
                          value={pin.node}
                          onChange={e => updatePin(ci, pi, 'node', e.target.value)}
                        />
                        {comp.pins.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePin(ci, pi)}
                            className="text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addComponent}
            className="btn-ghost w-full justify-center border-dashed"
            id="add-component"
          >
            <Plus size={15} /> Add Component
          </button>

          {error && (
            <div className={`flex items-start gap-2 rounded-xl p-3 text-sm border
              ${error.startsWith('📷')
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center py-3 text-base"
            id="submit-manual"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : <><ChevronRight size={16} /> Continue to Review</>}
          </button>
        </form>
      )}

      {/* ── PHOTO UPLOAD ── */}
      {mode === 'photo' && (
        <form onSubmit={handlePhotoSubmit} className="space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`card relative flex flex-col items-center justify-center gap-4
                        p-12 cursor-pointer transition-all duration-300 select-none
                        ${dragOver
                          ? 'border-brand-500/60 bg-brand-500/5 scale-[1.01]'
                          : 'border-dashed hover:border-white/20 hover:bg-white/2'}`}
            id="photo-dropzone"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
            {photo ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-brand-500/20 flex items-center
                                justify-center border border-brand-500/40">
                  <Camera size={28} className="text-brand-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">{photo.name}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(photo.size / 1024).toFixed(0)} KB — click to change
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-surface-700/60 flex items-center
                                justify-center border border-white/8 animate-pulse-slow">
                  <Upload size={28} className="text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-200">
                    Drag & drop or click to upload
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    PNG, JPG, WEBP — our AI will extract the circuit
                  </p>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className={`flex items-start gap-2 rounded-xl p-3 text-sm border
              ${error.startsWith('📷')
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!photo || loading}
            className="btn-primary w-full justify-center py-3 text-base"
            id="submit-photo"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Extracting circuit…</>
              : <><Zap size={16} /> Extract & Review</>}
          </button>
        </form>
      )}

      {/* ── DRAW SCHEMATIC ── */}
      {mode === 'build' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <SchematicBuilder onAnalyze={handleBuildSubmit} />
          {error && (
            <div className={`mt-4 flex items-start gap-2 rounded-xl p-3 text-sm border
              ${error.startsWith('📷')
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          {loading && (
            <div className="mt-4 flex items-center justify-center text-sm text-brand-400 gap-2">
              <Loader2 size={16} className="animate-spin" /> Saving schematic...
            </div>
          )}
        </div>
      )}
    </div>
  )
}
