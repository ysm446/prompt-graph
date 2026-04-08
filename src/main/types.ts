export type NodeType = 'text' | 'context' | 'instruction' | 'image'
export type NodeInputHandle = 'text' | 'context' | 'instruction' | 'image'
export type NodeOutputHandle = 'output'
export type TextStyleTarget = 'both' | 'title' | 'content'
export type TextStylePreset = 'standard' | 'business' | 'reading' | 'dense'
export type ProofreadPreset = 'light' | 'standard' | 'aggressive' | 'custom'

export interface ImageAsset {
  path: string
  thumbnailPath: string | null
  thumbnailDataUrl: string | null
  originalName: string
  mimeType: string | null
  width: number | null
  height: number | null
}

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
  image: ImageAsset | null
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
  targetHandle: NodeInputHandle | null
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
  temperature: number
  availableModels: ModelOption[]
  resolvedModelPath: string
  resolvedMmprojPath: string | null
  resolvedServerPath: string
  supportsVision: boolean
}

export interface UiPreferences {
  contextLength: number
  temperature: number
  isSidebarOpen: boolean
  isInspectorOpen: boolean
  isSettingsPanelOpen: boolean
  isPropertiesPanelOpen: boolean
  isMiniMapVisible: boolean
  isSnapToGridEnabled: boolean
  edgeType: 'default' | 'smoothstep' | 'step'
  isProofreadEnabled: boolean
  proofreadPreset: ProofreadPreset
  proofreadSystemPrompt: string
  leftSidebarWidth: number
  rightInspectorWidth: number
  nodeFontSize: number
  textStyleTarget: TextStyleTarget
  textStylePreset: TextStylePreset
  titleTextStylePreset: TextStylePreset
  contentTextStylePreset: TextStylePreset
  titleFontSize: number
  contentFontSize: number
  isPromptLogEnabled: boolean
  generalSections: {
    context: boolean
    interface: boolean
    textStyle: boolean
    editing: boolean
    debug: boolean
  }
  lastUsedModelPath: string | null
  projectViewports: Record<string, { x: number; y: number; zoom: number }>
}




