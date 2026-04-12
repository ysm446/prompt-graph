import type { AppSettings, GraphEdgeRecord, GraphNodeRecord, ProjectRecord, ProjectSnapshot, UiPreferences } from '../main/types'

export interface GraphChatApi {
  bootstrap(): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot; settings: AppSettings; uiPreferences: UiPreferences }>
  listModels(): Promise<AppSettings>
  selectModel(modelPath: string): Promise<{ settings: AppSettings }>
  ejectModel(): Promise<{ settings: AppSettings }>
  updateSettings(input: { contextLength?: number; temperature?: number }): Promise<{ settings: AppSettings }>
  savePreferences(input: Partial<UiPreferences>): Promise<{ uiPreferences: UiPreferences }>
  setProjectDirty(isDirty: boolean): Promise<{ ok: true }>
  createProject(name: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  renameProject(id: string, name: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  duplicateProject(id: string, newName: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  deleteProject(id: string): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  openProject(id: string): Promise<ProjectSnapshot>
  saveProjectSnapshot(snapshot: ProjectSnapshot): Promise<{ projects: ProjectRecord[]; snapshot: ProjectSnapshot }>
  createNode(input: {
    projectId: string
    type: 'text' | 'context' | 'instruction' | 'image'
    title?: string
    content?: string
    instruction?: string | null
    model?: string | null
    isGenerated?: boolean
    generationMeta?: GraphNodeRecord['generationMeta']
    position?: { x: number; y: number }
    size?: { width: number; height: number }
  }): Promise<{ node: GraphNodeRecord; snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  replaceImageNode(nodeId: string): Promise<{ canceled: boolean; node?: GraphNodeRecord; snapshot?: ProjectSnapshot; projects?: ProjectRecord[] }>
  duplicateImageAsset(nodeId: string, duplicatedNodeId: string): Promise<GraphNodeRecord['image']>
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
  createEdge(projectId: string, sourceId: string, targetId: string, sourceHandle: GraphEdgeRecord['sourceHandle'], targetHandle: GraphEdgeRecord['targetHandle']): Promise<{ snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  deleteEdge(id: string, projectId: string): Promise<{ snapshot: ProjectSnapshot; projects: ProjectRecord[] }>
  startGeneration(payload: { projectId: string; sourceNodeId: string; snapshot?: ProjectSnapshot }): Promise<{
    generationId: string
    targetNodeId: string
    snapshot: ProjectSnapshot
    projects: ProjectRecord[]
  }>
  stopGeneration(generationId: string): Promise<void>
  exportReader(name: string, content: string): Promise<{ saved: boolean; filePath?: string }>
  toImageDataUrl(filePath: string): string | null
  onGenerationDelta(callback: (payload: { generationId: string; nodeId: string; content: string }) => void): () => void
  onGenerationDone(callback: (payload: { generationId: string; nodeId: string; snapshot: ProjectSnapshot; projects: ProjectRecord[] }) => void): () => void
  onGenerationError(callback: (payload: { generationId: string; message: string; nodeId: string }) => void): () => void
  startProofread(proofreadId: string, text: string, systemPrompt?: string): Promise<void>
  stopProofread(proofreadId: string): Promise<void>
  onProofreadDelta(callback: (payload: { proofreadId: string; content: string }) => void): () => void
  onProofreadDone(callback: (payload: { proofreadId: string; content: string }) => void): () => void
  onProofreadError(callback: (payload: { proofreadId: string; message: string }) => void): () => void
  onPromptLog(callback: (payload: { generationId: string; nodeId: string; nodeTitle: string; systemPrompt: string; userMessage: string }) => void): () => void
  onSystemResources(callback: (payload: { cpuUsage: number; ramUsed: number; ramTotal: number; gpuUsage: number | null; vramUsed: number | null; vramTotal: number | null }) => void): () => void
}

declare global {
  interface Window {
    graphChat: GraphChatApi
  }
}



