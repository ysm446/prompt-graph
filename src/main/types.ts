export type NodeType = 'text' | 'context' | 'instruction'

export interface ProjectRecord {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface GraphNodeRecord {
  id: string
  projectId: string
  type: NodeType
  title: string
  content: string
  instruction: string | null
  model: string | null
  isGenerated: boolean
  createdAt: string
  updatedAt: string
  position: {
    x: number
    y: number
  }
}

export interface GraphEdgeRecord {
  id: string
  projectId: string
  sourceId: string
  targetId: string
}

export interface ProjectSnapshot {
  project: ProjectRecord
  nodes: GraphNodeRecord[]
  edges: GraphEdgeRecord[]
}

export interface AppSettings {
  llamaBaseUrl: string
  llamaModelAlias: string
  resolvedModelPath: string
  resolvedServerPath: string
}
