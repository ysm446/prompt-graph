import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AppPaths } from '../shared/ipc'
import type { ImageMetadata, PromptGraphApi } from '../shared/api'
import type { ReferenceBuckets, SystemResources } from '../shared/types'
import type {
  AppSettings,
  LlamaInstall,
  LlamaInstallProgress,
  LlamaModel,
  LlamaRelease,
  LlamaReleaseVariant,
  LlamaServerStatus,
  ProjectSnapshot,
  WorkspaceMeta
} from '../shared/types'

const api: PromptGraphApi = {
  getPaths: (): Promise<AppPaths> => ipcRenderer.invoke(IPC.appPaths),

  listWorkspaces: (): Promise<WorkspaceMeta[]> => ipcRenderer.invoke(IPC.workspaceList),
  loadWorkspace: (id: string): Promise<ProjectSnapshot | null> =>
    ipcRenderer.invoke(IPC.workspaceLoad, id),
  saveWorkspace: (snapshot: ProjectSnapshot): Promise<void> =>
    ipcRenderer.invoke(IPC.workspaceSave, snapshot),
  createWorkspace: (name: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke(IPC.workspaceCreate, name),
  renameWorkspace: (id: string, name: string): Promise<void> =>
    ipcRenderer.invoke(IPC.workspaceRename, id, name),
  deleteWorkspace: (id: string): Promise<void> => ipcRenderer.invoke(IPC.workspaceDelete, id),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke(IPC.settingsSave, settings),

  fetchReleases: (limit?: number): Promise<LlamaRelease[]> =>
    ipcRenderer.invoke(IPC.llamaReleases, limit),
  getInstall: (): Promise<LlamaInstall | null> => ipcRenderer.invoke(IPC.llamaGetInstall),
  installVariant: (variant: LlamaReleaseVariant): Promise<LlamaInstall> =>
    ipcRenderer.invoke(IPC.llamaInstall, variant),
  cancelInstall: (): Promise<void> => ipcRenderer.invoke(IPC.llamaInstallCancel),

  listModels: (): Promise<LlamaModel[]> => ipcRenderer.invoke(IPC.llamaModels),
  startServer: (modelPath: string, mmprojPath: string | null): Promise<LlamaServerStatus> =>
    ipcRenderer.invoke(IPC.llamaStart, modelPath, mmprojPath),
  stopServer: (): Promise<void> => ipcRenderer.invoke(IPC.llamaStop),
  getServerStatus: (): Promise<LlamaServerStatus> => ipcRenderer.invoke(IPC.llamaStatus),
  visibilityFilter: (framing: string | null, tags: string[]): Promise<string[]> =>
    ipcRenderer.invoke(IPC.llamaVisibility, framing, tags),
  decompose: (positive: string): Promise<ReferenceBuckets> =>
    ipcRenderer.invoke(IPC.llamaDecompose, positive),
  openImageDialog: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogOpenImage),
  imageMetadata: (path: string): Promise<ImageMetadata> =>
    ipcRenderer.invoke(IPC.imageMetadata, path),
  getSystemResources: (): Promise<SystemResources> => ipcRenderer.invoke(IPC.systemResources),

  onInstallProgress: (cb: (p: LlamaInstallProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: LlamaInstallProgress): void => cb(p)
    ipcRenderer.on(IPC.evtInstallProgress, handler)
    return () => ipcRenderer.removeListener(IPC.evtInstallProgress, handler)
  },
  onServerStatus: (cb: (s: LlamaServerStatus) => void): (() => void) => {
    const handler = (_e: unknown, s: LlamaServerStatus): void => cb(s)
    ipcRenderer.on(IPC.evtServerStatus, handler)
    return () => ipcRenderer.removeListener(IPC.evtServerStatus, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
