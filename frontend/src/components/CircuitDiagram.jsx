import { useMemo } from 'react'

const COMP_COLORS = {
  resistor: { fill: '#1e3a5f', stroke: '#3b82f6', label: '#93c5fd' },
  capacitor: { fill: '#1a3a2a', stroke: '#22c55e', label: '#86efac' },
  LED: { fill: '#3a1f1a', stroke: '#f97316', label: '#fdba74' },
  diode: { fill: '#2d1f3a', stroke: '#a855f7', label: '#d8b4fe' },
  IC: { fill: '#1f2d3a', stroke: '#06b6d4', label: '#67e8f9' },
  battery: { fill: '#3a2a1a', stroke: '#eab308', label: '#fde047' },
  switch: { fill: '#1a2a3a', stroke: '#64748b', label: '#94a3b8' },
  transistor: { fill: '#2a1a3a', stroke: '#ec4899', label: '#f9a8d4' },
  microcontroller: { fill: '#1f2d1a', stroke: '#84cc16', label: '#bef264' },
  default: { fill: '#1f2535', stroke: '#475569', label: '#94a3b8' },
}

const NODE_COLORS = {
  power: '#fde047',
  ground: '#94a3b8',
  default: '#60a5fa',
}

const W = 100  // component box width
const H = 48   // component box height
const PAD = 30 // layout padding

function getCompColor(type) {
  return COMP_COLORS[type] || COMP_COLORS.default
}

function getNodeColor(name) {
  const n = name?.toLowerCase() || ''
  if (n.includes('vcc') || n.includes('vdd') || n.includes('v+') || n.includes('supply') || n.includes('vin') || n.includes('vbat')) return NODE_COLORS.power
  if (n.includes('gnd') || n.includes('ground') || n.includes('vss')) return NODE_COLORS.ground
  return NODE_COLORS.default
}

/** Simple grid layout: place components in rows of ~4 */
function layoutComponents(components) {
  const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(components.length))))
  const colW = W + 80
  const rowH = H + 80

  return components.map((comp, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      ...comp,
      x: PAD + col * colW + colW / 2,
      y: PAD + row * rowH + rowH / 2,
    }
  })
}

/** Gather unique nodes and assign positions between components */
function layoutNodes(connections, positioned) {
  const nodeMap = {}
  connections.forEach(conn => {
    if (!nodeMap[conn.node]) nodeMap[conn.node] = []
    nodeMap[conn.node].push(conn.component_id)
  })

  const compPos = Object.fromEntries(positioned.map(c => [c.id, c]))
  const nodes = {}

  Object.entries(nodeMap).forEach(([node, compIds]) => {
    // Average of all connected component positions, offset slightly
    const positions = compIds.map(id => compPos[id]).filter(Boolean)
    if (!positions.length) return
    const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length
    nodes[node] = { x: avgX, y: avgY - 35, name: node }
  })

  return nodes
}

function ComponentBox({ comp }) {
  const colors = getCompColor(comp.type)
  const label = comp.value != null
    ? `${comp.id} (${comp.value}${comp.unit || ''})`
    : comp.id

  return (
    <g transform={`translate(${comp.x - W / 2},${comp.y - H / 2})`}>
      <rect
        width={W} height={H}
        rx={8}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={1.5}
        opacity={0.95}
      />
      {/* type label */}
      <text
        x={W / 2} y={16}
        textAnchor="middle"
        fill={colors.stroke}
        fontSize={9}
        fontWeight="600"
        fontFamily="JetBrains Mono, monospace"
        textTransform="uppercase"
      >
        {comp.type}
      </text>
      {/* id label */}
      <text
        x={W / 2} y={30}
        textAnchor="middle"
        fill={colors.label}
        fontSize={11}
        fontWeight="700"
        fontFamily="Inter, sans-serif"
      >
        {comp.id}
      </text>
      {/* value */}
      {comp.value != null && (
        <text
          x={W / 2} y={43}
          textAnchor="middle"
          fill="#64748b"
          fontSize={9}
          fontFamily="JetBrains Mono, monospace"
        >
          {comp.value}{comp.unit || ''}
        </text>
      )}
    </g>
  )
}

function NodeDot({ node }) {
  const color = getNodeColor(node.name)
  return (
    <g>
      <circle cx={node.x} cy={node.y} r={5} fill={color} opacity={0.9} />
      <text
        x={node.x} y={node.y - 9}
        textAnchor="middle"
        fill={color}
        fontSize={9}
        fontWeight="600"
        fontFamily="JetBrains Mono, monospace"
        opacity={0.85}
      >
        {node.name}
      </text>
    </g>
  )
}

function ConnectionLine({ from, to }) {
  if (!from || !to) return null
  // Simple curved line from component center to node
  const mx = (from.x + to.x) / 2
  const my = (from.y + to.y) / 2

  return (
    <path
      d={`M${from.x},${from.y} Q${mx},${my} ${to.x},${to.y}`}
      stroke="rgba(100,116,139,0.4)"
      strokeWidth={1.5}
      fill="none"
      strokeDasharray="4 3"
    />
  )
}

export default function CircuitDiagram({ netlist }) {
  const { positioned, nodes, edges, svgW, svgH } = useMemo(() => {
    const comps = netlist?.components || []
    const conns = netlist?.connections || []

    const positioned = layoutComponents(comps)
    const nodes = layoutNodes(conns, positioned)

    // Build edge list: each connection → (component center → node center)
    const compPos = Object.fromEntries(positioned.map(c => [c.id, c]))
    const edges = conns.map((conn, i) => ({
      key: i,
      from: compPos[conn.component_id],
      to: nodes[conn.node],
    })).filter(e => e.from && e.to)

    // Calculate SVG bounds
    const allX = [...positioned.map(c => c.x), ...Object.values(nodes).map(n => n.x)]
    const allY = [...positioned.map(c => c.y), ...Object.values(nodes).map(n => n.y)]
    const svgW = Math.max(600, (Math.max(...allX, 0) + W + PAD * 2))
    const svgH = Math.max(300, (Math.max(...allY, 0) + H + PAD * 2))

    return { positioned, nodes, edges, svgW, svgH }
  }, [netlist])

  if (!netlist?.components?.length) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        No components to display
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-xl">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="block min-w-full"
        style={{ background: 'rgba(15,18,30,0.6)', borderRadius: '12px' }}
      >
        {/* Grid dots background */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.04)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Connection lines (behind everything) */}
        {edges.map(e => (
          <ConnectionLine key={e.key} from={e.from} to={e.to} />
        ))}

        {/* Node dots */}
        {Object.values(nodes).map(node => (
          <NodeDot key={node.name} node={node} />
        ))}

        {/* Component boxes */}
        {positioned.map(comp => (
          <ComponentBox key={comp.id} comp={comp} />
        ))}
      </svg>
    </div>
  )
}
