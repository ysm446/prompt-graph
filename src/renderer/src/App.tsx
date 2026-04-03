import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  NodeResizeControl,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AppSettings, GraphEdgeRecord, GraphNodeRecord, ModelOption, NodeType, ProjectRecord, ProjectSnapshot, TextInputHandle, UiPreferences } from '../../main/types'
import type { ReaderState } from './types'

type AppNodeData = {
  graphNode: GraphNodeRecord
  isSelected: boolean
  isEditing: boolean
  onSelect: (id: string) => void
  onChange: (node: GraphNodeRecord) => void
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  onGenerate: (id: string) => void
  onOpenReader: (id: string) => void
  onResize: (id: string, input: { position: { x: number; y: number }; size: { width: number; height: number } }) => void
}

type CanvasMenuState = {
  x: number
  y: number
  flowX: number
  flowY: number
} | null

type NodeMenuState = {
  x: number
  y: number
  nodeId: string
} | null

type ProjectDialogState =
  | {
      mode: 'create' | 'rename'
      projectId?: string
      value: string
    }
  | null

type ProjectMenuState = {
  projectId: string
} | null

type ResizeSide = 'left' | 'right'

const DEFAULT_LEFT_SIDEBAR_WIDTH = 288
const DEFAULT_RIGHT_INSPECTOR_WIDTH = 380
const MIN_LEFT_SIDEBAR_WIDTH = 220
const MAX_LEFT_SIDEBAR_WIDTH = 520
const MIN_RIGHT_INSPECTOR_WIDTH = 300
const MAX_RIGHT_INSPECTOR_WIDTH = 560
const GRID_SIZE = 20

function App() {
  return (
    <ReactFlowProvider>
      <GraphChatApp />
    </ReactFlowProvider>
  )
}

function GraphChatApp() {
  const reactFlow = useReactFlow()
  const mainRef = useRef<HTMLElement | null>(null)
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [activeProjectId, setActiveProjectId] = useState('')
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [isProjectDirty, setIsProjectDirty] = useState(false)
  const [status, setStatus] = useState('Loading...')
  const [error, setError] = useState<string | null>(null)
  const [reader, setReader] = useState<ReaderState | null>(null)
  const [generation, setGeneration] = useState<{ generationId: string; nodeId: string } | null>(null)
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState>(null)
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState>(null)
  const [isModelModalOpen, setIsModelModalOpen] = useState(false)
  const [isModelSwitching, setIsModelSwitching] = useState(false)
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isInspectorOpen, setIsInspectorOpen] = useState(true)
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true)
  const [isSnapToGridEnabled, setIsSnapToGridEnabled] = useState(true)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH)
  const [rightInspectorWidth, setRightInspectorWidth] = useState(DEFAULT_RIGHT_INSPECTOR_WIDTH)
  const [generalSections, setGeneralSections] = useState({ context: true, interface: true })
  const [modelFilter, setModelFilter] = useState('')
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState>(null)
  const [projectMenu, setProjectMenu] = useState<ProjectMenuState>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AppNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const snapshotRef = useRef<ProjectSnapshot | null>(null)
  const copiedNodeIdRef = useRef<string | null>(null)
  const hasLoadedPreferencesRef = useRef(false)
  const resizeStateRef = useRef<{ side: ResizeSide; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    void window.graphChat.bootstrap().then(({ projects, snapshot, settings, uiPreferences }) => {
      setProjects(projects)
      setSettings(settings)
      setIsSidebarOpen(uiPreferences.isSidebarOpen)
      setIsInspectorOpen(uiPreferences.isInspectorOpen)
      setIsMiniMapVisible(uiPreferences.isMiniMapVisible)
      setIsSnapToGridEnabled(uiPreferences.isSnapToGridEnabled)
      setLeftSidebarWidth(uiPreferences.leftSidebarWidth)
      setRightInspectorWidth(uiPreferences.rightInspectorWidth)
      setGeneralSections(uiPreferences.generalSections)
      setActiveProjectId(snapshot.project.id)
      applySnapshot(snapshot)
      setIsProjectDirty(false)
      hasLoadedPreferencesRef.current = true
      setStatus('Ready')
    }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('Failed to load')
    })
  }, [])

  useEffect(() => {
    if (!hasLoadedPreferencesRef.current) return
    const payload: Partial<UiPreferences> = {
      isSidebarOpen,
      isInspectorOpen,
      isMiniMapVisible,
      isSnapToGridEnabled,
      leftSidebarWidth,
      rightInspectorWidth,
      generalSections
    }
    void window.graphChat.savePreferences(payload)
  }, [isSidebarOpen, isInspectorOpen, isMiniMapVisible, isSnapToGridEnabled, leftSidebarWidth, rightInspectorWidth, generalSections])

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
      setStatus('Generation failed')
    })
    return () => {
      offDelta()
      offDone()
      offError()
    }
  }, [])

  useEffect(() => {
    const closeMenu = () => {
      setCanvasMenu(null)
      setNodeMenu(null)
      setProjectMenu(null)
    }
    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  useEffect(() => {
    void window.graphChat.setProjectDirty(isProjectDirty)
  }, [isProjectDirty])

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current
      if (!resizeState) return
      if (resizeState.side === 'left') {
        setLeftSidebarWidth(clamp(resizeState.startWidth + (event.clientX - resizeState.startX), MIN_LEFT_SIDEBAR_WIDTH, MAX_LEFT_SIDEBAR_WIDTH))
      } else {
        setRightInspectorWidth(clamp(resizeState.startWidth - (event.clientX - resizeState.startX), MIN_RIGHT_INSPECTOR_WIDTH, MAX_RIGHT_INSPECTOR_WIDTH))
      }
    }
    const handlePointerUp = () => {
      resizeStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [])

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === selectedNodeId,
          isEditing: node.id === editingNodeId
        }
      }))
    )
  }, [selectedNodeId, editingNodeId, setNodes])

  useEffect(() => {
    setEdges((current) =>
      current.map((edge) => ({
        ...edge,
        selected: edge.id === selectedEdgeId,
        style: edge.id === selectedEdgeId
          ? selectedEdgeStyleForHandle((edge.targetHandle as TextInputHandle | null) ?? null)
          : edgeStyleForHandle((edge.targetHandle as TextInputHandle | null) ?? null)
      }))
    )
  }, [selectedEdgeId, setEdges])

  const selectedNode = useMemo(() => snapshotRef.current?.nodes.find((node) => node.id === selectedNodeId) ?? null, [selectedNodeId, nodes])
  const nodeTypes = useMemo(() => ({ graphNode: GraphNodeCard }), [])

  function selectNode(nodeId: string | null) {
    setSelectedNodeId(nodeId)
    if (nodeId === null) {
      setEditingNodeId(null)
    }
    if (nodeId) {
      setSelectedEdgeId(null)
    }
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === nodeId
        }
      }))
    )
  }

  function applySnapshot(snapshot: ProjectSnapshot) {
    const previousEdgeMap = new Map((snapshotRef.current?.edges ?? []).map((edge) => [edge.id, edge]))
    const normalizedSnapshot: ProjectSnapshot = {
      ...snapshot,
      edges: snapshot.edges.map((edge) => {
        const previous = previousEdgeMap.get(edge.id)
        return {
          ...edge,
          sourceHandle: edge.sourceHandle ?? previous?.sourceHandle ?? 'output',
          targetHandle: edge.targetHandle ?? previous?.targetHandle ?? resolveTargetHandleForEdge(edge, snapshot.nodes)
        }
      })
    }
    snapshotRef.current = normalizedSnapshot
    setActiveProjectId(normalizedSnapshot.project.id)
    setNodes(normalizedSnapshot.nodes.map((node) => ({
      id: node.id,
      type: 'graphNode',
      position: node.position,
      style: { width: node.size.width, height: node.size.height },
      data: {
        graphNode: node,
        isSelected: node.id === selectedNodeId,
        isEditing: node.id === editingNodeId,
        onSelect: selectNode,
        onChange: (updated) => {
          mutateLocalNode(updated)
          void persistNode(updated)
        },
        onStartEdit: (id) => {
          selectNode(id)
          setEditingNodeId(id)
        },
        onStopEdit: () => setEditingNodeId(null),
        onGenerate: handleGenerate,
        onOpenReader: openReader,
        onResize: handleResize
      }
    })))
    setEdges(normalizedSnapshot.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      sourceHandle: edge.sourceHandle ?? 'output',
      targetHandle: edge.targetHandle,
      zIndex: 0,
      selected: edge.id === selectedEdgeId,
      animated: false,
      style: edge.id === selectedEdgeId
        ? selectedEdgeStyleForHandle((edge.targetHandle as TextInputHandle | null) ?? null)
        : edgeStyleForHandle((edge.targetHandle as TextInputHandle | null) ?? null)
    })))
    setSelectedNodeId((current) => snapshot.nodes.some((node) => node.id === current) ? current : snapshot.nodes[0]?.id ?? null)
    setSelectedEdgeId((current) => normalizedSnapshot.edges.some((edge) => edge.id === current) ? current : null)
  }

  async function switchProject(projectId: string) {
    if (!confirmDiscardUnsavedChanges()) return
    const snapshot = await window.graphChat.openProject(projectId)
    applySnapshot(snapshot)
    setIsProjectDirty(false)
    setStatus(`Project: ${snapshot.project.name}`)
  }

  async function createProject() {
    if (!confirmDiscardUnsavedChanges()) return
    setProjectDialog({
      mode: 'create',
      value: `Project ${projects.length + 1}`
    })
  }

  async function submitCreateProject(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const result = await window.graphChat.createProject(trimmed)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
    setIsProjectDirty(false)
    setProjectDialog(null)
  }

  async function renameProject(project: ProjectRecord) {
    setProjectDialog({
      mode: 'rename',
      projectId: project.id,
      value: project.name
    })
  }

  async function submitRenameProject(projectId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const result = await window.graphChat.renameProject(projectId, trimmed)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
    setProjectDialog(null)
  }

  async function deleteProject(project: ProjectRecord) {
    if (project.id !== activeProjectId && !confirm(`Delete "${project.name}"?`)) return
    if (project.id === activeProjectId) {
      if (!confirmDiscardUnsavedChanges()) return
      if (!confirm(`Delete "${project.name}"?`)) return
    }
    const result = await window.graphChat.deleteProject(project.id)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
    setIsProjectDirty(false)
  }

  function confirmDiscardUnsavedChanges() {
    return !isProjectDirty || confirm('You have unsaved changes. Discard them?')
  }

  async function saveProject() {
    const snapshot = snapshotRef.current
    if (!snapshot || !isProjectDirty) return
    setError(null)
    try {
      const result = await window.graphChat.saveProjectSnapshot(snapshot)
      setProjects(result.projects)
      applySnapshot(result.snapshot)
      setIsProjectDirty(false)
      setStatus(`Saved ${result.snapshot.project.name}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function addNode(type: NodeType, position?: { x: number; y: number }) {
    const snapshot = snapshotRef.current
    if (!activeProjectId || !snapshot) return
    const base = normalizePosition(position ?? (selectedNode?.position ?? { x: 120, y: 120 }), isSnapToGridEnabled)
    const now = new Date().toISOString()
    const node: GraphNodeRecord = {
      id: crypto.randomUUID(),
      projectId: activeProjectId,
      type,
      title: defaultTitle(type),
      content: '',
      instruction: null,
      isLocal: false,
      model: null,
      isGenerated: false,
      generationMeta: null,
      createdAt: now,
      updatedAt: now,
      position: position ? base : normalizePosition({ x: base.x + 40, y: base.y + 160 }, isSnapToGridEnabled),
      size: { width: 480, height: 360 }
    }
    applySnapshot({ ...snapshot, nodes: [...snapshot.nodes, node] })
    setIsProjectDirty(true)
    selectNode(node.id)
    setSelectedEdgeId(null)
    setCanvasMenu(null)
    setNodeMenu(null)
    setStatus(`${defaultTitle(type)} node created`)
  }

  async function persistNode(node: GraphNodeRecord) {
    const updated = { ...node, updatedAt: new Date().toISOString() }
    mutateLocalNode(updated)
    setIsProjectDirty(true)
    return updated
  }

  async function handleResize(nodeId: string, input: { position: { x: number; y: number }; size: { width: number; height: number } }) {
    const graphNode = snapshotRef.current?.nodes.find((node) => node.id === nodeId)
    if (!graphNode) return
    selectNode(nodeId)
    const normalizedBounds = normalizeNodeBounds(input, isSnapToGridEnabled)
    const updated = { ...graphNode, position: normalizedBounds.position, size: normalizedBounds.size }
    mutateLocalNode(updated)
    await persistNode(updated)
    setStatus('Node resized')
  }

  function toggleSnapToGrid() {
    setIsSnapToGridEnabled((current) => {
      const next = !current
      if (next) {
        alignAllNodesToGrid()
      }
      return next
    })
  }

  function alignAllNodesToGrid() {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    const normalizedNodes = snapshot.nodes.map((node) => {
      const normalized = normalizeNodeBounds({ position: node.position, size: node.size }, true)
      return {
        ...node,
        position: normalized.position,
        size: normalized.size
      }
    })
    applySnapshot({ ...snapshot, nodes: normalizedNodes })
    setIsProjectDirty(true)
    setStatus('Nodes aligned to grid')
  }

  async function onConnect(connection: Connection) {
    const snapshot = snapshotRef.current
    if (!activeProjectId || !snapshot || !connection.source || !connection.target) return
    try {
      if (connection.source === connection.target) {
        throw new Error('A node cannot connect to itself.')
      }
      const sourceNode = snapshot.nodes.find((node) => node.id === connection.source)
      const targetNode = snapshot.nodes.find((node) => node.id === connection.target)
      const targetHandle = (connection.targetHandle as TextInputHandle | null) ?? (sourceNode ? defaultTargetHandleForNodeType(sourceNode.type) : null)
      if (!sourceNode || !targetNode) {
        throw new Error('Source or target node was not found.')
      }
      if (targetNode.type !== 'text' || !targetHandle) {
        throw new Error('Connect to one of the text node input handles.')
      }
      const expectedHandle = defaultTargetHandleForNodeType(sourceNode.type)
      if (expectedHandle !== targetHandle) {
        throw new Error(`${displayNodeTypeLabel(sourceNode.type, sourceNode.isLocal)} nodes connect to the ${targetHandleLabel(expectedHandle)} input.`)
      }
      const nextEdge: GraphEdgeRecord = {
        id: crypto.randomUUID(),
        projectId: activeProjectId,
        sourceId: connection.source,
        targetId: connection.target,
        sourceHandle: 'output',
        targetHandle
      }
      if (wouldCreateCycle(connection.source, connection.target, snapshot.edges)) {
        throw new Error('This connection would create a cycle.')
      }
      applySnapshot({ ...snapshot, edges: [...snapshot.edges, nextEdge] })
      setIsProjectDirty(true)
      selectNode(null)
      setStatus('Connection added')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }


  async function handleGenerate(nodeId: string) {
    if (generation || !activeProjectId || !snapshotRef.current) return
    setError(null)
    setEditingNodeId(null)
    setStatus('Starting generation...')
    try {
      const result = await window.graphChat.startGeneration({ projectId: activeProjectId, sourceNodeId: nodeId, snapshot: snapshotRef.current })
      setProjects(result.projects)
      applySnapshot(result.snapshot)
      setIsProjectDirty(true)
      const created = result.snapshot.nodes.find((node) => node.id === result.targetNodeId)
      if (created) {
        selectNode(created.id)
        setGeneration({ generationId: result.generationId, nodeId: created.id })
      }
      setIsModelLoaded(true)
      setStatus(`Generating with ${displayModelName(settings?.selectedModelName ?? 'current model')}...`)
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
    setEditingNodeId(null)
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
    if (!selectedNode || !snapshotRef.current) return
    const snapshot = snapshotRef.current
    applySnapshot({
      ...snapshot,
      nodes: snapshot.nodes.filter((node) => node.id !== selectedNode.id),
      edges: snapshot.edges.filter((edge) => edge.sourceId !== selectedNode.id && edge.targetId !== selectedNode.id)
    })
    setIsProjectDirty(true)
    setNodeMenu(null)
    setStatus('Node deleted')
  }

  async function removeNode(nodeId: string) {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    applySnapshot({
      ...snapshot,
      nodes: snapshot.nodes.filter((node) => node.id !== nodeId),
      edges: snapshot.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId)
    })
    setIsProjectDirty(true)
    setNodeMenu(null)
    setStatus('Node deleted')
  }

  async function clearNode(nodeId: string) {
    const graphNode = snapshotRef.current?.nodes.find((node) => node.id === nodeId)
    if (!graphNode) return
    const updated = {
      ...graphNode,
      content: '',
      isGenerated: false,
      generationMeta: null,
      updatedAt: new Date().toISOString()
    }
    mutateLocalNode(updated)
    setIsProjectDirty(true)
    if (reader?.nodeId === nodeId) {
      setReader({ ...reader, content: '' })
    }
    setNodeMenu(null)
    setStatus('Node content cleared')
  }

  async function duplicateNode(nodeId: string, options?: { position?: { x: number; y: number }; clearTextContent?: boolean }) {
    const snapshot = snapshotRef.current
    const graphNode = snapshot?.nodes.find((node) => node.id === nodeId)
    if (!snapshot || !graphNode) return
    const duplicatedContent = options?.clearTextContent && graphNode.type === 'text' ? '' : graphNode.content
    const now = new Date().toISOString()
    const duplicatedNode: GraphNodeRecord = {
      ...graphNode,
      id: crypto.randomUUID(),
      title: `${graphNode.title} copy`,
      content: duplicatedContent,
      isGenerated: false,
      generationMeta: null,
      createdAt: now,
      updatedAt: now,
      position: options?.position ?? { x: graphNode.position.x + 60, y: graphNode.position.y + 60 }
    }
    applySnapshot({ ...snapshot, nodes: [...snapshot.nodes, duplicatedNode] })
    setIsProjectDirty(true)
    selectNode(duplicatedNode.id)
    setNodeMenu(null)
    setStatus('Node duplicated')
  }

  async function removeEdge(edgeId: string) {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    applySnapshot({ ...snapshot, edges: snapshot.edges.filter((edge) => edge.id !== edgeId) })
    setIsProjectDirty(true)
    setSelectedEdgeId(null)
    setStatus('Connection removed')
  }

  async function openModelModal() {
    setError(null)
    try {
      const latestSettings = await window.graphChat.listModels()
      setSettings(latestSettings)
      setModelFilter('')
      setIsModelModalOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSelectModel(model: ModelOption) {
    setIsModelSwitching(true)
    setError(null)
    setStatus(`Loading model ${displayModelName(model.name)}...`)
    try {
      const result = await window.graphChat.selectModel(model.path)
      setSettings(result.settings)
      setIsModelLoaded(true)
      setIsModelModalOpen(false)
      setStatus(`Model switched to ${displayModelName(model.name)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsModelSwitching(false)
    }
  }

  async function handleEjectModel() {
    if (!settings || generation !== null) return
    setIsModelSwitching(true)
    setError(null)
    setStatus(`Unloading ${displayModelName(settings.selectedModelName)}...`)
    try {
      const result = await window.graphChat.ejectModel()
      setSettings(result.settings)
      setIsModelLoaded(false)
      setStatus(`Unloaded ${displayModelName(result.settings.selectedModelName)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsModelSwitching(false)
    }
  }

  async function handleContextLengthChange(contextLength: number) {
    if (!settings) return
    const normalized = Math.max(4096, Math.min(65536, contextLength))
    if (normalized === settings.contextLength) return
    setError(null)
    try {
      const result = await window.graphChat.updateSettings({ contextLength: normalized })
      setSettings(result.settings)
      setIsModelLoaded(false)
      setStatus(`Context length set to ${normalized}. Reload model to apply.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleTemperatureChange(temperature: number) {
    if (!settings) return
    const normalized = Math.max(0, Math.min(2, Number(temperature.toFixed(1))))
    if (normalized === settings.temperature) return
    setError(null)
    try {
      const result = await window.graphChat.updateSettings({ temperature: normalized })
      setSettings(result.settings)
      setStatus(`Temperature set to ${normalized.toFixed(1)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleNodeChanges: OnNodesChange<Node<AppNodeData>> = async (changes) => {
    onNodesChange(changes)
    const positionChanges = changes.filter((change) => change.type === 'position' && change.position && !change.dragging)
    for (const change of positionChanges) {
      const graphNode = snapshotRef.current?.nodes.find((node) => node.id === change.id)
      if (!graphNode || !change.position) continue
      const updated = { ...graphNode, position: normalizePosition(change.position, isSnapToGridEnabled) }
      mutateLocalNode(updated)
      await persistNode(updated)
    }
  }

  const handleEdgeChanges: OnEdgesChange<Edge> = async (changes) => {
    onEdgesChange(changes)
    for (const change of changes) {
      if (change.type === 'remove' && activeProjectId) {
        await removeEdge(change.id)
      }
      if (change.type === 'select') {
        setSelectedEdgeId(change.selected ? change.id : null)
        if (change.selected) {
          setSelectedNodeId(null)
          setEditingNodeId(null)
          setStatus('Connection selected. Press Delete to remove.')
        }
      }
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElement(event.target)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProject()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedNode) {
        event.preventDefault()
        copiedNodeIdRef.current = selectedNode.id
        setStatus(`Copied ${selectedNode.title || 'node'}`)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && copiedNodeIdRef.current) {
        event.preventDefault()
        const bounds = mainRef.current?.getBoundingClientRect()
        const center = bounds
          ? reactFlow.screenToFlowPosition({
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2
            })
          : undefined
        void duplicateNode(copiedNodeIdRef.current, center ? { position: center, clearTextContent: true } : { clearTextContent: true })
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedNode) {
        event.preventDefault()
        void duplicateNode(selectedNode.id)
      }
      if (event.key === 'Delete' && selectedEdgeId) {
        event.preventDefault()
        void removeEdge(selectedEdgeId)
      } else if (event.key === 'Delete' && selectedNode) {
        event.preventDefault()
        void removeSelected()
      }
      if (event.key === 'Escape') {
        setCanvasMenu(null)
        setNodeMenu(null)
        setSelectedEdgeId(null)
        setIsModelModalOpen(false)
        setProjectDialog(null)
        setProjectMenu(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, selectedEdgeId])

  function mutateLocalNode(updated: GraphNodeRecord) {
    snapshotRef.current = snapshotRef.current ? { ...snapshotRef.current, nodes: snapshotRef.current.nodes.map((node) => node.id === updated.id ? updated : node) } : snapshotRef.current
    setNodes((current) => current.map((node) => node.id === updated.id ? { ...node, position: updated.position, style: { width: updated.size.width, height: updated.size.height }, data: { ...node.data, graphNode: updated, isSelected: updated.id === selectedNodeId, isEditing: updated.id === editingNodeId } } : node))
  }

  function openCanvasMenu(event: React.MouseEvent) {
    event.preventDefault()
    const bounds = mainRef.current?.getBoundingClientRect()
    const position = reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    setCanvasMenu({
      x: bounds ? event.clientX - bounds.left : event.clientX,
      y: bounds ? event.clientY - bounds.top : event.clientY,
      flowX: position.x,
      flowY: position.y
    })
    setNodeMenu(null)
    selectNode(null)
    setSelectedEdgeId(null)
  }

  function openNodeMenu(event: React.MouseEvent, nodeId: string) {
    event.preventDefault()
    event.stopPropagation()
    const bounds = mainRef.current?.getBoundingClientRect()
    selectNode(nodeId)
    setSelectedEdgeId(null)
    setCanvasMenu(null)
    setNodeMenu({
      x: bounds ? event.clientX - bounds.left : event.clientX,
      y: bounds ? event.clientY - bounds.top : event.clientY,
      nodeId
    })
  }

  function beginSidebarResize(side: ResizeSide, event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    resizeStateRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftSidebarWidth : rightInspectorWidth
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const hasNodes = nodes.length > 0
  const nodeMenuNode = nodeMenu ? snapshotRef.current?.nodes.find((node) => node.id === nodeMenu.nodeId) ?? null : null
  const filteredModels = settings?.availableModels.filter((model) => model.name.toLowerCase().includes(modelFilter.toLowerCase())) ?? []

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]">
      <header className="relative z-30 h-10 border-b border-[var(--border)] bg-[var(--bg-sidebar)] px-3">
        <div className="relative flex h-full items-center justify-center">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <IconButton onClick={() => setIsSidebarOpen((current) => !current)} label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'} active={isSidebarOpen}>
              <SidebarToggleIcon className="h-[18px] w-[18px]" />
            </IconButton>
          </div>
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <IconButton onClick={() => setIsInspectorOpen((current) => !current)} label={isInspectorOpen ? 'Hide inspector' : 'Show inspector'} active={isInspectorOpen}>
              <SidebarToggleIcon className="h-[18px] w-[18px] rotate-180" />
            </IconButton>
            {generation && (
              <ToolbarButton onClick={() => void stopGeneration()} label="Stop" />
            )}
          </div>
          <div className="flex max-w-full items-center gap-2">
            <ModelSelectorButton
              onClick={() => void openModelModal()}
              label={settings ? (isModelLoaded ? displayModelName(settings.selectedModelName) : 'Select a model to load') : 'Select a model to load'}
              isActive={isModelSwitching || isModelLoaded}
            />
            {settings && isModelLoaded && (
              <IconButton
                onClick={() => void handleEjectModel()}
                label="Eject model"
                disabled={isModelSwitching || generation !== null}
              >
                <EjectIcon className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
      {isSidebarOpen && (
      <>
      <aside style={{ width: leftSidebarWidth }} className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold tracking-[0.02em] text-[var(--text-dim)]">Projects</div>
            {isProjectDirty && <span className="text-xs text-[var(--accent)]">●</span>}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void saveProject()}
              disabled={!isProjectDirty}
              className="rounded-[8px] border border-[var(--border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)] disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-dim)]"
            >
              Save
            </button>
            <IconButton onClick={() => void createProject()} label="Create project">
              <NewFolderIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {projects.map((project) => (
            <div key={project.id} className={`relative mb-1.5 rounded-[10px] px-3 py-3 ${project.id === activeProjectId ? 'bg-[rgba(124,90,247,0.18)] text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
              <div className="flex items-start gap-3">
                <button className="flex-1 text-left" onClick={() => void switchProject(project.id)}>
                  <div className={`truncate text-[13px] font-medium ${project.id === activeProjectId ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{project.name}</div>
                  <div className={`truncate text-[11px] ${project.id === activeProjectId ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}`}>{new Date(project.updatedAt).toLocaleString()}</div>
                </button>
                <button
                  className={`rounded-full px-2 py-1 text-sm ${project.id === activeProjectId ? 'text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]' : 'text-[var(--text-faint)] hover:bg-white/5 hover:text-[var(--text-dim)]'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setProjectMenu((current) => current?.projectId === project.id ? null : { projectId: project.id })
                  }}
                >
                  ...
                </button>
              </div>
              {projectMenu?.projectId === project.id && (
                <div
                  className="absolute right-3 top-12 z-30 w-36 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-1 text-sm text-[var(--text)] shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MenuAction label="Rename" onClick={() => void renameProject(project)} />
                  <MenuAction label="Delete" onClick={() => void deleteProject(project)} />
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>
      <SidebarResizeHandle onMouseDown={(event) => beginSidebarResize('left', event)} />
      </>
      )}

      <main ref={mainRef} className="relative flex-1">
        {error && <div className="absolute right-4 top-4 z-20 max-w-md rounded-2xl border border-red-500/40 bg-red-950/70 px-4 py-3 text-sm text-red-200 shadow">{error}</div>}
        {!hasNodes && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-10">
            <div className="max-w-xl rounded-[20px] border border-[var(--border-strong)] bg-[rgba(17,19,24,0.9)] p-8 shadow-xl backdrop-blur-sm">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--text-dim)]">はじめに</div>
              <h2 className="mt-2 text-3xl font-semibold leading-tight">ノードをつないで、条件と指示から出力を設計します。</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--text-dim)]">キャンバスを右クリックしてノードを追加し、context、instruction、text を組み合わせながら、生成の流れを組み立ててください。</p>
            </div>
          </div>
        )}
        {canvasMenu && (
          <div
            className="absolute z-30 w-52 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-2 shadow-2xl"
            style={{ left: canvasMenu.x, top: canvasMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <MenuAction label="Add Text" onClick={() => void addNode('text', { x: canvasMenu.flowX, y: canvasMenu.flowY })} />
            <MenuAction label="Add Context" onClick={() => void addNode('context', { x: canvasMenu.flowX, y: canvasMenu.flowY })} />
            <MenuAction label="Add Instruction" onClick={() => void addNode('instruction', { x: canvasMenu.flowX, y: canvasMenu.flowY })} />
          </div>
        )}
        {nodeMenu && nodeMenuNode && (
          <div
            className="absolute z-30 w-56 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-2 shadow-2xl"
            style={{ left: nodeMenu.x, top: nodeMenu.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {nodeMenuNode.type === 'text' && (
              <MenuAction
                label="Open Reader"
                onClick={() => {
                  openReader(nodeMenuNode.id)
                  setNodeMenu(null)
                  setStatus('Reader opened')
                }}
              />
            )}
            {nodeMenuNode.type === 'text' && (
              <MenuAction
                label="Generate From Here"
                onClick={() => {
                  void handleGenerate(nodeMenuNode.id)
                  setNodeMenu(null)
                }}
              />
            )}
            <MenuAction
              label="Duplicate Node"
              onClick={() => {
                void duplicateNode(nodeMenuNode.id)
              }}
            />
            <MenuAction
              label="Clear Content"
              onClick={() => {
                void clearNode(nodeMenuNode.id)
              }}
            />
            <MenuAction
              label="Delete Node"
              onClick={() => {
                void removeNode(nodeMenuNode.id)
              }}
            />
          </div>
        )}
        {isModelModalOpen && settings && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-6" onClick={() => !isModelSwitching && setIsModelModalOpen(false)}>
            <div className="w-full max-w-2xl rounded-xl border border-[var(--border-strong)] bg-[var(--bg-sidebar)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div />
                <button className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-sm text-[var(--text)]" onClick={() => setIsModelModalOpen(false)} disabled={isModelSwitching}>Close</button>
              </div>
              <div className="mt-4 max-h-[420px] overflow-y-auto">
                <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Your Models</div>
                {filteredModels.map((model) => {
                  const isActive = model.path === settings.selectedModelPath
                  return (
                    <button
                      key={model.path}
                      className={`block w-full border-0 px-3 py-4 text-left text-[13px] transition ${isActive ? 'bg-white/5 text-[var(--text)]' : 'text-[var(--text-dim)] hover:bg-white/4 hover:text-[var(--text)]'}`}
                      onClick={() => void handleSelectModel(model)}
                      disabled={isModelSwitching || generation !== null}
                    >
                      <div className="flex items-center justify-between gap-6">
                        <div className="min-w-0 truncate font-mono text-[15px] font-semibold leading-6">{displayModelName(model.name)}</div>
                        <div className="flex shrink-0 items-center gap-6 text-[12px] text-[var(--text-faint)]">
                          <span className="rounded-[8px] bg-white/6 px-3 py-1 font-semibold text-[var(--text-dim)]">{extractModelParams(model.name) ?? '--'}</span>
                          <span>{formatModelSize(model.sizeBytes)}</span>
                        </div>
                      </div>
                    </button>
                  )
                })}
                {filteredModels.length === 0 && (
                  <p className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">No models found</p>
                )}
              </div>
              {generation && <p className="mt-4 text-[13px] text-amber-300">You cannot switch models while generation is running.</p>}
            </div>
          </div>
        )}
        {projectDialog && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-6" onClick={() => setProjectDialog(null)}>
            <div className="w-full max-w-md rounded-[20px] border border-[var(--border-strong)] bg-[var(--bg-sidebar)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="text-xs uppercase tracking-[0.28em] text-[var(--text-dim)]">プロジェクト</div>
              <h3 className="mt-2 text-2xl font-semibold">{projectDialog.mode === 'create' ? '新しいプロジェクトを作成' : 'プロジェクト名を変更'}</h3>
              <input
                autoFocus
                value={projectDialog.value}
                onChange={(event) => setProjectDialog((current) => current ? { ...current, value: event.target.value } : current)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    if (projectDialog.mode === 'create') {
                      void submitCreateProject(projectDialog.value)
                    } else if (projectDialog.projectId) {
                      void submitRenameProject(projectDialog.projectId, projectDialog.value)
                    }
                  }
                }}
                className="mt-4 w-full rounded-[14px] border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 outline-none"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-[12px] border border-[var(--border-strong)] px-4 py-2 text-sm text-[var(--text)]" onClick={() => setProjectDialog(null)}>キャンセル</button>
                <button
                  className="rounded-[12px] bg-[var(--accent)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-hover)]"
                  onClick={() => {
                    if (projectDialog.mode === 'create') {
                      void submitCreateProject(projectDialog.value)
                    } else if (projectDialog.projectId) {
                      void submitRenameProject(projectDialog.projectId, projectDialog.value)
                    }
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
          style={{ backgroundColor: 'var(--bg-canvas)' }}
          fitView
          minZoom={0.1}
          maxZoom={2}
          snapToGrid={isSnapToGridEnabled}
          snapGrid={[GRID_SIZE, GRID_SIZE]}
          onPaneContextMenu={openCanvasMenu}
            onPaneClick={() => {
              setCanvasMenu(null)
              setNodeMenu(null)
              selectNode(null)
              setSelectedEdgeId(null)
            }}
          onNodesChange={handleNodeChanges}
          onEdgesChange={handleEdgeChanges}
          onConnect={(connection) => void onConnect(connection)}
          onNodeClick={(_, node) => {
            selectNode(node.id)
            setSelectedEdgeId(null)
            setCanvasMenu(null)
            setNodeMenu(null)
          }}
          onNodeContextMenu={(event, node) => {
            openNodeMenu(event, node.id)
          }}
          onEdgeClick={(_, edge) => {
            selectNode(null)
            setSelectedEdgeId(edge.id)
            setCanvasMenu(null)
            setNodeMenu(null)
            setStatus('Connection selected. Press Delete to remove.')
          }}
          onEdgeDoubleClick={(_, edge) => {
            void removeEdge(edge.id)
          }}
          defaultEdgeOptions={{ style: edgeStyleForHandle('text'), interactionWidth: 28 }}
        >
          {isMiniMapVisible && <MiniMap pannable zoomable nodeColor={(node) => getMiniMapNodeColor(node as Node<AppNodeData>)} />}
          <Background gap={GRID_SIZE} size={1.4} color="#394154" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </main>

      {isInspectorOpen && (
      <>
      <SidebarResizeHandle onMouseDown={(event) => beginSidebarResize('right', event)} />
      <section style={{ width: rightInspectorWidth }} className="flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-sidebar)]">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-[18px] font-semibold">{selectedNode?.title || 'Properties'}</h2>
          <p className="mt-1 text-[12px] text-[var(--text-dim)]">{selectedNode ? defaultTitle(selectedNode.type) : 'General settings'}</p>
        </div>
        {selectedNode ? (
          <NodeEditor
            node={selectedNode}
            disabled={generation?.nodeId === selectedNode.id}
            currentModelName={settings?.selectedModelName ?? null}
            contextLength={settings?.contextLength ?? null}
            onChange={(updated) => {
              mutateLocalNode(updated)
              void persistNode(updated)
            }}
            onDuplicate={() => void duplicateNode(selectedNode.id)}
            onClear={() => void clearNode(selectedNode.id)}
            onDelete={() => void removeSelected()}
          />
        ) : (
          <GeneralInspector
            settings={settings}
            isMiniMapVisible={isMiniMapVisible}
            isSnapToGridEnabled={isSnapToGridEnabled}
            sections={generalSections}
            onToggleSection={(section) => setGeneralSections((current) => ({ ...current, [section]: !current[section] }))}
            onToggleMiniMap={() => setIsMiniMapVisible((current) => !current)}
            onToggleSnapToGrid={toggleSnapToGrid}
            onChangeContextLength={(value) => void handleContextLengthChange(value)}
            onChangeTemperature={(value) => void handleTemperatureChange(value)}
          />
        )}
        {reader && (
          <div className="border-t border-[var(--border)] bg-[rgba(28,31,43,0.84)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold">{reader.title}</h3>
              <button className="text-sm text-[var(--text-dim)]" onClick={() => setReader(null)}>Close</button>
            </div>
            <div className="mb-3 flex gap-2">
              <ToolbarButton onClick={copyReader} label="Copy" />
              <ToolbarButton onClick={() => void exportReader()} label="Export" />
            </div>
            <textarea readOnly value={reader.content} className="h-56 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-sm text-[var(--text)]" />
          </div>
        )}
      </section>
      </>
      )}
      </div>
    </div>
  )
}

function GraphNodeCard({ data }: { data: AppNodeData }) {
  const node = data.graphNode
  const [draftContent, setDraftContent] = useState(node.content)
  const [isComposing, setIsComposing] = useState(false)
  const wasEditingRef = useRef(data.isEditing)
  const colors = {
    text: 'border-[var(--border-strong)] bg-[var(--bg-card)]',
    context: 'border-[rgb(90,100,210)] bg-[rgba(37,40,66,0.8)]',
    instruction: 'border-[rgb(156,76,196)] bg-[rgba(58,37,74,0.8)]'
  } as const

  useEffect(() => {
    if (node.id !== data.graphNode.id) return
    if (!data.isEditing) {
      setDraftContent(node.content)
    }
    wasEditingRef.current = data.isEditing
  }, [node.id, node.content, data.isEditing])

  function commitDraftContent() {
    if (draftContent !== node.content) {
      data.onChange({ ...node, content: draftContent })
    }
  }

  return (
    <div className={`relative h-full w-full rounded-3xl border-2 px-4 py-3 shadow-lg shadow-black/30 transition ${colors[node.type]} ${data.isSelected ? 'ring-4 ring-[var(--accent-border)]' : ''}`} onMouseDown={() => data.onSelect(node.id)}>
      <NodeResizeControl
        position="bottom-right"
        className={`${data.isSelected ? 'opacity-100' : 'opacity-0 pointer-events-none'} !h-3 !w-3 !rounded-[6px] !border !border-[var(--text-faint)] !bg-[var(--text)] shadow`}
        minWidth={220}
        minHeight={140}
        color="#44403c"
        onResizeEnd={(_event, params) => {
          data.onSelect(node.id)
          data.onResize(node.id, {
            position: { x: params.x, y: params.y },
            size: { width: params.width, height: params.height }
          })
        }}
      >
        <div className="h-full w-full rounded-md bg-white" />
      </NodeResizeControl>
      {node.type === 'text' && (
        <>
          <Handle id="text" type="target" position={Position.Left} style={{ top: '28%' }} className="!h-5 !w-5 !border-2 !border-[var(--text-faint)] !bg-[var(--text)]" />
          <Handle id="context" type="target" position={Position.Left} style={{ top: '50%' }} className="!h-5 !w-5 !border-2 !border-[rgb(111,126,255)] !bg-[rgb(111,126,255)]" />
          <Handle id="instruction" type="target" position={Position.Left} style={{ top: '72%' }} className="!h-5 !w-5 !border-2 !border-[rgb(201,108,210)] !bg-[rgb(201,108,210)]" />
          <div className="pointer-events-none absolute -left-6 top-[22%] text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--text-dim)]">T</div>
          <div className="pointer-events-none absolute -left-6 top-[44%] text-[10px] font-medium uppercase tracking-[0.2em] text-[rgb(162,170,255)]">C</div>
          <div className="pointer-events-none absolute -left-6 top-[66%] text-[10px] font-medium uppercase tracking-[0.2em] text-[rgb(221,156,221)]">I</div>
        </>
      )}
      <Handle id="output" type="source" position={Position.Right} className="!h-5 !w-5 !border-2 !border-[var(--text-faint)] !bg-[var(--text)]" />
      <div className="flex h-full flex-col">
        <div className="mb-2 flex items-start justify-between gap-2">
          <button className="nodrag nopan text-left" onClick={() => data.onSelect(node.id)}>
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-dim)]">{displayNodeTypeLabel(node.type, node.isLocal)}</div>
            <div className="font-serif text-lg font-semibold">{node.title || 'Untitled'}</div>
          </button>
          {node.type === 'text' && (
            <button
              type="button"
              className="nodrag nopan rounded-[10px] bg-[rgba(68,54,124,0.96)] px-4 py-1.5 text-sm font-medium text-white hover:bg-[rgba(82,66,146,0.98)]"
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (data.isEditing) {
                  commitDraftContent()
                }
                data.onGenerate(node.id)
              }}
            >
              生成
            </button>
          )}
        </div>
        {data.isEditing ? (
          <textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setIsComposing(false)
              setDraftContent(event.currentTarget.value)
            }}
            onBlur={() => {
              setIsComposing(false)
              commitDraftContent()
            }}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder="No content yet."
            className="node-scrollbar nodrag nopan flex-1 resize-none overflow-y-auto rounded-md border border-[var(--border-strong)] bg-[rgba(0,0,0,0.14)] px-3 py-2 text-sm leading-6 text-[var(--text)] outline-none"
          />
        ) : (
          <div className="node-scrollbar flex-1 overflow-y-auto whitespace-pre-wrap pr-1 text-sm leading-6 text-[var(--text)]">{node.content || 'No content yet.'}</div>
        )}
        <div className="mt-3 flex justify-between text-xs text-[var(--text-dim)]">
          <div className="flex items-center gap-3">
            <button className="nodrag nopan" onClick={() => data.onOpenReader(node.id)}>Reader</button>
            <button className="nodrag nopan" onClick={() => {
              if (data.isEditing) {
                commitDraftContent()
                data.onStopEdit()
              } else {
                data.onStartEdit(node.id)
              }
            }}>
              {data.isEditing ? 'Done' : 'Edit'}
            </button>
          </div>
          <span>{Math.round(node.size.width)} x {Math.round(node.size.height)}</span>
        </div>
      </div>
    </div>
  )
}

function NodeEditor({
  node,
  disabled,
  currentModelName,
  contextLength,
  onChange,
  onDuplicate,
  onClear,
  onDelete
}: {
  node: GraphNodeRecord
  disabled: boolean
  currentModelName: string | null
  contextLength: number | null
  onChange: (node: GraphNodeRecord) => void
  onDuplicate: () => void
  onClear: () => void
  onDelete: () => void
}) {
  const totalTokens = node.generationMeta?.totalTokens ?? null
  const estimatedContentTokens = node.type === 'context' || node.type === 'instruction'
    ? estimateTokenCount(node.content)
    : null
  const contextUsageRatio =
    totalTokens !== null && contextLength && contextLength > 0
      ? Math.min(totalTokens / contextLength, 1)
      : null
  const contextUsagePercent =
    contextUsageRatio !== null
      ? Math.max(0, Number((contextUsageRatio * 100).toFixed(1)))
      : null

  return (
    <div className="inspector-scrollbar flex-1 overflow-y-auto p-5">
      <label className="mb-4 block">
        <div className="mb-2 text-sm font-medium text-[var(--text-dim)]">Title</div>
        <input value={node.title} disabled={disabled} onChange={(event) => onChange({ ...node, title: event.target.value })} className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-sm outline-none" />
      </label>
      <label className="mb-4 block">
        <div className="mb-2 text-sm font-medium text-[var(--text-dim)]">Content</div>
        <textarea value={node.content} disabled={disabled} onChange={(event) => onChange({ ...node, content: event.target.value })} className="h-72 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-sm outline-none" />
        {estimatedContentTokens !== null && (
          <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
            <MessageIcon className="h-3.5 w-3.5" />
            <span>Estimated tokens: {estimatedContentTokens}</span>
          </div>
        )}
      </label>
      {(node.type === 'context' || node.type === 'instruction') && (
        <label className="mb-4 flex items-center justify-between rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-sm">
          <span className="text-[var(--text-dim)]">Local only</span>
          <input
            type="checkbox"
            checked={node.isLocal}
            disabled={disabled}
            onChange={(event) => onChange({ ...node, isLocal: event.target.checked })}
            className="h-4 w-4 accent-[var(--accent)]"
          />
        </label>
      )}
      {node.generationMeta && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-dim)]">
          {node.generationMeta.tokensPerSecond !== null && <MetaItem icon={<BoltIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.tokensPerSecond.toFixed(1)} tok/sec`} />}
          {node.generationMeta.completionTokens !== null && <MetaItem icon={<MessageIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.completionTokens} tokens`} />}
          {node.generationMeta.durationSeconds !== null && <MetaItem icon={<ClockIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.durationSeconds.toFixed(2)}s`} />}
          {node.generationMeta.finishReason && <MetaItem icon={<FlagIcon className="h-3.5 w-3.5" />} label={`Finish reason: ${node.generationMeta.finishReason}`} />}
          </div>
          {totalTokens !== null && contextLength && contextUsagePercent !== null && (
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-dim)]">
              <ContextUsageGauge percent={contextUsagePercent} />
              <div className="leading-5">
                <div>{totalTokens} / {contextLength} tokens</div>
                <div className="text-[var(--text-faint)]">Context usage {contextUsagePercent.toFixed(1)}%</div>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="inline-flex items-center gap-1.5 text-xs text-[var(--text-dim)]">
        <CpuIcon className="h-3.5 w-3.5" />
        <span>{node.model ? displayModelName(node.model) : (currentModelName ? displayModelName(currentModelName) : 'default')}</span>
      </div>
    </div>
  )
}

function GeneralInspector({
  settings,
  isMiniMapVisible,
  isSnapToGridEnabled,
  sections,
  onToggleSection,
  onToggleMiniMap,
  onToggleSnapToGrid,
  onChangeContextLength,
  onChangeTemperature
}: {
  settings: AppSettings | null
  isMiniMapVisible: boolean
  isSnapToGridEnabled: boolean
  sections: { context: boolean; interface: boolean }
  onToggleSection: (section: 'context' | 'interface') => void
  onToggleMiniMap: () => void
  onToggleSnapToGrid: () => void
  onChangeContextLength: (value: number) => void
  onChangeTemperature: (value: number) => void
}) {
  const defaultContextLength = 32768
  const defaultTemperature = 0.8
  const [pendingTemperature, setPendingTemperature] = useState(settings?.temperature ?? defaultTemperature)
  const [pendingContextLength, setPendingContextLength] = useState(settings?.contextLength ?? defaultContextLength)
  const isTemperatureChanged = pendingTemperature !== defaultTemperature
  const isContextLengthChanged = pendingContextLength !== defaultContextLength

  useEffect(() => {
    setPendingTemperature(settings?.temperature ?? defaultTemperature)
  }, [settings?.temperature])

  useEffect(() => {
    setPendingContextLength(settings?.contextLength ?? defaultContextLength)
  }, [settings?.contextLength])

  return (
    <div className="inspector-scrollbar flex-1 overflow-y-auto px-4 py-2">
      <InspectorSection
        title="Context and Offload"
        icon={<TokenIcon className="h-[15px] w-[15px]" />}
        open={sections.context}
        onToggle={() => onToggleSection('context')}
      >
        <label className="block">
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[14px] text-[var(--text-dim)]">Temperature</span>
              <div className="flex items-center gap-2">
                {isTemperatureChanged && (
                  <button
                    type="button"
                    aria-label="Reset temperature"
                    title="Reset temperature"
                    onClick={() => {
                      setPendingTemperature(defaultTemperature)
                      onChangeTemperature(defaultTemperature)
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-faint)] transition hover:bg-white/5 hover:text-[var(--text-dim)]"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                )}
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={pendingTemperature}
                  onChange={(event) => setPendingTemperature(Number(event.target.value) || 0)}
                  onBlur={() => onChangeTemperature(pendingTemperature)}
                  className="h-7 w-[94px] rounded-[9px] border border-[var(--border-strong)] bg-[rgba(28,31,43,0.88)] px-2.5 py-1 text-right text-[12px] text-[var(--text)] outline-none"
                />
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={pendingTemperature}
              onChange={(event) => setPendingTemperature(Number(event.target.value))}
              onMouseUp={() => onChangeTemperature(pendingTemperature)}
              onTouchEnd={() => onChangeTemperature(pendingTemperature)}
              className={`graph-slider w-full ${isTemperatureChanged ? 'graph-slider-active' : ''}`}
            />
          </div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[14px] text-[var(--text-dim)]">Context Length</span>
            <div className="flex items-center gap-2">
              {isContextLengthChanged && (
                <button
                  type="button"
                  aria-label="Reset context length"
                  title="Reset context length"
                  onClick={() => {
                    setPendingContextLength(defaultContextLength)
                    onChangeContextLength(defaultContextLength)
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[var(--text-faint)] transition hover:bg-white/5 hover:text-[var(--text-dim)]"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <input
                type="number"
                min={4096}
                max={65536}
                step={1024}
                value={pendingContextLength}
                onChange={(event) => setPendingContextLength(Number(event.target.value) || 4096)}
                onBlur={() => onChangeContextLength(pendingContextLength)}
                className="h-7 w-[94px] rounded-[9px] border border-[var(--border-strong)] bg-[rgba(28,31,43,0.88)] px-2.5 py-1 text-right text-[12px] text-[var(--text)] outline-none"
              />
            </div>
          </div>
          <input
            type="range"
            min={4096}
            max={65536}
            step={1024}
            value={pendingContextLength}
            onChange={(event) => setPendingContextLength(Number(event.target.value))}
            onMouseUp={() => onChangeContextLength(pendingContextLength)}
            onTouchEnd={() => onChangeContextLength(pendingContextLength)}
            className={`graph-slider w-full ${isContextLengthChanged ? 'graph-slider-active' : ''}`}
          />
          <p className="mt-2 text-[11px] leading-5 text-[var(--text-faint)]">Applied on the next model load.</p>
        </label>
      </InspectorSection>

      <InspectorSection
        title="Interface"
        icon={<SidebarToggleIcon className="h-[15px] w-[15px]" />}
        open={sections.interface}
        onToggle={() => onToggleSection('interface')}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Show MiniMap</span>
          <button
            type="button"
            role="switch"
            aria-checked={isMiniMapVisible}
            onClick={onToggleMiniMap}
            className={`relative h-[22px] w-[38px] rounded-full transition ${isMiniMapVisible ? 'bg-[rgba(124,90,247,0.24)]' : 'bg-[rgba(28,31,43,0.88)]'}`}
          >
            <span
              className={`absolute top-[3px] h-[16px] w-[16px] rounded-full bg-[var(--text)] transition ${isMiniMapVisible ? 'left-[19px]' : 'left-[3px]'}`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Snap to Grid</span>
          <button
            type="button"
            role="switch"
            aria-checked={isSnapToGridEnabled}
            onClick={onToggleSnapToGrid}
            className={`relative h-[22px] w-[38px] rounded-full transition ${isSnapToGridEnabled ? 'bg-[rgba(124,90,247,0.24)]' : 'bg-[rgba(28,31,43,0.88)]'}`}
          >
            <span
              className={`absolute top-[3px] h-[16px] w-[16px] rounded-full bg-[var(--text)] transition ${isSnapToGridEnabled ? 'left-[19px]' : 'left-[3px]'}`}
            />
          </button>
        </div>
      </InspectorSection>
    </div>
  )
}

function InspectorSection({
  title,
  icon,
  open,
  onToggle,
  children
}: {
  title: string
  icon: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-4">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-0 py-1.5 text-left">
        <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text)]">
          <span className="text-[var(--text-dim)]">{icon}</span>
          <span>{title}</span>
        </span>
        <ChevronDownIcon className={`h-3.5 w-3.5 text-[var(--text-dim)] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="pt-2">{children}</div>}
    </div>
  )
}

function ToolbarButton({ onClick, label }: { onClick: () => void; label: string }) {
  return <button className="rounded-full border border-[var(--border-strong)] bg-[rgba(28,31,43,0.92)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm hover:bg-white/5" onClick={onClick}>{label}</button>
}

function MetaItem({ icon, label }: { icon: ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5">{icon}<span>{label}</span></span>
}

function ContextUsageGauge({ percent }: { percent: number }) {
  const normalizedPercent = Math.max(0, Math.min(percent, 100))
  const radius = 11
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - normalizedPercent / 100)

  return (
    <div className="flex items-center gap-2 text-[var(--accent)]">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
        <circle
          cx="17"
          cy="17"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 17 17)"
        />
      </svg>
      <span className="text-sm font-medium">{normalizedPercent.toFixed(1)}%</span>
    </div>
  )
}

function SidebarResizeHandle({ onMouseDown }: { onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => void }) {
  return (
    <div className="group relative z-20 w-px shrink-0 bg-[var(--border)] transition hover:bg-[var(--accent-border)]">
      <div className="absolute inset-y-0 -left-[4px] -right-[4px] cursor-col-resize bg-transparent" onMouseDown={onMouseDown} />
    </div>
  )
}

function IconButton({ onClick, label, children, active = false, disabled = false }: { onClick: () => void; label: string; children: ReactNode; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] text-[var(--text-faint)] transition hover:bg-white/5 hover:text-[var(--text-dim)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-faint)] ${active ? 'text-[var(--accent)]' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function ModelSelectorButton({ onClick, label, isActive = false }: { onClick: () => void; label: string; isActive?: boolean }) {
  return (
    <button
      className={`flex min-w-[220px] max-w-[480px] items-center gap-2 rounded-[8px] border px-3.5 py-1.5 text-[13px] font-medium transition ${
        isActive
          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
          : 'border-[var(--border-strong)] bg-white/5 text-[var(--text-dim)] hover:border-[var(--accent)] hover:bg-white/10 hover:text-[var(--text)]'
      }`}
      onClick={onClick}
    >
      <span className="flex w-4 shrink-0 justify-center">
        <CpuIcon className="h-[15px] w-[15px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-center">{label}</span>
      <span className="flex w-4 shrink-0 justify-center">
        <ChevronDownIcon className="h-3 w-3" />
      </span>
    </button>
  )
}

function CpuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 3v2" />
      <path d="M15 3v2" />
      <path d="M9 19v2" />
      <path d="M15 19v2" />
      <path d="M3 9h2" />
      <path d="M3 14h2" />
      <path d="M19 9h2" />
      <path d="M19 14h2" />
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  )
}

function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M9 5v14" />
    </svg>
  )
}

function NewFolderIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <path d="M12 11v6" />
      <path d="M9 14h6" />
    </svg>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

function EjectIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 4 19 11H5l7-7Z" />
      <path d="M5 15h14" />
      <path d="M7 19h10" />
    </svg>
  )
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  )
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 18.5 3.5 21V6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v8A2.5 2.5 0 0 1 18 17H9.5L7 18.5Z" />
    </svg>
  )
}

function TokenIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="4" y="6" width="16" height="12" rx="2.5" />
      <path d="M9 10h6" />
      <path d="M9 14h3" />
    </svg>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </svg>
  )
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 20V5" />
      <path d="M6 5h9l-1.5 3L15 11H6" />
    </svg>
  )
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function MenuAction({ onClick, label }: { onClick: () => void; label: string }) {
  return <button className="block w-full rounded-2xl px-4 py-3 text-left text-sm text-[var(--text)] hover:bg-white/5" onClick={onClick}>{label}</button>
}

function defaultTitle(type: NodeType): string {
  switch (type) {
    case 'context':
      return 'Global Context'
    case 'instruction':
      return 'Global Instruction'
    default:
      return 'Text'
  }
}

function displayNodeTypeLabel(type: NodeType, isLocal = false): string {
  if (type === 'instruction') return isLocal ? 'local instruction' : 'global instruction'
  if (type === 'context') return isLocal ? 'local context' : 'global context'
  return type
}

function displayModelName(modelName: string): string {
  return modelName.split(/[\\/]/).pop() ?? modelName
}

function getMiniMapNodeColor(node: Node<AppNodeData>): string {
  const graphNode = node.data?.graphNode
  const type = graphNode?.type
  if (type === 'context') return graphNode?.isLocal ? '#44507a' : '#3a315f'
  if (type === 'instruction') return graphNode?.isLocal ? '#6c3d63' : '#5b2d5d'
  return '#3f4150'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function snapPositionToGrid(position: { x: number; y: number }) {
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
  }
}

function snapSizeToGrid(size: { width: number; height: number }) {
  return {
    width: Math.max(GRID_SIZE, Math.round(size.width / GRID_SIZE) * GRID_SIZE),
    height: Math.max(GRID_SIZE, Math.round(size.height / GRID_SIZE) * GRID_SIZE)
  }
}

function normalizeNodeBounds(
  bounds: { position: { x: number; y: number }; size: { width: number; height: number } },
  shouldSnap: boolean
) {
  if (!shouldSnap) return bounds
  return {
    position: snapPositionToGrid(bounds.position),
    size: snapSizeToGrid(bounds.size)
  }
}


function normalizePosition(position: { x: number; y: number }, shouldSnap: boolean) {
  return shouldSnap ? snapPositionToGrid(position) : position
}

function estimateTokenCount(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0

  const segments = trimmed.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[A-Za-z0-9]+(?:['_-][A-Za-z0-9]+)*|[^\s]/gu) ?? []
  let total = 0

  for (const segment of segments) {
    if (/^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(segment)) {
      total += 1
      continue
    }
    if (/^[A-Za-z0-9]+(?:['_-][A-Za-z0-9]+)*$/u.test(segment)) {
      total += Math.max(1, Math.ceil(segment.length / 4))
      continue
    }
    total += 1
  }

  return total
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

function extractModelParams(modelName: string): string | null {
  const match = modelName.match(/(\d+(?:\.\d+)?)\s*[Bb](?:[^a-zA-Z]|$)/)
  return match ? `${match[1]}B` : null
}

function formatModelSize(sizeBytes: number): string {
  const gib = sizeBytes / 1024 ** 3
  return `${gib.toFixed(2)} GB`
}

function collectReaderText(nodeId: string, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): string {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  return collectReaderTextUpstream(nodeId, edges, nodeMap, new Set<string>())
    .map((node) => node.content.trim())
    .filter(Boolean)
    .join('\n\n')
}

function collectReaderTextUpstream(
  nodeId: string,
  edges: GraphEdgeRecord[],
  nodeMap: Map<string, GraphNodeRecord>,
  visited: Set<string>
): GraphNodeRecord[] {
  const results: GraphNodeRecord[] = []
  for (const edge of edges) {
    if (edge.targetId !== nodeId || resolveTargetHandleForEdge(edge, nodeMap) !== 'text') continue
    const parent = nodeMap.get(edge.sourceId)
    if (!parent || parent.type !== 'text' || visited.has(parent.id)) continue
    visited.add(parent.id)
    results.push(...collectReaderTextUpstream(parent.id, edges, nodeMap, visited))
    results.push(parent)
  }
  return results
}

function wouldCreateCycle(sourceId: string, targetId: string, edges: GraphEdgeRecord[]): boolean {
  const childMap = new Map<string, string[]>()
  for (const edge of edges) {
    const children = childMap.get(edge.sourceId) ?? []
    children.push(edge.targetId)
    childMap.set(edge.sourceId, children)
  }

  const stack = [targetId]
  const visited = new Set<string>()

  while (stack.length > 0) {
    const nodeId = stack.pop()
    if (!nodeId || visited.has(nodeId)) continue
    if (nodeId === sourceId) return true
    visited.add(nodeId)
    for (const childId of childMap.get(nodeId) ?? []) {
      stack.push(childId)
    }
  }

  return false
}

function resolveTargetHandleForEdge(edge: GraphEdgeRecord, nodes: GraphNodeRecord[] | Map<string, GraphNodeRecord>): TextInputHandle | null {
  if (edge.targetHandle) return edge.targetHandle
  const nodeMap = nodes instanceof Map ? nodes : new Map(nodes.map((node) => [node.id, node]))
  const sourceType = nodeMap.get(edge.sourceId)?.type
  return sourceType ? defaultTargetHandleForNodeType(sourceType) : null
}

function defaultTargetHandleForNodeType(type: NodeType): TextInputHandle {
  if (type === 'text') return 'text'
  if (type === 'context') return 'context'
  return 'instruction'
}

function targetHandleLabel(handle: TextInputHandle): string {
  if (handle === 'text') return 'Text'
  if (handle === 'context') return 'Context'
  return 'Instruction'
}
function edgeStyleForHandle(handle: TextInputHandle | null) {
  if (handle === 'context') {
    return { strokeWidth: 2.6, stroke: '#6170d8', opacity: 0.84 }
  }
  if (handle === 'instruction') {
    return { strokeWidth: 2.6, stroke: '#a267c8', opacity: 0.84 }
  }
  return { strokeWidth: 2.6, stroke: '#6a728f', opacity: 0.84 }
}

function selectedEdgeStyleForHandle(handle: TextInputHandle | null) {
  if (handle === 'context') {
    return { strokeWidth: 3.5, stroke: '#7b89f0', opacity: 1 }
  }
  if (handle === 'instruction') {
    return { strokeWidth: 3.5, stroke: '#bf79df', opacity: 1 }
  }
  return { strokeWidth: 3.5, stroke: '#8b95b8', opacity: 1 }
}

export default App




