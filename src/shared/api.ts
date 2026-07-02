// preload が公開する window.api の型契約。preload が実装し、renderer が参照する。
import type { AppPaths } from './ipc'
import type {
  AppSettings,
  ForgeInstall,
  ForgeInstallProgress,
  ForgeSdModel,
  ForgeServerStatus,
  ForgeTxt2ImgParams,
  ForgeTxt2ImgResult,
  LlamaInstall,
  LlamaInstallProgress,
  LlamaModel,
  LlamaRelease,
  LlamaReleaseVariant,
  LlamaServerStatus,
  ProjectSnapshot,
  ReferenceBuckets,
  SystemResources,
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
  reorderWorkspaces(ids: string[]): Promise<void>

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

  getForgeInstall(): Promise<ForgeInstall | null>
  installForge(): Promise<ForgeInstall>
  cancelForgeInstall(): Promise<void>
  startForge(): Promise<ForgeServerStatus>
  stopForge(): Promise<void>
  getForgeStatus(): Promise<ForgeServerStatus>
  forgeSdModels(): Promise<ForgeSdModel[]>
  forgeSamplers(): Promise<string[]>
  forgeTxt2img(params: ForgeTxt2ImgParams): Promise<ForgeTxt2ImgResult>

  openImageDialog(): Promise<string | null>
  imageMetadata(path: string): Promise<ImageMetadata>
  imageDataUrl(path: string): Promise<string>
  showItemInFolder(path: string): Promise<void>
  getSystemResources(): Promise<SystemResources>

  onInstallProgress(cb: (p: LlamaInstallProgress) => void): () => void
  onServerStatus(cb: (s: LlamaServerStatus) => void): () => void
  onForgeInstallProgress(cb: (p: ForgeInstallProgress) => void): () => void
  onForgeStatus(cb: (s: ForgeServerStatus) => void): () => void
}
