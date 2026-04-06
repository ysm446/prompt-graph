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
  useViewport,
  getSmoothStepPath,
  BaseEdge,
  type EdgeProps,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { AppSettings, GraphEdgeRecord, GraphNodeRecord, ModelOption, NodeType, ProjectRecord, ProjectSnapshot, TextInputHandle, TextStylePreset, TextStyleTarget, UiPreferences } from '../../main/types'

type AppNodeData = {
  graphNode: GraphNodeRecord
  isSelected: boolean
  isEditing: boolean
  isGenerating: boolean
  onSelect: (id: string) => void
  onChange: (node: GraphNodeRecord) => void
  onStartEdit: (id: string) => void
  onStopEdit: () => void
  onGenerate: (id: string) => void
  onProofreadRequest: (payload: { nodeId: string; text: string; selectionStart: number; selectionEnd: number; fullContent: string; rect: DOMRect }) => void
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

type CopiedSelection = {
  nodes: GraphNodeRecord[]
  edges: GraphEdgeRecord[]
}

type ResizeSide = 'left' | 'right'

const DEFAULT_PROOFREAD_SYSTEM_PROMPT = 'You are a proofreader. Return only the corrected text with no explanation, no markdown formatting, and no additional comments. Preserve the original language and style.'
const DEFAULT_LEFT_SIDEBAR_WIDTH = 288
const DEFAULT_SETTINGS_PANEL_WIDTH = 340
const DEFAULT_RIGHT_INSPECTOR_WIDTH = 520
const MIN_LEFT_SIDEBAR_WIDTH = 220
const MAX_LEFT_SIDEBAR_WIDTH = 520
const MIN_RIGHT_INSPECTOR_WIDTH = 380
const MAX_RIGHT_INSPECTOR_WIDTH = 840
const GRID_SIZE = 20
const DEFAULT_TITLE_FONT_SIZE = 18
const DEFAULT_CONTENT_FONT_SIZE = 14
type GeneralSectionKey = 'context' | 'interface' | 'textStyle' | 'editing'

const TEXT_STYLE_PRESETS: Record<TextStylePreset, { label: string; description: string; titleFamily: string; titleWeight: number; titleLetterSpacing: string; contentFamily: string; contentWeight: number; contentLineHeight: number; contentLetterSpacing: string }> = {
  standard: {
    label: 'Standard',
    description: 'Balanced default for general work and notes.',
    titleFamily: '"Georgia", "Times New Roman", serif',
    titleWeight: 600,
    titleLetterSpacing: '0em',
    contentFamily: '"Segoe UI", "Noto Sans JP", sans-serif',
    contentWeight: 400,
    contentLineHeight: 1.65,
    contentLetterSpacing: '0em'
  },
  business: {
    label: 'Business',
    description: 'Clean and structured for business writing and planning.',
    titleFamily: '"Segoe UI", "Noto Sans JP", sans-serif',
    titleWeight: 700,
    titleLetterSpacing: '0.01em',
    contentFamily: '"Segoe UI", "Noto Sans JP", sans-serif',
    contentWeight: 400,
    contentLineHeight: 1.58,
    contentLetterSpacing: '0.005em'
  },
  reading: {
    label: 'Reading',
    description: 'Relaxed spacing for long reading sessions.',
    titleFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Times New Roman", serif',
    titleWeight: 700,
    titleLetterSpacing: '0.01em',
    contentFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Times New Roman", serif',
    contentWeight: 400,
    contentLineHeight: 1.82,
    contentLetterSpacing: '0.01em'
  },
  dense: {
    label: 'Dense',
    description: 'Tighter spacing when information density matters.',
    titleFamily: '"Segoe UI", "Noto Sans JP", sans-serif',
    titleWeight: 650,
    titleLetterSpacing: '0em',
    contentFamily: '"Segoe UI", "Noto Sans JP", sans-serif',
    contentWeight: 400,
    contentLineHeight: 1.45,
    contentLetterSpacing: '-0.005em'
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getActiveTextSize(target: TextStyleTarget, titleFontSize: number, contentFontSize: number): number {
  if (target === 'title') return titleFontSize
  if (target === 'content') return contentFontSize
  return Math.round((titleFontSize + contentFontSize) / 2)
}

function getActiveTextPreset(target: TextStyleTarget, titleTextStylePreset: TextStylePreset, contentTextStylePreset: TextStylePreset): TextStylePreset {
  if (target === 'title') return titleTextStylePreset
  if (target === 'content') return contentTextStylePreset
  return titleTextStylePreset === contentTextStylePreset ? titleTextStylePreset : 'standard'
}

function getTextStyleCssVars(titlePreset: TextStylePreset, contentPreset: TextStylePreset, titleFontSize: number, contentFontSize: number): React.CSSProperties {
  const titleConfig = TEXT_STYLE_PRESETS[titlePreset]
  const contentConfig = TEXT_STYLE_PRESETS[contentPreset]
  return {
    '--node-title-font-family': titleConfig.titleFamily,
    '--node-title-font-size': `${titleFontSize}px`,
    '--node-title-font-weight': String(titleConfig.titleWeight),
    '--node-title-letter-spacing': titleConfig.titleLetterSpacing,
    '--node-content-font-family': contentConfig.contentFamily,
    '--node-content-font-size': `${contentFontSize}px`,
    '--node-content-font-weight': String(contentConfig.contentWeight),
    '--node-content-line-height': String(contentConfig.contentLineHeight),
    '--node-content-letter-spacing': contentConfig.contentLetterSpacing
  } as React.CSSProperties
}

function getNodePreview(content: string, maxChars = 260): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxChars) return normalized
  return `${normalized.slice(0, maxChars).trimEnd()}...`
}

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
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
  const [isProjectDirty, setIsProjectDirty] = useState(false)
  const [status, setStatus] = useState('Loading...')
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState<{ generationId: string; nodeId: string } | null>(null)
  const [generationQueue, setGenerationQueue] = useState<string[]>([])
  const [proofread, setProofread] = useState<{
    proofreadId: string
    nodeId: string
    originalText: string
    correctedText: string
    isStreaming: boolean
    selectionStart: number
    selectionEnd: number
    fullContent: string
    position: { top: number; left: number }
  } | null>(null)
  const proofreadRef = useRef(proofread)
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState>(null)
  const [nodeMenu, setNodeMenu] = useState<NodeMenuState>(null)
  const [isModelModalOpen, setIsModelModalOpen] = useState(false)
  const [isModelSwitching, setIsModelSwitching] = useState(false)
  const [isModelLoaded, setIsModelLoaded] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(true)
  const [isPropertiesPanelOpen, setIsPropertiesPanelOpen] = useState(true)
  const [isMiniMapVisible, setIsMiniMapVisible] = useState(true)
  const [isSnapToGridEnabled, setIsSnapToGridEnabled] = useState(true)
  const [edgeType, setEdgeType] = useState<'default' | 'smoothstep' | 'step'>('default')
  const [isProofreadEnabled, setIsProofreadEnabled] = useState(true)
  const [proofreadSystemPrompt, setProofreadSystemPrompt] = useState(DEFAULT_PROOFREAD_SYSTEM_PROMPT)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(DEFAULT_LEFT_SIDEBAR_WIDTH)
  const [rightInspectorWidth, setRightInspectorWidth] = useState(DEFAULT_RIGHT_INSPECTOR_WIDTH)
  const [generalSections, setGeneralSections] = useState<{ context: boolean; interface: boolean; textStyle: boolean; editing: boolean }>({ context: true, interface: true, textStyle: true, editing: true })
  const [textStyleTarget, setTextStyleTarget] = useState<TextStyleTarget>('both')
  const [textStylePreset, setTextStylePreset] = useState<TextStylePreset>('standard')
  const [titleTextStylePreset, setTitleTextStylePreset] = useState<TextStylePreset>('standard')
  const [contentTextStylePreset, setContentTextStylePreset] = useState<TextStylePreset>('standard')
  const [titleFontSize, setTitleFontSize] = useState(DEFAULT_TITLE_FONT_SIZE)
  const [contentFontSize, setContentFontSize] = useState(DEFAULT_CONTENT_FONT_SIZE)
  const [modelFilter, setModelFilter] = useState('')
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState>(null)
  const [projectMenu, setProjectMenu] = useState<ProjectMenuState>(null)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState('')
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AppNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const snapshotRef = useRef<ProjectSnapshot | null>(null)
  const nodeTextStyleVars = useMemo(() => getTextStyleCssVars(titleTextStylePreset, contentTextStylePreset, titleFontSize, contentFontSize), [titleTextStylePreset, contentTextStylePreset, titleFontSize, contentFontSize])
  const activeProjectIdRef = useRef(activeProjectId)
  const generationRef = useRef(generation)
  const generationQueueRef = useRef(generationQueue)
  const copiedSelectionRef = useRef<CopiedSelection | null>(null)
  const hasLoadedPreferencesRef = useRef(false)
  const resizeStateRef = useRef<{ side: ResizeSide; startX: number; startWidth: number } | null>(null)

  activeProjectIdRef.current = activeProjectId
  generationRef.current = generation
  generationQueueRef.current = generationQueue
  proofreadRef.current = proofread

  useEffect(() => {
    void window.graphChat.bootstrap().then(({ projects, snapshot, settings, uiPreferences }) => {
      setProjects(projects)
      setSettings(settings)
      setIsSidebarOpen(uiPreferences.isSidebarOpen)
      setIsSettingsPanelOpen(uiPreferences.isSettingsPanelOpen)
      setIsPropertiesPanelOpen(uiPreferences.isPropertiesPanelOpen)
      setIsMiniMapVisible(uiPreferences.isMiniMapVisible)
      setIsSnapToGridEnabled(uiPreferences.isSnapToGridEnabled)
      setEdgeType(uiPreferences.edgeType)
      setIsProofreadEnabled(uiPreferences.isProofreadEnabled)
      if (uiPreferences.proofreadSystemPrompt) setProofreadSystemPrompt(uiPreferences.proofreadSystemPrompt)
      setLeftSidebarWidth(uiPreferences.leftSidebarWidth)
      setRightInspectorWidth(Math.max(uiPreferences.rightInspectorWidth, DEFAULT_RIGHT_INSPECTOR_WIDTH))
      setGeneralSections(uiPreferences.generalSections)
      setTextStyleTarget(uiPreferences.textStyleTarget)
      setTextStylePreset(uiPreferences.textStylePreset)
      setTitleTextStylePreset(uiPreferences.titleTextStylePreset)
      setContentTextStylePreset(uiPreferences.contentTextStylePreset)
      setTitleFontSize(uiPreferences.titleFontSize)
      setContentFontSize(uiPreferences.contentFontSize)
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
      isInspectorOpen: isSettingsPanelOpen || isPropertiesPanelOpen,
      isSettingsPanelOpen,
      isPropertiesPanelOpen,
      isMiniMapVisible,
      isSnapToGridEnabled,
      edgeType,
      isProofreadEnabled,
      leftSidebarWidth,
      rightInspectorWidth,
      generalSections,
      nodeFontSize: contentFontSize,
      textStyleTarget,
      textStylePreset,
      titleTextStylePreset,
      contentTextStylePreset,
      titleFontSize,
      contentFontSize
    }
    void window.graphChat.savePreferences(payload)
  }, [isSidebarOpen, isSettingsPanelOpen, isPropertiesPanelOpen, isMiniMapVisible, isSnapToGridEnabled, edgeType, isProofreadEnabled, leftSidebarWidth, rightInspectorWidth, generalSections, textStyleTarget, textStylePreset, titleTextStylePreset, contentTextStylePreset, titleFontSize, contentFontSize])

  useEffect(() => {
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        const isGenerating = generation?.nodeId === node.id
        if (node.data.isGenerating === isGenerating) return node
        changed = true
        return { ...node, data: { ...node.data, isGenerating } }
      })
      return changed ? next : current
    })
  }, [generation])

  useEffect(() => {
    setEdges((current) => {
      let changed = false
      const next = current.map((edge) => {
        if (edge.type === edgeType) return edge
        changed = true
        return { ...edge, type: edgeType }
      })
      return changed ? next : current
    })
  }, [edgeType])

  useEffect(() => {
    const offDelta = window.graphChat.onGenerationDelta(({ nodeId, content }) => {
      snapshotRef.current = snapshotRef.current ? {
        ...snapshotRef.current,
        nodes: snapshotRef.current.nodes.map((node) => node.id === nodeId ? { ...node, content } : node)
      } : snapshotRef.current
      setNodes((current) => current.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, graphNode: { ...node.data.graphNode, content } } } : node))
    })
    const offDone = window.graphChat.onGenerationDone(({ snapshot, projects }) => {
      setProjects(projects)
      applySnapshot(snapshot)
      generationRef.current = null
      setGeneration(null)
      const next = generationQueueRef.current[0]
      if (next) {
        setGenerationQueue((current) => current.slice(1))
        void handleGenerate(next)
        setStatus('Generation completed — starting next...')
      } else {
        setStatus('Generation completed')
      }
    })
    const offError = window.graphChat.onGenerationError(({ message }) => {
      generationRef.current = null
      setGeneration(null)
      const next = generationQueueRef.current[0]
      if (next) {
        setGenerationQueue((current) => current.slice(1))
        void handleGenerate(next)
      }
      setError(message)
      setStatus('Generation failed')
    })
    const offProofreadDelta = window.graphChat.onProofreadDelta(({ proofreadId, content }) => {
      setProofread((current) => current?.proofreadId === proofreadId ? { ...current, correctedText: content } : current)
    })
    const offProofreadDone = window.graphChat.onProofreadDone(({ proofreadId, content }) => {
      setProofread((current) => current?.proofreadId === proofreadId ? { ...current, correctedText: content, isStreaming: false } : current)
    })
    const offProofreadError = window.graphChat.onProofreadError(({ proofreadId }) => {
      setProofread((current) => current?.proofreadId === proofreadId ? null : current)
    })
    return () => {
      offDelta()
      offDone()
      offError()
      offProofreadDelta()
      offProofreadDone()
      offProofreadError()
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
    setNodes((current) => {
      let changed = false
      const next = current.map((node) => {
        const isSelected = selectedNodeIds.includes(node.id)
        const isEditing = node.id === editingNodeId
        const isGenerating = generationRef.current?.nodeId === node.id
        if (
          node.data.isSelected === isSelected &&
          node.data.isEditing === isEditing &&
          node.data.isGenerating === isGenerating
        ) {
          return node
        }
        changed = true
        return {
          ...node,
          data: {
            ...node.data,
            isSelected,
            isEditing,
            isGenerating
          }
        }
      })
      return changed ? next : current
    })
  }, [selectedNodeIds, editingNodeId])

  const selectedNode = useMemo(() => selectedNodeIds.length === 1 ? snapshotRef.current?.nodes.find((node) => node.id === selectedNodeIds[0]) ?? null : null, [selectedNodeIds, nodes])
  const nodeTypes = useMemo(() => ({ graphNode: GraphNodeCard }), [])
  const proOptions = useMemo(() => ({ hideAttribution: true }), [])
  const canvasStyle = useMemo(() => ({ backgroundColor: 'var(--bg-canvas)' }), [])
  const snapGrid = useMemo<[number, number]>(() => [GRID_SIZE, GRID_SIZE], [])
  const defaultEdgeOptions = useMemo(
    () => ({ style: edgeStyleForHandle('text'), interactionWidth: 28, type: edgeType }),
    [edgeType]
  )

  function setSelectedEdge(edgeId: string | null) {
    setSelectedEdgeId(edgeId)
  }

  function setSelectedNodes(nodeIds: string[]) {
    const nextIds = [...new Set(nodeIds)]
    setSelectedNodeIds(nextIds)
    if (nextIds.length !== 1) {
      setEditingNodeId(null)
    }
    if (nextIds.length > 0) {
      setSelectedEdge(null)
    }
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        selected: nextIds.includes(node.id),
        data: {
          ...node.data,
          isSelected: nextIds.includes(node.id)
        }
      }))
    )
  }

  function selectNode(nodeId: string | null) {
    setSelectedNodes(nodeId ? [nodeId] : [])
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
        isSelected: selectedNodeIds.includes(node.id),
        isEditing: node.id === editingNodeId,
        isGenerating: generationRef.current?.nodeId === node.id,
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
        onProofreadRequest: handleProofreadRequest,
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
      animated: false,
      style: edgeStyleForHandle((edge.targetHandle as TextInputHandle | null) ?? null)
    })))
    setSelectedNodeIds((current) => current.filter((id) => normalizedSnapshot.nodes.some((node) => node.id === id)))
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
    const result = await window.graphChat.createProject('新しいプロジェクト')
    setProjects(result.projects)
    applySnapshot(result.snapshot)
    setIsProjectDirty(false)
    setRenamingProjectId(result.snapshot.project.id)
    setRenamingValue(result.snapshot.project.name)
  }

  function renameProject(project: ProjectRecord) {
    setRenamingProjectId(project.id)
    setRenamingValue(project.name)
    setProjectMenu(null)
  }

  async function submitRenameProject(projectId: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const result = await window.graphChat.renameProject(projectId, trimmed)
    setProjects(result.projects)
    applySnapshot(result.snapshot)
  }

  async function duplicateProject(project: ProjectRecord) {
    const result = await window.graphChat.duplicateProject(project.id, `${project.name} (copy)`)
    setProjects(result.projects)
    setProjectMenu(null)
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
    setSelectedEdge(null)
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
    if (!activeProjectIdRef.current || !snapshotRef.current) return
    if (generationRef.current) {
      setGenerationQueue((current) => current.includes(nodeId) ? current : [...current, nodeId])
      return
    }
    setError(null)
    setEditingNodeId(null)
    setStatus('Starting generation...')
    try {
      const result = await window.graphChat.startGeneration({ projectId: activeProjectIdRef.current, sourceNodeId: nodeId, snapshot: snapshotRef.current })
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

  function handleGenerateDownstream(nodeId: string) {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    const downstream = collectDownstreamTextNodes(nodeId, snapshot.nodes, snapshot.edges)
    const all = [nodeId, ...downstream]
    const [first, ...rest] = all
    setGenerationQueue((current) => [...current, ...rest])
    void handleGenerate(first)
  }

  async function stopGeneration() {
    if (!generation) return
    await window.graphChat.stopGeneration(generation.generationId)
    setGenerationQueue([])
    setGeneration(null)
    setStatus('Generation stopped')
  }

  function handleProofreadRequest(payload: { nodeId: string; text: string; selectionStart: number; selectionEnd: number; fullContent: string; rect: DOMRect }) {
    if (!isProofreadEnabled || !isModelLoaded) return
    if (proofreadRef.current) {
      void window.graphChat.stopProofread(proofreadRef.current.proofreadId)
    }
    const proofreadId = crypto.randomUUID()
    setProofread({
      proofreadId,
      nodeId: payload.nodeId,
      originalText: payload.text,
      correctedText: '',
      isStreaming: true,
      selectionStart: payload.selectionStart,
      selectionEnd: payload.selectionEnd,
      fullContent: payload.fullContent,
      position: { top: payload.rect.top, left: payload.rect.right + 8 }
    })
    void window.graphChat.startProofread(proofreadId, payload.text, proofreadSystemPrompt)
  }

  function acceptProofread() {
    const p = proofreadRef.current
    if (!p || !p.correctedText) return
    const snapshot = snapshotRef.current
    const node = snapshot?.nodes.find((n) => n.id === p.nodeId)
    if (!node) return
    const newContent = p.fullContent.slice(0, p.selectionStart) + p.correctedText + p.fullContent.slice(p.selectionEnd)
    const updated = { ...node, content: newContent }
    mutateLocalNode(updated)
    void persistNode(updated)
    setProofread(null)
  }

  function dismissProofread() {
    if (proofreadRef.current) {
      void window.graphChat.stopProofread(proofreadRef.current.proofreadId)
    }
    setProofread(null)
  }

  function getSelectedNodeRecords(nodeIds: string[]) {
    const snapshot = snapshotRef.current
    if (!snapshot || nodeIds.length === 0) return []
    const selectedIdSet = new Set(nodeIds)
    return snapshot.nodes.filter((node) => selectedIdSet.has(node.id))
  }

  function getCopiedSelection(nodeIds: string[]): CopiedSelection | null {
    const snapshot = snapshotRef.current
    if (!snapshot || nodeIds.length === 0) return null
    const selectedIdSet = new Set(nodeIds)
    const copiedNodes = getSelectedNodeRecords(nodeIds)
    if (copiedNodes.length === 0) return null
    return {
      nodes: copiedNodes,
      edges: snapshot.edges.filter((edge) => selectedIdSet.has(edge.targetId))
    }
  }

  async function removeSelected() {
    const snapshot = snapshotRef.current
    if (!snapshot || selectedNodeIds.length === 0) return
    const selectedIdSet = new Set(selectedNodeIds)
    applySnapshot({
      ...snapshot,
      nodes: snapshot.nodes.filter((node) => !selectedIdSet.has(node.id)),
      edges: snapshot.edges.filter((edge) => !selectedIdSet.has(edge.sourceId) && !selectedIdSet.has(edge.targetId))
    })
    setIsProjectDirty(true)
    setNodeMenu(null)
    setStatus(selectedNodeIds.length === 1 ? 'Node deleted' : `${selectedNodeIds.length} nodes deleted`)
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

  async function duplicateSelection(selection: CopiedSelection, options?: { targetCenter?: { x: number; y: number }; clearTextContent?: boolean; offset?: { x: number; y: number } }) {
    const snapshot = snapshotRef.current
    if (!snapshot || selection.nodes.length === 0) return
    const bounds = selection.nodes.reduce((acc, node) => ({
      minX: Math.min(acc.minX, node.position.x),
      minY: Math.min(acc.minY, node.position.y),
      maxX: Math.max(acc.maxX, node.position.x + node.size.width),
      maxY: Math.max(acc.maxY, node.position.y + node.size.height)
    }), {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    })
    const selectionCenter = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2
    }
    const offset = options?.targetCenter
      ? { x: options.targetCenter.x - selectionCenter.x, y: options.targetCenter.y - selectionCenter.y }
      : (options?.offset ?? { x: 60, y: 60 })
    const now = new Date().toISOString()
    const duplicatedIds = new Map<string, string>()
    const duplicatedNodes = selection.nodes.map((node) => {
      const nextId = crypto.randomUUID()
      duplicatedIds.set(node.id, nextId)
      return {
        ...node,
        id: nextId,
        title: node.title,
        content: options?.clearTextContent && node.type === 'text' ? '' : node.content,
        isGenerated: false,
        generationMeta: null,
        createdAt: now,
        updatedAt: now,
        position: normalizePosition({ x: node.position.x + offset.x, y: node.position.y + offset.y }, isSnapToGridEnabled)
      }
    })
    const duplicatedEdges = selection.edges.map((edge) => ({
      ...edge,
      id: crypto.randomUUID(),
      sourceId: duplicatedIds.get(edge.sourceId) ?? edge.sourceId,
      targetId: duplicatedIds.get(edge.targetId) ?? edge.targetId
    }))
    applySnapshot({
      ...snapshot,
      nodes: [...snapshot.nodes, ...duplicatedNodes],
      edges: [...snapshot.edges, ...duplicatedEdges]
    })
    setIsProjectDirty(true)
    setSelectedNodes(duplicatedNodes.map((node) => node.id))
    setNodeMenu(null)
    setStatus(duplicatedNodes.length === 1 ? 'Node duplicated' : `${duplicatedNodes.length} nodes duplicated`)
  }

  async function duplicateNode(nodeId: string, options?: { position?: { x: number; y: number }; clearTextContent?: boolean }) {
    const graphNode = snapshotRef.current?.nodes.find((node) => node.id === nodeId)
    if (!graphNode) return
    await duplicateSelection({ nodes: [graphNode], edges: [] }, {
      clearTextContent: options?.clearTextContent,
      targetCenter: options?.position
        ? { x: options.position.x + graphNode.size.width / 2, y: options.position.y + graphNode.size.height / 2 }
        : undefined,
      offset: options?.position ? undefined : { x: 60, y: 60 }
    })
  }

  async function removeEdge(edgeId: string) {
    const snapshot = snapshotRef.current
    if (!snapshot) return
    applySnapshot({ ...snapshot, edges: snapshot.edges.filter((edge) => edge.id !== edgeId) })
    setIsProjectDirty(true)
    setSelectedEdge(null)
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
    const selectionChanged = changes.some((change) => change.type === 'select')
    if (selectionChanged) {
      const selectedIds = new Set(nodes.filter((node) => node.selected).map((node) => node.id))
      for (const change of changes) {
        if (change.type !== 'select') continue
        if (change.selected) {
          selectedIds.add(change.id)
        } else {
          selectedIds.delete(change.id)
        }
      }
      setSelectedNodeIds(Array.from(selectedIds))
      if (selectedIds.size !== 1) {
        setEditingNodeId(null)
      }
      if (selectedIds.size > 0) {
        setSelectedEdge(null)
      }
    }
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
        setSelectedEdge(change.selected ? change.id : null)
        if (change.selected) {
          setSelectedNodeIds([])
          setEditingNodeId(null)
          setStatus('Connection selected. Press Delete to remove.')
        }
      }
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (proofreadRef.current) {
        if (event.key === 'Tab') {
          event.preventDefault()
          acceptProofread()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          dismissProofread()
          return
        }
      }
      if (isEditableElement(event.target)) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProject()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedNodeIds.length > 0) {
        event.preventDefault()
        const copiedSelection = getCopiedSelection(selectedNodeIds)
        if (!copiedSelection) return
        copiedSelectionRef.current = copiedSelection
        setStatus(copiedSelection.nodes.length === 1 ? `Copied ${copiedSelection.nodes[0]?.title || 'node'}` : `Copied ${copiedSelection.nodes.length} nodes`)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && copiedSelectionRef.current) {
        event.preventDefault()
        const bounds = mainRef.current?.getBoundingClientRect()
        const center = bounds
          ? reactFlow.screenToFlowPosition({
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2
            })
          : undefined
        void duplicateSelection(copiedSelectionRef.current, center ? { targetCenter: center } : undefined)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedNodeIds.length > 0) {
        event.preventDefault()
        const selection = getCopiedSelection(selectedNodeIds)
        if (!selection) return
        void duplicateSelection(selection)
        return
      }
      if (event.key === 'a' && !renamingProjectId) {
        event.preventDefault()
        reactFlow.fitView({ duration: 300, padding: 0.1 })
        return
      }
      if (event.key === 'f' && selectedNode && !renamingProjectId) {
        event.preventDefault()
        reactFlow.fitBounds(
          { x: selectedNode.position.x, y: selectedNode.position.y, width: selectedNode.size.width, height: selectedNode.size.height },
          { duration: 300, padding: 0.2 }
        )
        return
      }
      if (event.key === 'Delete' && selectedEdgeId) {
        event.preventDefault()
        void removeEdge(selectedEdgeId)
      } else if (event.key === 'Delete' && selectedNodeIds.length > 0) {
        event.preventDefault()
        void removeSelected()
      }
      if (event.key === 'Escape') {
        setCanvasMenu(null)
        setNodeMenu(null)
        setSelectedEdge(null)
        setIsModelModalOpen(false)
        setProjectDialog(null)
        setProjectMenu(null)
        setRenamingProjectId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNode, selectedEdgeId, selectedNodeIds, nodes])

  function mutateLocalNode(updated: GraphNodeRecord) {
    snapshotRef.current = snapshotRef.current ? { ...snapshotRef.current, nodes: snapshotRef.current.nodes.map((node) => node.id === updated.id ? updated : node) } : snapshotRef.current
    setNodes((current) => current.map((node) => node.id === updated.id ? { ...node, position: updated.position, style: { width: updated.size.width, height: updated.size.height }, data: { ...node.data, graphNode: updated, isSelected: selectedNodeIds.includes(updated.id), isEditing: updated.id === editingNodeId, isGenerating: generationRef.current?.nodeId === updated.id } } : node))
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
    setSelectedEdge(null)
  }

  function openNodeMenu(event: React.MouseEvent, nodeId: string) {
    event.preventDefault()
    event.stopPropagation()
    const bounds = mainRef.current?.getBoundingClientRect()
    selectNode(nodeId)
    setSelectedEdge(null)
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
      startWidth: side === 'left' ? leftSidebarWidth : effectivePropertiesWidth
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const hasNodes = nodes.length > 0
  const hasRightPanels = isSettingsPanelOpen || isPropertiesPanelOpen
  const effectivePropertiesWidth = Math.max(rightInspectorWidth, DEFAULT_RIGHT_INSPECTOR_WIDTH)
  const nodeMenuNode = nodeMenu ? snapshotRef.current?.nodes.find((node) => node.id === nodeMenu.nodeId) ?? null : null
  const filteredModels = settings?.availableModels.filter((model) => model.name.toLowerCase().includes(modelFilter.toLowerCase())) ?? []

  return (
    <div className="flex h-screen flex-col bg-[var(--bg)] text-[var(--text)]" style={{ ...nodeTextStyleVars } as React.CSSProperties}>
      <header className="relative z-30 h-10 border-b border-[var(--border)] bg-[var(--bg-sidebar)] px-3">
        <div className="relative flex h-full items-center justify-center">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <IconButton onClick={() => setIsSidebarOpen((current) => !current)} label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'} active={isSidebarOpen}>
              <NewFolderIcon className="h-[18px] w-[18px]" />
            </IconButton>
          </div>
          <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-2">
            <IconButton onClick={() => setIsPropertiesPanelOpen((current) => !current)} label={isPropertiesPanelOpen ? 'Hide details panel' : 'Show details panel'} active={isPropertiesPanelOpen}>
              <MessageIcon className="h-[17px] w-[17px]" />
            </IconButton>
            <IconButton onClick={() => setIsSettingsPanelOpen((current) => !current)} label={isSettingsPanelOpen ? 'Hide settings panel' : 'Show settings panel'} active={isSettingsPanelOpen}>
              <GearIcon className="h-[17px] w-[17px]" />
            </IconButton>
          </div>
          <div className="flex max-w-full items-center gap-2">
            <ModelSelectorButton
              onClick={() => void openModelModal()}
              label={settings ? (isModelLoaded ? displayModelName(settings.selectedModelName) : 'Select a model to load') : 'Select a model to load'}
              isActive={isModelSwitching || isModelLoaded}
              isGenerating={generation !== null}
            />
            {generation && (
              <div className="flex items-center gap-1">
                <IconButton onClick={() => void stopGeneration()} label="Stop generation">
                  <StopIcon className="h-3.5 w-3.5" />
                </IconButton>
                {generationQueue.length > 0 && (
                  <span className="rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                    +{generationQueue.length}
                  </span>
                )}
              </div>
            )}
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
          </div>
          <div className="flex items-center gap-1">
            <IconButton onClick={() => void createProject()} label="Create project">
              <NewFolderIcon className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {projects.map((project) => (
            <div key={project.id} className={`relative mb-1.5 rounded-[10px] px-3 py-3 ${project.id === activeProjectId ? 'bg-[rgba(124,90,247,0.18)] text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0" onClick={() => renamingProjectId !== project.id && void switchProject(project.id)}>
                  {renamingProjectId === project.id ? (
                    <input
                      autoFocus
                      value={renamingValue}
                      onChange={(event) => setRenamingValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') { void submitRenameProject(project.id, renamingValue); setRenamingProjectId(null) }
                        if (event.key === 'Escape') setRenamingProjectId(null)
                        event.stopPropagation()
                      }}
                      onBlur={() => { void submitRenameProject(project.id, renamingValue); setRenamingProjectId(null) }}
                      onClick={(event) => event.stopPropagation()}
                      className="w-full rounded-md border border-[var(--accent-border)] bg-[var(--bg-input)] px-2 py-0.5 text-[13px] font-medium text-[var(--text)] outline-none"
                    />
                  ) : (
                    <div className={`truncate text-[13px] font-medium ${project.id === activeProjectId ? 'text-[var(--text)]' : 'text-[var(--text-dim)]'}`}>{project.name}</div>
                  )}
                  <div className={`truncate text-[11px] ${project.id === activeProjectId ? 'text-[var(--text-dim)]' : 'text-[var(--text-faint)]'}`}>{new Date(project.updatedAt).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {project.id === activeProjectId && isProjectDirty && (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                      <IconButton onClick={() => void saveProject()} label="Save project">
                        <SaveIcon className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  )}
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
              </div>
              {projectMenu?.projectId === project.id && (
                <div
                  className="absolute right-3 top-12 z-30 w-36 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-1 text-sm text-[var(--text)] shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MenuAction label="Rename" onClick={() => void renameProject(project)} />
                  <MenuAction label="Duplicate" onClick={() => void duplicateProject(project)} />
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
                label="Generate From Here"
                onClick={() => {
                  void handleGenerate(nodeMenuNode.id)
                  setNodeMenu(null)
                }}
              />
            )}
            {nodeMenuNode.type === 'text' && (
              <MenuAction
                label="Generate Downstream"
                onClick={() => {
                  handleGenerateDownstream(nodeMenuNode.id)
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
              label="Delete Node"
              onClick={() => {
                void removeNode(nodeMenuNode.id)
              }}
            />
          </div>
        )}
        {isModelModalOpen && settings && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-6" onClick={() => !isModelSwitching && setIsModelModalOpen(false)}>
            <div className="relative w-full max-w-2xl rounded-xl border border-[var(--border-strong)] bg-[var(--bg-sidebar)] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div />
                <button className="rounded-[12px] border border-[var(--border-strong)] px-3 py-1 text-sm text-[var(--text)] disabled:opacity-40" onClick={() => setIsModelModalOpen(false)} disabled={isModelSwitching}>Close</button>
              </div>
              <div className={`mt-4 max-h-[420px] overflow-y-auto transition ${isModelSwitching ? 'pointer-events-none opacity-35 blur-[1px]' : ''}`}>
                <div className="px-1 pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">Your Models</div>
                {filteredModels.map((model) => {
                  const isActive = isModelLoaded && model.path === settings.selectedModelPath
                  return (
                    <button
                      key={model.path}
                      className={`block w-full rounded-[12px] border px-3 py-2.5 text-left text-[13px] transition disabled:cursor-wait disabled:opacity-70 ${isActive ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]' : 'border-transparent text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:bg-white/4 hover:text-[var(--text)]'}`}
                      onClick={() => void handleSelectModel(model)}
                      disabled={isModelSwitching || generation !== null}
                    >
                      <div className="flex items-center justify-between gap-6">
                        <div className="min-w-0 truncate font-mono text-[14px] font-semibold leading-5">{displayModelName(model.name)}</div>
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
              {isModelSwitching && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-[14px] border border-[var(--border-strong)] bg-[rgba(17,19,24,0.94)] px-4 py-3 shadow-xl">
                    <div className="inline-flex items-center gap-3 text-sm font-medium text-[var(--text)]">
                      <SpinnerIcon className="h-4 w-4 animate-spin" />
                      <span>モデルを読み込んでいます</span>
                    </div>
                  </div>
                </div>
              )}
              {generation && <p className="mt-4 text-[13px] text-amber-300">You cannot switch models while generation is running.</p>}
            </div>
          </div>
        )}
        {proofread && (
          <div
            className="fixed z-50 w-80 rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-2xl"
            style={{ top: proofread.position.top, left: proofread.position.left }}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--text-dim)]">校正</span>
              {proofread.isStreaming && <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-[var(--text-faint)]" />}
            </div>
            <div className="px-4 py-3">
              <p className="text-[12px] text-[var(--text)] leading-5 whitespace-pre-wrap">{proofread.correctedText || proofread.originalText}</p>
            </div>
            {!proofread.isStreaming && proofread.correctedText && (
              <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
                <button
                  className="rounded-[8px] bg-[var(--accent)] px-3 py-1 text-[12px] font-medium text-white hover:bg-[var(--accent-hover)]"
                  onClick={acceptProofread}
                >
                  適用 (Tab)
                </button>
                <button
                  className="rounded-[8px] px-3 py-1 text-[12px] text-[var(--text-dim)] hover:bg-white/5"
                  onClick={dismissProofread}
                >
                  キャンセル (Esc)
                </button>
              </div>
            )}
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
                    if (projectDialog.projectId) {
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
                    if (projectDialog.projectId) {
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
          edgeTypes={edgeTypes}
          proOptions={proOptions}
          style={canvasStyle}
          minZoom={0.1}
          maxZoom={2}
          snapToGrid={isSnapToGridEnabled}
          snapGrid={snapGrid}
          onPaneContextMenu={openCanvasMenu}
            onPaneClick={() => {
              setCanvasMenu(null)
              setNodeMenu(null)
              selectNode(null)
              setSelectedEdge(null)
            }}
          onNodesChange={handleNodeChanges}
          onEdgesChange={handleEdgeChanges}
          onConnect={(connection) => void onConnect(connection)}
          onNodeClick={(event, node) => {
            setSelectedNodes(event.shiftKey ? (selectedNodeIds.includes(node.id) ? selectedNodeIds.filter((id) => id !== node.id) : [...selectedNodeIds, node.id]) : [node.id])
            setSelectedEdge(null)
            setCanvasMenu(null)
            setNodeMenu(null)
          }}
          onNodeContextMenu={(event, node) => {
            openNodeMenu(event, node.id)
          }}
          onEdgeClick={(_, edge) => {
            selectNode(null)
            setSelectedEdge(edge.id)
            setCanvasMenu(null)
            setNodeMenu(null)
            setStatus('Connection selected. Press Delete to remove.')
          }}
          onEdgeDoubleClick={(_, edge) => {
            void removeEdge(edge.id)
          }}
          defaultEdgeOptions={defaultEdgeOptions}
        >
          {isMiniMapVisible && <MiniMap pannable zoomable nodeColor={(node) => getMiniMapNodeColor(node as Node<AppNodeData>)} />}
          <Background gap={GRID_SIZE} size={1.4} color="#394154" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </main>

      {hasRightPanels && (
      <>
      <SidebarResizeHandle onMouseDown={(event) => beginSidebarResize('right', event)} />
      <div className="flex shrink-0 border-l border-[var(--border)] bg-[var(--bg-sidebar)]">
        {isPropertiesPanelOpen && (
          <section style={{ width: effectivePropertiesWidth }} className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <h2 className="text-[18px] font-semibold">Details</h2>
              <p className="mt-1 text-[12px] text-[var(--text-dim)]">{selectedNode ? displayNodeTypeLabel(selectedNode.type, selectedNode.isLocal) : (selectedNodeIds.length > 1 ? `${selectedNodeIds.length} nodes selected` : 'Select a node to review and edit it here')}</p>
            </div>
            {selectedNode ? (
              <NodeEditor
                node={selectedNode}
                disabled={generation?.nodeId === selectedNode.id}
                currentModelName={settings?.selectedModelName ?? null}
                contextLength={settings?.contextLength ?? null}
                onGenerate={() => void handleGenerate(selectedNode.id)}
                onChange={(updated) => {
                  mutateLocalNode(updated)
                  void persistNode(updated)
                }}
                onDuplicate={() => void duplicateNode(selectedNode.id)}
                onDelete={() => void removeSelected()}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--text-dim)]">Select a single node to edit its title, content, and generation details.</div>
            )}
          </section>
        )}
        {isSettingsPanelOpen && (
          <section style={{ width: DEFAULT_SETTINGS_PANEL_WIDTH }} className="flex shrink-0 flex-col bg-[var(--bg-sidebar)]">
            <div className="border-b border-[var(--border)] px-5 py-3">
              <h2 className="text-[18px] font-semibold">Settings</h2>
              <p className="mt-1 text-[12px] text-[var(--text-dim)]">App preferences and text display</p>
            </div>
            <GeneralInspector
              settings={settings}
              isMiniMapVisible={isMiniMapVisible}
              isSnapToGridEnabled={isSnapToGridEnabled}
              edgeType={edgeType}
              isProofreadEnabled={isProofreadEnabled}
              textStyleTarget={textStyleTarget}
              textStylePreset={textStylePreset}
              titleTextStylePreset={titleTextStylePreset}
              contentTextStylePreset={contentTextStylePreset}
              titleFontSize={titleFontSize}
              contentFontSize={contentFontSize}
              sections={generalSections}
              onToggleSection={(section) => setGeneralSections((current) => ({ ...current, [section]: !current[section] }))}
              onToggleMiniMap={() => setIsMiniMapVisible((current) => !current)}
              onToggleSnapToGrid={toggleSnapToGrid}
              onChangeEdgeType={setEdgeType}
              onToggleProofread={() => setIsProofreadEnabled((current) => !current)}
              onChangeTextStyleTarget={setTextStyleTarget}
              onChangeTextStylePreset={(value) => {
                setTextStylePreset(value)
                if (textStyleTarget === 'both') {
                  setTitleTextStylePreset(value)
                  setContentTextStylePreset(value)
                  return
                }
                if (textStyleTarget === 'title') {
                  setTitleTextStylePreset(value)
                  return
                }
                setContentTextStylePreset(value)
              }}
              onChangeTextSize={(target, value) => {
                const resolved = clamp(value, 11, 26)
                if (target === 'both') {
                  setTitleFontSize(resolved)
                  setContentFontSize(resolved)
                  return
                }
                if (target === 'title') {
                  setTitleFontSize(resolved)
                  return
                }
                setContentFontSize(resolved)
              }}
              proofreadSystemPrompt={proofreadSystemPrompt}
              onSaveProofreadSystemPrompt={(value) => {
                const resolved = value.trim() === '' ? DEFAULT_PROOFREAD_SYSTEM_PROMPT : value
                setProofreadSystemPrompt(resolved)
                void window.graphChat.savePreferences({ proofreadSystemPrompt: resolved })
              }}
              onChangeContextLength={(value) => void handleContextLengthChange(value)}
              onChangeTemperature={(value) => void handleTemperatureChange(value)}
            />
          </section>
        )}
      </div>
      </>
      )}
      </div>
    </div>
  )
}

function GraphNodeCard({ data }: { data: AppNodeData }) {
  const node = data.graphNode
  const [draftTitle, setDraftTitle] = useState(node.title)
  const [draftContent, setDraftContent] = useState(node.content)
  const [isComposing, setIsComposing] = useState(false)
  const wasEditingRef = useRef(data.isEditing)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const proofreadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { zoom } = useViewport()
  const FADE_START = 0.65
  const FADE_END = 0.5
  const externalTitleOpacity = zoom >= FADE_START ? 0 : zoom <= FADE_END ? 1 : (FADE_START - zoom) / (FADE_START - FADE_END)
  const colors = {
    text: 'border-[#6b7280] bg-[var(--bg-card)]',
    context: 'border-[rgb(90,100,210)] bg-[var(--bg-card)]',
    instruction: 'border-[rgb(156,76,196)] bg-[var(--bg-card)]'
  } as const

  useEffect(() => {
    if (node.id !== data.graphNode.id) return
    setDraftTitle(node.title)
    setDraftContent(node.content)
    wasEditingRef.current = data.isEditing
  }, [node.id, node.title, node.content, data.isEditing])

  useEffect(() => {
    if (data.isEditing && !wasEditingRef.current) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
    wasEditingRef.current = data.isEditing
  }, [data.isEditing])

  function commitDraft() {
    if (draftTitle !== node.title || draftContent !== node.content) {
      data.onChange({ ...node, title: draftTitle, content: draftContent })
    }
  }

  return (
    <div className={`relative h-full w-full rounded-3xl border-2 px-9 py-6 shadow-lg shadow-black/30 transition ${colors[node.type]} ${!data.isGenerating && data.isSelected ? 'ring-4 ring-[var(--accent-border)]' : ''}`} onMouseDown={() => data.onSelect(node.id)}>
      {data.isGenerating && <div className="node-generating-border pointer-events-none absolute inset-0 rounded-3xl" />}
      {externalTitleOpacity > 0 && (
        <div
          className="pointer-events-none absolute left-0 whitespace-nowrap text-[var(--text)]"
          style={{
            bottom: `calc(100% + ${6 / zoom}px)`,
            fontSize: `${12 / zoom}px`,
            opacity: externalTitleOpacity,
            lineHeight: 1.2,
            fontFamily: 'var(--node-title-font-family)',
            fontWeight: 'var(--node-title-font-weight)',
            letterSpacing: 'var(--node-title-letter-spacing)',
          }}
        >
          {node.title || 'Untitled'}
        </div>
      )}
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
      <Handle id="output" type="source" position={Position.Right} style={{ top: '28%' }} className="!h-5 !w-5 !border-2 !border-[var(--text-faint)] !bg-[var(--text)]" />
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-start gap-2">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-[0.24em] text-[var(--text-dim)]">{displayNodeTypeLabel(node.type, node.isLocal)}</div>
            {!data.isEditing && <div className="text-lg text-[var(--text)]" style={{ fontFamily: 'var(--node-title-font-family)', fontSize: 'var(--node-title-font-size)', fontWeight: 'var(--node-title-font-weight)', letterSpacing: 'var(--node-title-letter-spacing)' }}>{node.title || 'Untitled'}</div>}
          </div>
          <button
            className={`nodrag nopan ml-auto rounded-[10px] border px-3 py-1.5 text-sm font-medium transition ${
              data.isEditing
                ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]'
                : 'border-[var(--border-strong)] bg-[rgba(28,31,43,0.92)] text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]'
            }`}
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              if (data.isEditing) {
                commitDraft()
                data.onStopEdit()
              } else {
                data.onStartEdit(node.id)
              }
            }}
          >
            {data.isEditing ? 'Done' : 'Edit'}
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
                  commitDraft()
                }
                data.onGenerate(node.id)
              }}
            >
                Generate
            </button>
          )}
        </div>
        {data.isEditing ? (
          <div className="flex flex-1 flex-col gap-3">
            <input
              ref={titleInputRef}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onBlur={commitDraft}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder="Untitled"
              className="nodrag nopan rounded-md border border-[var(--border-strong)] bg-[rgba(0,0,0,0.14)] px-3 py-2 text-[var(--text)] outline-none"
              style={{ fontFamily: 'var(--node-title-font-family)', fontSize: 'var(--node-title-font-size)', fontWeight: 'var(--node-title-font-weight)', letterSpacing: 'var(--node-title-letter-spacing)' }}
            />
            <textarea
            ref={textareaRef}
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setIsComposing(false)
              setDraftContent(event.currentTarget.value)
            }}
            onBlur={() => {
              setIsComposing(false)
              commitDraft()
            }}
            onSelect={(event) => {
              const el = event.currentTarget
              const selected = el.value.slice(el.selectionStart, el.selectionEnd).trim()
              if (proofreadTimerRef.current) clearTimeout(proofreadTimerRef.current)
              if (!selected) return
              proofreadTimerRef.current = setTimeout(() => {
                const rect = el.getBoundingClientRect()
                data.onProofreadRequest({ nodeId: node.id, text: selected, selectionStart: el.selectionStart, selectionEnd: el.selectionEnd, fullContent: el.value, rect })
              }, 600)
            }}
            onMouseDown={(event) => event.stopPropagation()}
            placeholder="No content yet."
            className="node-scrollbar nodrag nopan nowheel flex-1 resize-none overflow-y-auto rounded-md border border-[var(--border-strong)] bg-[rgba(0,0,0,0.14)] px-3 py-2 text-[var(--text)] outline-none"
            style={{ fontFamily: 'var(--node-content-font-family)', fontSize: 'var(--node-content-font-size)', fontWeight: 'var(--node-content-font-weight)', lineHeight: 'var(--node-content-line-height)', letterSpacing: 'var(--node-content-letter-spacing)' }}
            />
          </div>
        ) : (
          <div
            className={`node-scrollbar flex-1 overflow-y-auto whitespace-pre-wrap pr-1 text-[var(--text)]${data.isSelected ? ' nowheel' : ''}`}
            style={{ fontFamily: 'var(--node-content-font-family)', fontSize: 'var(--node-content-font-size)', fontWeight: 'var(--node-content-font-weight)', lineHeight: 'var(--node-content-line-height)', letterSpacing: 'var(--node-content-letter-spacing)' }}
            onDoubleClick={() => data.onStartEdit(node.id)}
          >{getNodePreview(node.content) || 'No content yet.'}</div>
        )}
        {node.generationMeta && (
          <div className="mt-3 flex items-center gap-x-2 text-xs text-[var(--text-dim)]">
            {node.model && (
              <MetaItem icon={<CpuIcon className="h-3.5 w-3.5" />} label={displayModelName(node.model)} />
            )}
            <div className="ml-auto inline-flex items-center gap-1">
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{new Date(node.updatedAt).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-dim)]">
          {node.generationMeta?.completionTokens != null && <MetaItem icon={<MessageIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.completionTokens} tokens`} />}
          {node.generationMeta?.tokensPerSecond != null && <MetaItem icon={<BoltIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.tokensPerSecond.toFixed(1)} tok/s`} />}
          {node.generationMeta?.durationSeconds != null && <MetaItem icon={<ClockIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.durationSeconds.toFixed(2)}s`} />}
          {node.generationMeta?.finishReason && <MetaItem icon={<FlagIcon className="h-3.5 w-3.5" />} label={node.generationMeta.finishReason} />}
          {(node.type === 'context' || node.type === 'instruction') && (
            <MetaItem icon={<MessageIcon className="h-3.5 w-3.5" />} label={`~${estimateTokenCount(node.content)} tokens`} />
          )}
          <div className="ml-auto">
            <MetaItem icon={<SidebarToggleIcon className="h-3.5 w-3.5" />} label={`${Math.round(node.size.width)} x ${Math.round(node.size.height)}`} />
          </div>
        </div>
        <div className="hidden mt-3 justify-between text-xs text-[var(--text-dim)]">
          <div className="flex items-center gap-3">
            <button className="nodrag nopan" onClick={() => {
              if (data.isEditing) {
                commitDraft()
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
  onGenerate,
  onChange,
  onDuplicate,
  onDelete
}: {
  node: GraphNodeRecord
  disabled: boolean
  currentModelName: string | null
  contextLength: number | null
  onGenerate: () => void
  onChange: (node: GraphNodeRecord) => void
  onDuplicate: () => void
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
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [draftTitle, setDraftTitle] = useState(node.title)
  const [draftContent, setDraftContent] = useState(node.content)
  const [draftScope, setDraftScope] = useState(node.isLocal ? 'local' : 'global')

  useEffect(() => {
    setDraftTitle(node.title)
    setDraftContent(node.content)
    setDraftScope(node.isLocal ? 'local' : 'global')
    setIsEditingDetails(false)
  }, [node.id, node.title, node.content, node.isLocal])

  function saveDetails() {
    onChange({
      ...node,
      title: draftTitle,
      content: draftContent,
      isLocal: draftScope === 'local'
    })
    setIsEditingDetails(false)
  }

  function cancelDetailsEdit() {
    setDraftTitle(node.title)
    setDraftContent(node.content)
    setDraftScope(node.isLocal ? 'local' : 'global')
    setIsEditingDetails(false)
  }

  function startDetailsEdit() {
    if (disabled) return
    setIsEditingDetails(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        {node.type === 'text' && <ToolbarButton onClick={onGenerate} label="Generate" variant="accent" />}
        <ToolbarButton onClick={() => setIsEditingDetails((current) => !current)} label={isEditingDetails ? 'Done' : 'Edit'} />
      </div>
      {isEditingDetails ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <label className="mb-4 block">
            <div className="mb-2 text-sm font-medium text-[var(--text-dim)]">Title</div>
            <input value={draftTitle} disabled={disabled} onChange={(event) => setDraftTitle(event.target.value)} className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-sm outline-none" />
          </label>
          <label className="mb-4 flex min-h-0 flex-1 flex-col">
            <div className="mb-2 text-sm font-medium text-[var(--text-dim)]">Content</div>
            <textarea value={draftContent} disabled={disabled} onChange={(event) => setDraftContent(event.target.value)} className="inspector-scrollbar min-h-[16rem] flex-1 rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-sm leading-7 outline-none" />
            {estimatedContentTokens !== null && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
                <MessageIcon className="h-3.5 w-3.5" />
                <span>Estimated tokens: {estimatedContentTokens}</span>
              </div>
            )}
          </label>
          {(node.type === 'context' || node.type === 'instruction') && (
            <div className="mb-4">
              <div className="mb-2 text-sm font-medium text-[var(--text-dim)]">Scope</div>
              <select
                value={draftScope}
                disabled={disabled}
                onChange={(event) => setDraftScope(event.target.value)}
                className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text)] outline-none"
              >
                <option value="global">Global</option>
                <option value="local">Local</option>
              </select>
            </div>
          )}
          <div className="mb-5 flex flex-wrap gap-2">
            <ToolbarButton onClick={saveDetails} label="Save" />
            <ToolbarButton onClick={cancelDetailsEdit} label="Cancel" />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-5 px-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Title</div>
            <div
              className={`mt-2 text-[var(--text)] ${disabled ? '' : 'cursor-text'}`}
              onDoubleClick={startDetailsEdit}
              style={{ fontFamily: 'var(--node-title-font-family)', fontSize: 'var(--node-title-font-size)', fontWeight: 'var(--node-title-font-weight)', letterSpacing: 'var(--node-title-letter-spacing)' }}
            >
              {node.title || 'Untitled'}
            </div>
          </div>
          <div className="mb-5 flex min-h-0 flex-1 flex-col px-1">
            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Content</div>
            <div
              className={`inspector-scrollbar min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[var(--text)] ${disabled ? '' : 'cursor-text'}`}
              onDoubleClick={startDetailsEdit}
              style={{ fontFamily: 'var(--node-content-font-family)', fontSize: 'var(--node-content-font-size)', fontWeight: 'var(--node-content-font-weight)', lineHeight: 'var(--node-content-line-height)', letterSpacing: 'var(--node-content-letter-spacing)' }}
            >
              {node.content || 'No content yet.'}
            </div>
            {estimatedContentTokens !== null && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
                <MessageIcon className="h-3.5 w-3.5" />
                <span>Estimated tokens: {estimatedContentTokens}</span>
              </div>
            )}
          </div>
          {(node.type === 'context' || node.type === 'instruction') && (
            <div className="mb-5 px-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-faint)]">Scope</div>
              <div className="mt-2 text-[var(--text)]" style={{ fontFamily: 'var(--node-content-font-family)', fontSize: 'var(--node-content-font-size)', fontWeight: 'var(--node-content-font-weight)', lineHeight: 'var(--node-content-line-height)', letterSpacing: 'var(--node-content-letter-spacing)' }}>{node.isLocal ? 'Local' : 'Global'}</div>
            </div>
          )}
        </div>
      )}
      {node.generationMeta && (
        <div className="mt-1 mb-4 shrink-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-dim)]">
          {node.generationMeta.tokensPerSecond !== null && <MetaItem icon={<BoltIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.tokensPerSecond.toFixed(1)} tok/sec`} />}
          {node.generationMeta.completionTokens !== null && <MetaItem icon={<MessageIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.completionTokens} tokens`} />}
          {node.generationMeta.durationSeconds !== null && <MetaItem icon={<ClockIcon className="h-3.5 w-3.5" />} label={`${node.generationMeta.durationSeconds.toFixed(2)}s`} />}
          {node.generationMeta.finishReason && <MetaItem icon={<FlagIcon className="h-3.5 w-3.5" />} label={`Finish reason: ${node.generationMeta.finishReason}`} />}
          </div>
          {totalTokens !== null && contextLength && contextUsagePercent !== null && (
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-dim)]">
              <ContextUsageGauge percent={contextUsagePercent} />
              <div className="leading-5">{totalTokens} / {contextLength} tokens</div>
              <div className="leading-5 text-[var(--text-faint)]">Context usage {contextUsagePercent.toFixed(1)}%</div>
            </div>
          )}
        </div>
      )}
      <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-dim)]">
        <div className="inline-flex items-center gap-1.5">
          <CpuIcon className="h-3.5 w-3.5" />
          <span>{node.model ? displayModelName(node.model) : (currentModelName ? displayModelName(currentModelName) : 'default')}</span>
        </div>
        {node.generationMeta && (
          <div className="inline-flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>{new Date(node.updatedAt).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function GeneralInspector({
  settings,
  isMiniMapVisible,
  isSnapToGridEnabled,
  edgeType,
  isProofreadEnabled,
  textStyleTarget,
  textStylePreset,
  titleTextStylePreset,
  contentTextStylePreset,
  titleFontSize,
  contentFontSize,
  proofreadSystemPrompt,
  sections,
  onToggleSection,
  onToggleMiniMap,
  onToggleSnapToGrid,
  onChangeEdgeType,
  onToggleProofread,
  onChangeTextStyleTarget,
  onChangeTextStylePreset,
  onChangeTextSize,
  onSaveProofreadSystemPrompt,
  onChangeContextLength,
  onChangeTemperature
}: {
  settings: AppSettings | null
  isMiniMapVisible: boolean
  isSnapToGridEnabled: boolean
  edgeType: 'default' | 'smoothstep' | 'step'
  isProofreadEnabled: boolean
  textStyleTarget: TextStyleTarget
  textStylePreset: TextStylePreset
  titleTextStylePreset: TextStylePreset
  contentTextStylePreset: TextStylePreset
  titleFontSize: number
  contentFontSize: number
  proofreadSystemPrompt: string
  sections: { context: boolean; interface: boolean; textStyle: boolean; editing: boolean }
  onToggleSection: (section: GeneralSectionKey) => void
  onToggleMiniMap: () => void
  onToggleSnapToGrid: () => void
  onChangeEdgeType: (value: 'default' | 'smoothstep' | 'step') => void
  onToggleProofread: () => void
  onChangeTextStyleTarget: (value: TextStyleTarget) => void
  onChangeTextStylePreset: (value: TextStylePreset) => void
  onChangeTextSize: (target: TextStyleTarget, value: number) => void
  onSaveProofreadSystemPrompt: (value: string) => void
  onChangeContextLength: (value: number) => void
  onChangeTemperature: (value: number) => void
}) {
  const defaultContextLength = 32768
  const defaultTemperature = 0.8
  const [pendingTemperature, setPendingTemperature] = useState(settings?.temperature ?? defaultTemperature)
  const [pendingContextLength, setPendingContextLength] = useState(settings?.contextLength ?? defaultContextLength)
  const [draftSystemPrompt, setDraftSystemPrompt] = useState(proofreadSystemPrompt)
  const activeTextSize = getActiveTextSize(textStyleTarget, titleFontSize, contentFontSize)
  const activeTextPreset = getActiveTextPreset(textStyleTarget, titleTextStylePreset, contentTextStylePreset)
  const selectedTextStyle = TEXT_STYLE_PRESETS[activeTextPreset]
  const isTextSizeMixed = textStyleTarget === 'both' && titleFontSize !== contentFontSize
  const isTextPresetMixed = textStyleTarget === 'both' && titleTextStylePreset !== contentTextStylePreset
  const isSystemPromptChanged = draftSystemPrompt !== proofreadSystemPrompt
  const isTemperatureChanged = pendingTemperature !== defaultTemperature
  const isContextLengthChanged = pendingContextLength !== defaultContextLength

  useEffect(() => {
    setPendingTemperature(settings?.temperature ?? defaultTemperature)
  }, [settings?.temperature])

  useEffect(() => {
    setPendingContextLength(settings?.contextLength ?? defaultContextLength)
  }, [settings?.contextLength])

  useEffect(() => {
    setDraftSystemPrompt(proofreadSystemPrompt)
  }, [proofreadSystemPrompt])

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
            className={`relative h-[16px] w-[28px] rounded-full transition ${isMiniMapVisible ? 'bg-[var(--accent-hover)]' : 'bg-[rgba(255,255,255,0.1)]'}`}
          >
            <span
              className={`absolute top-[2px] h-[12px] w-[12px] rounded-full transition ${isMiniMapVisible ? 'left-[14px] bg-white' : 'left-[2px] bg-[rgba(255,255,255,0.35)]'}`}
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
            className={`relative h-[16px] w-[28px] rounded-full transition ${isSnapToGridEnabled ? 'bg-[var(--accent-hover)]' : 'bg-[rgba(255,255,255,0.1)]'}`}
          >
            <span
              className={`absolute top-[2px] h-[12px] w-[12px] rounded-full transition ${isSnapToGridEnabled ? 'left-[14px] bg-white' : 'left-[2px] bg-[rgba(255,255,255,0.35)]'}`}
            />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Edge Style</span>
          <select
            value={edgeType}
            onChange={(event) => onChangeEdgeType(event.target.value as 'default' | 'smoothstep' | 'step')}
            className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 py-0.5 text-[12px] text-[var(--text)] outline-none"
          >
            <option value="default">Bezier</option>
            <option value="smoothstep">Smooth Step</option>
            <option value="step">Step</option>
          </select>
        </div>
      </InspectorSection>

      <InspectorSection
        title="Text Style"
        icon={<EditIcon className="h-[15px] w-[15px]" />}
        open={sections.textStyle}
        onToggle={() => onToggleSection('textStyle')}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Apply To</span>
          <select
            value={textStyleTarget}
            onChange={(event) => onChangeTextStyleTarget(event.target.value as TextStyleTarget)}
            className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 py-0.5 text-[12px] text-[var(--text)] outline-none"
          >
            <option value="both">Title + Text</option>
            <option value="title">Title</option>
            <option value="content">Text</option>
          </select>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Preset</span>
          <select
            value={activeTextPreset}
            onChange={(event) => onChangeTextStylePreset(event.target.value as TextStylePreset)}
            className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-input)] px-2 py-0.5 text-[12px] text-[var(--text)] outline-none"
          >
            {Object.entries(TEXT_STYLE_PRESETS).map(([value, option]) => (
              <option key={value} value={value}>{option.label}</option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[var(--text-faint)]">{selectedTextStyle.description}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Size</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={11}
              max={26}
              step={1}
              value={activeTextSize}
              onChange={(event) => onChangeTextSize(textStyleTarget, Number(event.target.value))}
              className={`graph-slider w-28 ${isTextSizeMixed || titleFontSize !== DEFAULT_TITLE_FONT_SIZE || contentFontSize !== DEFAULT_CONTENT_FONT_SIZE ? 'graph-slider-active' : ''}`}
            />
            <input
              type="number"
              min={11}
              max={26}
              step={1}
              value={activeTextSize}
              onChange={(event) => onChangeTextSize(textStyleTarget, Number(event.target.value) || activeTextSize)}
              className="h-7 w-[52px] rounded-[9px] border border-[var(--border-strong)] bg-[rgba(28,31,43,0.88)] px-2 py-1 text-right text-[12px] text-[var(--text)] outline-none"
            />
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-[var(--text-faint)]">{isTextPresetMixed ? 'Title and text currently use different presets. Choosing Both will align them.' : isTextSizeMixed ? 'Title and text currently use different sizes. Choosing Both will align them.' : 'These settings are auto-saved and restored on the next launch.'}</p>
      </InspectorSection>

      <InspectorSection
        title="Editing"
        icon={<EditIcon className="h-[15px] w-[15px]" />}
        open={sections.editing}
        onToggle={() => onToggleSection('editing')}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-[var(--text-dim)]">Proofread on Select</span>
          <button
            type="button"
            role="switch"
            aria-checked={isProofreadEnabled}
            onClick={onToggleProofread}
            className={`relative h-[16px] w-[28px] rounded-full transition ${isProofreadEnabled ? 'bg-[var(--accent-hover)]' : 'bg-[rgba(255,255,255,0.1)]'}`}
          >
            <span className={`absolute top-[2px] h-[12px] w-[12px] rounded-full transition ${isProofreadEnabled ? 'left-[14px] bg-white' : 'left-[2px] bg-[rgba(255,255,255,0.35)]'}`} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-[13px] text-[var(--text-dim)]">System Prompt</span>
          <textarea
            value={draftSystemPrompt}
            onChange={(e) => setDraftSystemPrompt(e.target.value)}
            rows={5}
            className="w-full resize-y rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
          />
          <button
            type="button"
            disabled={!isSystemPromptChanged}
            onClick={() => onSaveProofreadSystemPrompt(draftSystemPrompt)}
            className="self-end rounded-md border border-[var(--border-strong)] bg-[rgba(28,31,43,0.92)] px-3 py-1 text-[12px] text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save
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

function ToolbarButton({ onClick, label, variant = 'default' }: { onClick: () => void; label: string; variant?: 'default' | 'accent' }) {
  const className = variant === 'accent'
    ? 'rounded-md border border-[var(--accent-border)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[var(--accent-hover)]'
    : 'rounded-md border border-[var(--border-strong)] bg-[rgba(28,31,43,0.92)] px-4 py-2 text-sm font-medium text-[var(--text)] shadow-sm transition hover:bg-white/5'

  return <button className={className} onClick={onClick}>{label}</button>
}

function MetaItem({ icon, label }: { icon: ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5">{icon}<span>{label}</span></span>
}

function ContextUsageGauge({ percent }: { percent: number }) {
  const normalizedPercent = Math.max(0, Math.min(percent, 100))
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - normalizedPercent / 100)

  return (
    <div className="shrink-0 text-[var(--accent)]">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 14 14)"
        />
      </svg>
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
      className={`flex h-[30px] w-[30px] items-center justify-center rounded-[10px] transition hover:bg-white/5 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${active ? 'text-[var(--accent)] hover:text-[var(--accent-hover)]' : 'text-[var(--text-faint)] hover:text-[var(--text-dim)]'}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function ModelSelectorButton({ onClick, label, isActive = false, isGenerating = false }: { onClick: () => void; label: string; isActive?: boolean; isGenerating?: boolean }) {
  return (
    <button
      className={`flex min-w-[220px] max-w-[480px] items-center gap-2 rounded-[8px] border px-3.5 py-1.5 text-[13px] font-medium transition ${
        isGenerating
          ? 'animate-pulse border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
          : isActive
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
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l1.8 2H18.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
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


function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M20 12a8 8 0 0 0-8-8" stroke="#7c5af7" strokeWidth="2.5" strokeLinecap="round" />
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

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.6 1.6 0 0 1 0 2.3 1.6 1.6 0 0 1-2.3 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V19a1.6 1.6 0 0 1-1.6 1.6 1.6 1.6 0 0 1-1.6-1.6v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.6 1.6 0 0 1-2.3 0 1.6 1.6 0 0 1 0-2.3l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5a1.6 1.6 0 0 1-1.6-1.6A1.6 1.6 0 0 1 5 10.4h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.6 1.6 0 0 1 0-2.3 1.6 1.6 0 0 1 2.3 0l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V5A1.6 1.6 0 0 1 12 3.4 1.6 1.6 0 0 1 13.6 5v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.6 1.6 0 0 1 2.3 0 1.6 1.6 0 0 1 0 2.3l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6h.1A1.6 1.6 0 0 1 20 12a1.6 1.6 0 0 1-1.6 1.6h-.1a1 1 0 0 0-.9.6Z" />
    </svg>
  )
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
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
      return 'Context'
    case 'instruction':
      return 'Instruction'
    default:
      return 'Text'
  }
}

function collectDownstreamTextNodes(sourceNodeId: string, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  // Build adjacency: sourceId -> [targetId, ...]
  const adj = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adj.has(edge.sourceId)) adj.set(edge.sourceId, [])
    adj.get(edge.sourceId)!.push(edge.targetId)
  }
  // BFS to collect all downstream text nodes (excluding the source itself)
  const visited = new Set<string>()
  const queue = [sourceNodeId]
  visited.add(sourceNodeId)
  const textNodes: string[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const targetId of adj.get(current) ?? []) {
      if (visited.has(targetId)) continue
      visited.add(targetId)
      const target = nodeMap.get(targetId)
      if (target?.type === 'text') {
        textNodes.push(targetId)
        queue.push(targetId)
      }
    }
  }
  // Topological sort via Kahn's algorithm (respects upstream dependencies)
  const inDegree = new Map<string, number>()
  const subAdj = new Map<string, string[]>()
  const nodeSet = new Set(textNodes)
  for (const id of textNodes) { inDegree.set(id, 0); subAdj.set(id, []) }
  for (const edge of edges) {
    if (nodeSet.has(edge.sourceId) && nodeSet.has(edge.targetId)) {
      subAdj.get(edge.sourceId)!.push(edge.targetId)
      inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1)
    }
  }
  const sorted: string[] = []
  const ready = textNodes.filter((id) => inDegree.get(id) === 0)
  while (ready.length > 0) {
    const id = ready.shift()!
    sorted.push(id)
    for (const next of subAdj.get(id) ?? []) {
      const deg = (inDegree.get(next) ?? 1) - 1
      inDegree.set(next, deg)
      if (deg === 0) ready.push(next)
    }
  }
  return sorted
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
  if (type === 'context') return graphNode?.isLocal ? '#2e4f82' : '#1e3a6b'
  if (type === 'instruction') return graphNode?.isLocal ? '#6c3d63' : '#5b2d5d'
  return '#3f4150'
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
function RoundedSmoothStepEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, markerStart }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 40})
  return <BaseEdge path={path} style={style} markerEnd={markerEnd} markerStart={markerStart} />
}

const edgeTypes = { smoothstep: RoundedSmoothStepEdge }

function edgeStyleForHandle(handle: TextInputHandle | null) {
  if (handle === 'context') {
    return { strokeWidth: 2.6, stroke: '#6170d8', opacity: 0.84 }
  }
  if (handle === 'instruction') {
    return { strokeWidth: 2.6, stroke: '#a267c8', opacity: 0.84 }
  }
  return { strokeWidth: 4, stroke: '#6a728f', opacity: 0.84 }
}

export default App




