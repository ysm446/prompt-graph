import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AppSettings, GraphEdgeRecord, GraphNodeRecord, NodeType, ProjectRecord, ProjectSnapshot } from '../../main/types'
import type { ReaderState } from './types'

type AppNodeData = {
  graphNode: GraphNodeRecord
  onSelect: (id: string) => void
  onGenerate: (id: string) => void
  onOpenReader: (id: string) => void
}

function App() {
  return (
    <ReactFlowProvider>
      <GraphChatApp />
    </ReactFlowProvider>
  )
}

function GraphChatApp() {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [status, setStatus] = useState('Loading...')
  const [error, setError] = useState<string | null>(null)
  const [reader, setReader] = useState<ReaderState | null>(null)
  const [generation, setGeneration] = useState<{ generationId: string; nodeId: string } | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AppNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const snapshotRef = useRef<ProjectSnapshot | null>(null)

  useEffect(() => {
    void window.graphChat.bootstrap().then(({ projects, snapshot, settings }) => {
      setProjects(projects)
      setSettings(settings)
      setActiveProjectId(snapshot.project.id)
      applySnapshot(snapshot)
      setStatus('Ready')
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('Failed to load')
    })
  }, [])

  useEffect(() => {
    const offDelta = window.graphChat.onGenerationDelta(({ nodeId, content }) => {
      setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, graphNode: { ...node.data.graphNode, content } } } : node))
    })
    const offDone = window.graphChat.onGenerationDone(({ snapshot, projects }) => {
      setProjects(projects)
      applySnapshot(snapshot)
      setGeneration(null)
      setStatus('Generation completed')
    })
    const offError = window.graphChat.onGenerationError(({ message }) => {
      setGeneration(null)
      setError(message)
    })
    return () => {
      offDelta()
      offDone()
      offError()
    }
  }, [])

  const selectedNode = useMemo(() => snapshotRef.current?.nodes.find((node) => node.id === selectedNodeId) ?? null, [selectedNodeId, nodes])

  const nodeTypes = useMemo(() => ({ graphNode: GraphNodeCard }), [])

  function applySnapshot(snapshot: ProjectSnapshot) {
    snapshotRef.current = snapshot
    setActiveProjectId(snapshot.project.id)
    setNodes(snapshot.nodes.map((node) => ({
      id: node.id,
      type: 'graphNode',
      position: node.position,
      data: { graphNode: node, onSelect: setSelectedNodeId, onGenerate: handleGenerate, onOpenReader: openReader }
    })))
    setEdges(snapshot.edges.map((edge) => ({ id: edge.id, source: edge.sourceId, target: edge.targetId, animated: false })))
    setSelectedNodeId((current) => snapshot.nodes.some((node) => node.id === current) ? current : snapshot.nodes[0]?.id ?? null)
  }

  async function switchProject(projectId: string) {
    const snapshot = await window.graphChat.openProject(projectId)
    applySnapshot(snapshot)
    setStatus(`Project: ${snapshot.project.name}`)
  }

  async function createProject() {
    const name = prompt('新しいプロジェクト名', `Project ${projects.length + 1}`)
    if (!name) return
    const result = await window.graphChat.createProject(name)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
  }

  async function renameProject(project: ProjectRecord) {
    const name = prompt('プロジェクト名を変更', project.name)
    if (!name) return
    const result = await window.graphChat.renameProject(project.id, name)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
  }

  async function deleteProject(project: ProjectRecord) {
    if (!confirm(`"${project.name}" を削除しますか？`)) return
    const result = await window.graphChat.deleteProject(project.id)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
  }

  async function addNode(type: NodeType) {
    if (!activeProjectId) return
    const base = selectedNode?.position ?? { x: 120, y: 120 }
    const result = await window.graphChat.createNode({
      projectId: activeProjectId,
      type,
      title: defaultTitle(type),
      position: { x: base.x + 40, y: base.y + 160 }
    })
    setProjects(result.projects)
    applySnapshot(result.snapshot)
    setSelectedNodeId(result.node.id)
  }

  async function persistNode(node: GraphNodeRecord) {
    const updated = await window.graphChat.updateNode({
      id: node.id,
      title: node.title,
      content: node.content,
      instruction: node.instruction,
      position: node.position,
      model: node.model,
      isGenerated: node.isGenerated
    })
    mutateLocalNode(updated)
  }

  async function onConnect(connection: Connection) {
    if (!activeProjectId || !connection.source || !connection.target) return
    try {
      const result = await window.graphChat.createEdge(activeProjectId, connection.source, connection.target)
      setProjects(result.projects)
      applySnapshot(result.snapshot)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleGenerate(nodeId: string) {
    if (generation || !activeProjectId) return
    setError(null)
    setStatus('Starting generation...')
    try {
      const result = await window.graphChat.startGeneration({ projectId: activeProjectId, sourceNodeId: nodeId })
      setProjects(result.projects)
      applySnapshot(result.snapshot)
      const created = result.snapshot.nodes.find((node) => node.id === result.targetNodeId)
      if (created) {
        setSelectedNodeId(created.id)
        setGeneration({ generationId: result.generationId, nodeId: created.id })
      }
      setStatus('Generating...')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function stopGeneration() {
    if (!generation) return
    await window.graphChat.stopGeneration(generation.generationId)
    setStatus('Generation stopped')
    setGeneration(null)
  }

  function openReader(nodeId: string) {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    const content = collectReaderText(nodeId, snapshot.nodes, snapshot.edges)
    const title = snapshot.nodes.find((node) => node.id === nodeId)?.title || 'Reader View'
    setReader({ nodeId, title, content })
  }

  async function exportReader() {
    if (!reader) return
    await window.graphChat.exportReader(reader.title, reader.content)
  }

  function copyReader() {
    if (!reader) return
    void navigator.clipboard.writeText(reader.content)
  }

  async function removeSelected() {
    if (!selectedNode) return
    const result = await window.graphChat.deleteNode(selectedNode.id)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
  }

  const handleNodeChanges: OnNodesChange<Node<AppNodeData>> = async (changes) => {
    onNodesChange(changes)
    const positionChanges = changes.filter((change) => change.type === 'position' && change.position && !change.dragging)
    for (const change of positionChanges) {
      const graphNode = snapshotRef.current?.nodes.find((node) => node.id === change.id)
      if (!graphNode || !change.position) continue
      const updated = { ...graphNode, position: change.position }
      mutateLocalNode(updated)
      await persistNode(updated)
    }
  }

  const handleEdgeChanges: OnEdgesChange<Edge> = async (changes) => {
    onEdgesChange(changes)
    for (const change of changes) {
      if (change.type === 'remove' && activeProjectId) {
        const result = await window.graphChat.deleteEdge(change.id, activeProjectId)
        setProjects(result.projects)
        applySnapshot(result.snapshot)
      }
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedNode) {
        event.preventDefault()
        void window.graphChat.createNode({
          projectId: selectedNode.projectId,
          type: selectedNode.type,
          title: `${selectedNode.title} copy`,
          content: selectedNode.content,
          instruction: selectedNode.instruction,
          model: selectedNode.model,
          isGenerated: false,
          position: { x: selectedNode.position.x + 60, y: selectedNode.position.y + 60 }
        }).then((result) => {
          setProjects(result.projects)
          applySnapshot(result.snapshot)
          setSelectedNodeId(result.node.id)
        })
      }
      if (event.key === 'Delete' && selectedNode) {
        event.preventDefault()
        void removeSelected()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode])

  function mutateLocalNode(updated: GraphNodeRecord) {
    snapshotRef.current = snapshotRef.current ? { ...snapshotRef.current, nodes: snapshotRef.current.nodes.map((node) => node.id === updated.id ? updated : node) } : snapshotRef.current
    setNodes((current) => current.map((node) => node.id === updated.id ? { ...node, position: updated.position, data: { ...node.data, graphNode: updated } } : node))
  }

  return (
    <div className="flex h-screen bg-stone-200 text-stone-900">
      <aside className="flex w-72 flex-col border-r border-stone-300 bg-stone-100">
        <div className="border-b border-stone-300 px-5 py-4">
          <h1 className="font-serif text-2xl font-semibold">Graph Chat</h1>
          <p className="mt-1 text-sm text-stone-600">Local DAG writing with llama.cpp</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {projects.map((project) => (
            <div key={project.id} className={`mb-2 rounded-2xl border px-3 py-3 ${project.id === activeProjectId ? 'border-stone-900 bg-stone-900 text-stone-50' : 'border-stone-300 bg-white'}`}>
              <button className="w-full text-left" onClick={() => void switchProject(project.id)}>
                <div className="font-medium">{project.name}</div>
                <div className={`text-xs ${project.id === activeProjectId ? 'text-stone-300' : 'text-stone-500'}`}>{new Date(project.updatedAt).toLocaleString()}</div>
              </button>
              <div className="mt-2 flex gap-2 text-xs">
                <button className="rounded-full border px-2 py-1" onClick={() => void renameProject(project)}>Rename</button>
                <button className="rounded-full border px-2 py-1" onClick={() => void deleteProject(project)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-stone-300 p-3">
          <button className="w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white" onClick={() => void createProject()}>+ New Project</button>
        </div>
      </aside>

      <main className="relative flex-1">
        <div className="absolute left-4 top-4 z-20 flex gap-2">
          <ToolbarButton onClick={() => void addNode('text')} label="+ Text" />
          <ToolbarButton onClick={() => void addNode('context')} label="+ Context" />
          <ToolbarButton onClick={() => void addNode('instruction')} label="+ Instruction" />
          {generation && <ToolbarButton onClick={() => void stopGeneration()} label="Stop" />}
        </div>
        <div className="absolute bottom-4 left-4 z-20 rounded-full border border-stone-300 bg-white/90 px-4 py-2 text-sm shadow-sm">
          <span>{status}</span>
          {settings && <span className="ml-3 text-stone-500">{settings.llamaModelAlias}</span>}
        </div>
        {error && <div className="absolute right-4 top-4 z-20 max-w-md rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow">{error}</div>}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          onNodesChange={handleNodeChanges}
          onEdgesChange={handleEdgeChanges}
          onConnect={(connection) => void onConnect(connection)}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          defaultEdgeOptions={{ style: { strokeWidth: 2, stroke: '#57534e' } }}
        >
          <MiniMap pannable zoomable />
          <Background gap={18} color="#d6d3d1" />
          <Controls />
        </ReactFlow>
      </main>

      <section className="flex w-[380px] flex-col border-l border-stone-300 bg-[#f7f2ea]">
        <div className="border-b border-stone-300 px-5 py-4">
          <h2 className="font-serif text-xl font-semibold">{selectedNode?.title || 'Node Editor'}</h2>
          <p className="mt-1 text-sm text-stone-500">{selectedNode ? selectedNode.type : 'Select a node'}</p>
        </div>
        {selectedNode ? (
          <NodeEditor
            node={selectedNode}
            disabled={generation?.nodeId === selectedNode.id}
            onChange={(updated) => {
              mutateLocalNode(updated)
              void persistNode(updated)
            }}
            onDelete={() => void removeSelected()}
          />
        ) : (
          <div className="p-5 text-sm text-stone-500">Select or create a node to edit.</div>
        )}
        {reader && (
          <div className="border-t border-stone-300 bg-white/70 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold">{reader.title}</h3>
              <button className="text-sm text-stone-500" onClick={() => setReader(null)}>Close</button>
            </div>
            <div className="mb-3 flex gap-2">
              <ToolbarButton onClick={copyReader} label="Copy" />
              <ToolbarButton onClick={() => void exportReader()} label="Export" />
            </div>
            <textarea readOnly value={reader.content} className="h-56 w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm" />
          </div>
        )}
      </section>
    </div>
  )
}

function GraphNodeCard({ data }: { data: AppNodeData }) {
  const node = data.graphNode
  const colors = {
    text: 'border-stone-800 bg-white',
    context: 'border-sky-700 bg-sky-50',
    instruction: 'border-amber-700 bg-amber-50'
  } as const

  return (
    <div className={`w-72 rounded-3xl border-2 px-4 py-3 shadow-lg shadow-stone-300/50 ${colors[node.type]}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <button className="text-left" onClick={() => data.onSelect(node.id)}>
          <div className="text-xs uppercase tracking-[0.24em] text-stone-500">{node.type}</div>
          <div className="font-serif text-lg font-semibold">{node.title || 'Untitled'}</div>
        </button>
        {node.type === 'text' && <button className="rounded-full bg-stone-900 px-3 py-1 text-xs font-medium text-white" onClick={() => data.onGenerate(node.id)}>生成 -&gt;</button>}
      </div>
      <div className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-stone-700">{node.content || 'No content yet.'}</div>
      <div className="mt-3 flex justify-between text-xs text-stone-500">
        <button onClick={() => data.onOpenReader(node.id)}>Reader</button>
        <span>{node.isGenerated ? 'generated' : 'manual'}</span>
      </div>
    </div>
  )
}

function NodeEditor({ node, disabled, onChange, onDelete }: { node: GraphNodeRecord; disabled: boolean; onChange: (node: GraphNodeRecord) => void; onDelete: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <label className="mb-4 block">
        <div className="mb-2 text-sm font-medium text-stone-700">Title</div>
        <input value={node.title} disabled={disabled} onChange={(event) => onChange({ ...node, title: event.target.value })} className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none" />
      </label>
      <label className="mb-4 block">
        <div className="mb-2 text-sm font-medium text-stone-700">Content</div>
        <textarea value={node.content} disabled={disabled} onChange={(event) => onChange({ ...node, content: event.target.value })} className="h-72 w-full rounded-3xl border border-stone-300 bg-white px-4 py-3 outline-none" />
      </label>
      {node.type !== 'instruction' && (
        <label className="mb-4 block">
          <div className="mb-2 text-sm font-medium text-stone-700">Local Instruction</div>
          <textarea value={node.instruction ?? ''} disabled={disabled} onChange={(event) => onChange({ ...node, instruction: event.target.value })} className="h-40 w-full rounded-3xl border border-stone-300 bg-white px-4 py-3 outline-none" />
        </label>
      )}
      <div className="text-xs text-stone-500">Model: {node.model || 'default'}</div>
      <button className="mt-6 rounded-2xl border border-red-300 px-4 py-3 text-sm text-red-700" onClick={onDelete}>Delete Node</button>
    </div>
  )
}

function ToolbarButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button className="rounded-full border border-stone-300 bg-white/90 px-4 py-2 text-sm font-medium shadow-sm" onClick={onClick}>{label}</button>
}

function defaultTitle(type: NodeType): string {
  switch (type) {
    case 'context':
      return 'Context'
    case 'instruction':
      return 'Instruction'
    default:
      return 'Text'
  }
}

function collectReaderText(nodeId: string, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): string {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const parentMap = new Map<string, string[]>()
  for (const edge of edges) {
    const parents = parentMap.get(edge.targetId) ?? []
    parents.push(edge.sourceId)
    parentMap.set(edge.targetId, parents)
  }
  return traverse(nodeId, nodeMap, parentMap, new Set<string>())
    .filter((node) => node.type === 'text')
    .map((node) => node.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

function traverse(nodeId: string, nodeMap: Map<string, GraphNodeRecord>, parentMap: Map<string, string[]>, visited: Set<string>): GraphNodeRecord[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  const node = nodeMap.get(nodeId)
  if (!node) return []
  const parents = (parentMap.get(nodeId) ?? []).flatMap((parentId) => traverse(parentId, nodeMap, parentMap, visited))
  return [...parents, node]
}

export default App
