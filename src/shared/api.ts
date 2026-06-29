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
  ProjectSnapshot
} from './types'

export interface PromptGraphApi {
  getPaths(): Promise<AppPaths>

  loadProject(): Promise<ProjectSnapshot | null>
  saveProject(snapshot: ProjectSnapshot): Promise<void>

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

  onInstallProgress(cb: (p: LlamaInstallProgress) => void): () => void
  onServerStatus(cb: (s: LlamaServerStatus) => void): () => void
}
