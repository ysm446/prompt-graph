import type { AppSettings, GraphNodeRecord, ProjectRecord, ProjectSnapshot } from '../main/types'

export interface GraphChatApi {
  bootstrap(): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot; settings: AppSettings }>
  listModels(): Promise<AppSettings>
  selectModel(modelPath: string): Promise<{ settings: AppSettings }>
  ejectModel(): Promise<{ settings: AppSettings }>
  updateSettings(input: { contextLength?: number }): Promise<{ settings: AppSettings }>
  createProject(name: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  renameProject(id: string, name: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  deleteProject(id: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  openProject(id: string): Promise<ProjectSnapshot>
  createNode(input: {
    projectId: string
    type: 'text' | 'context' | 'instruction'
    title?: string
    content?: string
    instruction?: string | null
    model?: string | null
    isGenerated?: boolean
    generationMeta?: GraphNodeRecord['generationMeta']
    position?: { x: number; y: number }
    size?: { width: number; height: number }
  }): Promise<{ node: GraphNodeRecord; snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  updateNode(input: {
    id: string
    title?: string
    content?: string
    instruction?: string | null
    position?: { x: number; y: number }
    size?: { width: number; height: number }
    model?: string | null
    isGenerated?: boolean
    generationMeta?: GraphNodeRecord['generationMeta']
  }): Promise<GraphNodeRecord>
  deleteNode(id: string): Promise<{ snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  createEdge(projectId: string, sourceId: string, targetId: string): Promise<{ snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  deleteEdge(id: string, projectId: string): Promise<{ snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  startGeneration(payload: { projectId: string; sourceNodeId: string }): Promise<{
    generationId: string
    targetNodeId: string
    snapshot: ProjectSnapshot
    projects: ProjectRecord[]
  }>
  stopGeneration(generationId: string): Promise<void>
  exportReader(name: string, content: string): Promise<{ saved: boolean; filePath?: string }>
  onGenerationDelta(callback: (payload: { generationId: string; nodeId: string; content: string }) => void): () => void
  onGenerationDone(callback: (payload: { generationId: string; nodeId: string; snapshot: ProjectSnapshot; projects: ProjectRecord[] }) => void): () => void
  onGenerationError(callback: (payload: { generationId: string; message: string; nodeId: string }) => void): () => void
}

declare global {
  interface Window {
    graphChat: GraphChatApi
  }
}

