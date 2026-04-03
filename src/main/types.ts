export type NodeType = 'text' | 'context' | 'instruction'
export type TextInputHandle = 'text' | 'context' | 'instruction'
export type NodeOutputHandle = 'output'

export interface ProjectRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface GenerationMeta {
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  tokensPerSecond: number | null
  durationSeconds: number | null
  finishReason: string | null
}

export interface GraphNodeRecord {
  id: string
  projectId: string
  type: NodeType
  title: string
  content: string
  instruction: string | null
  isLocal: boolean
  model: string | null
  isGenerated: boolean
  generationMeta: GenerationMeta | null
  createdAt: string
  updatedAt: string
  position: {
    x: number
    y: number
  }
  size: {
    width: number
    height: number
  }
}

export interface GraphEdgeRecord {
  id: string
  projectId: string
  sourceId: string
  targetId: string
  sourceHandle: NodeOutputHandle | null
  targetHandle: TextInputHandle | null
}

export interface ProjectSnapshot {
  project: ProjectRecord
  nodes: GraphNodeRecord[]
  edges: GraphEdgeRecord[]
}

export interface ModelOption {
  name: string
  path: string
  sizeBytes: number
}

export interface AppSettings {
  llamaBaseUrl: string
  llamaModelAlias: string
  selectedModelPath: string
  selectedModelName: string
  contextLength: number
  availableModels: ModelOption[]
  resolvedModelPath: string
  resolvedServerPath: string
}

export interface UiPreferences {
  contextLength: number
  isSidebarOpen: boolean
  isInspectorOpen: boolean
  isMiniMapVisible: boolean
  leftSidebarWidth: number
  rightInspectorWidth: number
  generalSections: {
    context: boolean
    interface: boolean
  }
}




