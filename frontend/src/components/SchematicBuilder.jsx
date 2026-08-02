import { useState, useCallback, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Zap, Play, Cpu, Trash2 } from 'lucide-react'

const COMPONENT_TYPES = [
  'resistor', 'capacitor', 'LED', 'diode', 'IC',
  'battery', 'switch', 'transistor', 'inductor',
  'voltage_regulator'
]

// Custom Node for Electronic Components
const ComponentNode = ({ data, selected }) => {
  return (
    <div className={`px-4 py-2 shadow-md rounded-md bg-surface-800 border-2 ${selected ? 'border-brand-500' : 'border-surface-600'}`}>
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-300" />
      <div className="flex flex-col items-center">
        <div className="text-xs font-bold text-brand-400 capitalize">{data.type}</div>
        <div className="text-[10px] text-slate-300">{data.id}</div>
        {(data.value || data.value === 0) && (
          <div className="text-xs text-slate-100">{data.value} {data.unit}</div>
        )}
      </div>
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-slate-300" />
    </div>
  )
}

const nodeTypes = {
  component: ComponentNode,
}

let idCounter = 1
const getId = () => `C${idCounter++}`

const Sidebar = () => {
  const onDragStart = (event, nodeType, compType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.setData('application/comptype', compType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="w-64 border-l border-white/10 bg-surface-900/50 p-4 overflow-y-auto flex flex-col gap-3">
      <div className="text-sm font-semibold text-slate-200 mb-2 flex items-center gap-2">
        <Cpu size={16} className="text-brand-400" /> Components
      </div>
      <div className="text-xs text-slate-400 mb-4">
        Drag components onto the canvas to build your circuit.
      </div>
      {COMPONENT_TYPES.map((t) => (
        <div
          key={t}
          className="card p-3 text-sm cursor-grab hover:border-brand-500/50 hover:bg-brand-500/10 transition-colors capitalize text-center"
          onDragStart={(event) => onDragStart(event, 'component', t)}
          draggable
        >
          {t.replace('_', ' ')}
        </div>
      ))}
    </div>
  )
}

const Builder = ({ onAnalyze }) => {
  const reactFlowWrapper = useRef(null)
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [reactFlowInstance, setReactFlowInstance] = useState(null)
  const [supplyVoltage, setSupplyVoltage] = useState('5.0')
  const [selectedNode, setSelectedNode] = useState(null)

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#94a3b8', strokeWidth: 2 } }, eds)),
    [setEdges]
  )

  const onDragOver = useCallback((event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event) => {
      event.preventDefault()
      const type = event.dataTransfer.getData('application/reactflow')
      const compType = event.dataTransfer.getData('application/comptype')
      if (typeof type === 'undefined' || !type) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const newId = getId()
      const newNode = {
        id: newId,
        type,
        position,
        data: { id: newId, type: compType, value: '', unit: '' },
      }
      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes]
  )

  const onSelectionChange = useCallback(({ nodes }) => {
    if (nodes.length === 1) {
      setSelectedNode(nodes[0])
    } else {
      setSelectedNode(null)
    }
  }, [])

  const updateSelectedNodeData = (field, val) => {
    if (!selectedNode) return
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === selectedNode.id) {
          return { ...n, data: { ...n.data, [field]: val } }
        }
        return n
      })
    )
  }

  const deleteSelectedNode = () => {
    if (!selectedNode) return
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setSelectedNode(null)
  }

  const handleAnalyze = () => {
    const netlist = {
      supply_voltage: parseFloat(supplyVoltage) || 5.0,
      components: [],
      connections: [],
    }

    // Process nodes to components
    nodes.forEach(n => {
      netlist.components.push({
        id: n.id,
        type: n.data.type,
        value: n.data.value !== '' ? parseFloat(n.data.value) : null,
        unit: n.data.unit || null,
        pins: [
          { name: 'in', node: null },
          { name: 'out', node: null }
        ],
        properties: {}
      })
    })

    // Process edges to connections. 
    // We treat each edge as a unique node connecting the source/target pins.
    let nodeCounter = 1
    edges.forEach(e => {
      const netNodeName = `net_${nodeCounter++}`
      // The source component's "out" pin connects to this net
      netlist.connections.push({
        component_id: e.source,
        pin_name: 'out', // Simplification: right handle is 'out'
        node: netNodeName
      })
      // The target component's "in" pin connects to this net
      netlist.connections.push({
        component_id: e.target,
        pin_name: 'in',  // Simplification: left handle is 'in'
        node: netNodeName
      })
    })

    onAnalyze(netlist)
  }

  return (
    <div className="flex h-[600px] border border-white/10 rounded-xl overflow-hidden bg-surface-950">
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          fitView
          className="bg-surface-950"
        >
          <Background color="#334155" gap={16} />
          <Controls className="bg-surface-800 border-white/10 fill-white" />
        </ReactFlow>

        {/* Action Bar Overlay */}
        <div className="absolute top-4 left-4 flex gap-4 z-10 bg-surface-900/80 backdrop-blur p-3 rounded-xl border border-white/10 shadow-xl">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Supply Voltage (V):</label>
            <input
              type="number"
              step="any"
              className="input py-1 px-2 text-sm w-20"
              value={supplyVoltage}
              onChange={(e) => setSupplyVoltage(e.target.value)}
            />
          </div>
          <div className="w-px bg-white/10 mx-1"></div>
          <button onClick={handleAnalyze} className="btn-primary py-1 px-4 text-sm gap-2">
            <Zap size={14} /> Analyze Circuit
          </button>
        </div>

        {/* Selected Node Editor Overlay */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 z-10 bg-surface-900/90 backdrop-blur p-4 rounded-xl border border-white/10 shadow-xl w-64">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm text-brand-400 capitalize flex items-center gap-2">
                {selectedNode.data.type} <span className="text-xs text-slate-400 bg-surface-800 px-1.5 py-0.5 rounded">{selectedNode.data.id}</span>
              </div>
              <button onClick={deleteSelectedNode} className="text-slate-500 hover:text-red-400 transition-colors p-1">
                <Trash2 size={14} />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1 block">Value</label>
                <input
                  type="number"
                  step="any"
                  className="input py-1.5 text-sm w-full"
                  value={selectedNode.data.value}
                  onChange={(e) => updateSelectedNodeData('value', e.target.value)}
                  placeholder="e.g. 220"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-1 block">Unit</label>
                <input
                  type="text"
                  className="input py-1.5 text-sm w-full"
                  value={selectedNode.data.unit}
                  onChange={(e) => updateSelectedNodeData('unit', e.target.value)}
                  placeholder="e.g. ohm, F, V"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <Sidebar />
    </div>
  )
}

export default function SchematicBuilder({ onAnalyze }) {
  return (
    <ReactFlowProvider>
      <Builder onAnalyze={onAnalyze} />
    </ReactFlowProvider>
  )
}
