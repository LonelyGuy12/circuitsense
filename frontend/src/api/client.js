import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({ baseURL: BASE })

// ── Circuits ───────────────────────────────────────────────────────────────

/** Submit a manual netlist JSON (as an object). */
export async function submitManualNetlist(netlist) {
  const form = new FormData()
  form.append('netlist_json', JSON.stringify(netlist))
  const { data } = await api.post('/api/circuits', form)
  return data
}

/** Upload a circuit photo for vision extraction + storage. */
export async function submitPhoto(file) {
  const form = new FormData()
  form.append('image', file)
  const { data } = await api.post('/api/circuits', form)
  return data
}

/** Extract a netlist from a photo WITHOUT storing it. */
export async function extractNetlistFromPhoto(file) {
  const form = new FormData()
  form.append('image', file)
  const { data } = await api.post('/api/circuits/extract', form)
  return data   // { netlist, confidence, extraction_notes }
}

/** Trigger Layer A + B analysis on a stored submission. */
export async function analyzeCircuit(id, { runLayerA = true, runLayerB = true } = {}) {
  const { data } = await api.post(`/api/circuits/${id}/analyze`, {
    run_layer_a: runLayerA,
    run_layer_b: runLayerB,
  })
  return data
}

/** Get a single submission (netlist + findings). */
export async function getCircuit(id) {
  const { data } = await api.get(`/api/circuits/${id}`)
  return data
}

/** List all past submissions. */
export async function listCircuits({ skip = 0, limit = 50 } = {}) {
  const { data } = await api.get('/api/circuits', { params: { skip, limit } })
  return data
}
