// preload が公開する window.api の型契約。preload が実装し、renderer が参照する。
import type { AppPaths } from './ipc'
import type {
  AppSettings,
  LlamaInstall,
  LlamaInstallProgress,
  LlamaModel,
  LlamaRelease,
  LlamaReleaseVariant,
  LlamaServerStatus,
  ProjectSnapshot,
  ReferenceBuckets,
  WorkspaceMeta
} from './types'

export interface ImageMetadata {
  positive: string
  negative: string
  settings: string
  raw: string
}

export interface PromptGraphApi {
  getPaths(): Promise<AppPaths>

  listWorkspaces(): Promise<WorkspaceMeta[]>
  loadWorkspace(id: string): Promise<ProjectSnapshot | null>
  saveWorkspace(snapshot: ProjectSnapshot): Promise<void>
  createWorkspace(name: string): Promise<ProjectSnapshot>
  renameWorkspace(id: string, name: string): Promise<void>
  deleteWorkspace(id: string): Promise<void>

  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>

  fetchReleases(limit?: number): Promise<LlamaRelease[]>
  getInstall(): Promise<LlamaInstall | null>
  installVariant(variant: LlamaReleaseVariant): Promise<LlamaInstall>
  cancelInstall(): Promise<void>

  listModels(): Promise<LlamaModel[]>
  startServer(modelPath: string, mmprojPath: string | null): Promise<LlamaServerStatus>
  stopServer(): Promise<void>
  getServerStatus(): Promise<LlamaServerStatus>
  visibilityFilter(framing: string | null, tags: string[]): Promise<string[]>
  decompose(positive: string): Promise<ReferenceBuckets>
  openImageDialog(): Promise<string | null>
  imageMetadata(path: string): Promise<ImageMetadata>

  onInstallProgress(cb: (p: LlamaInstallProgress) => void): () => void
  onServerStatus(cb: (s: LlamaServerStatus) => void): () => void
}
