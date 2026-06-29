// IPC チャンネル名の定数。main / preload で共用。
export const IPC = {
  appPaths: 'app:paths',
  workspaceList: 'workspace:list',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  workspaceCreate: 'workspace:create',
  workspaceRename: 'workspace:rename',
  workspaceDelete: 'workspace:delete',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  llamaReleases: 'llama:releases',
  llamaInstall: 'llama:install',
  llamaInstallCancel: 'llama:install-cancel',
  llamaGetInstall: 'llama:get-install',
  llamaModels: 'llama:models',
  llamaStart: 'llama:start',
  llamaStop: 'llama:stop',
  llamaStatus: 'llama:status',
  llamaVisibility: 'llama:visibility',
  llamaDecompose: 'llama:decompose',
  dialogOpenImage: 'dialog:open-image',
  imageMetadata: 'image:metadata',
  imageDataUrl: 'image:dataurl',
  systemResources: 'system:resources',
  // main -> renderer events
  evtInstallProgress: 'llama:install-progress',
  evtServerStatus: 'llama:server-status'
} as const

export interface AppPaths {
  modelsDir: string
  dataDir: string
  runtimeDir: string
}
