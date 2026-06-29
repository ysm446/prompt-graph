// IPC チャンネル名の定数。main / preload で共用。
export const IPC = {
  appPaths: 'app:paths',
  projectLoad: 'project:load',
  projectSave: 'project:save',
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
  // main -> renderer events
  evtInstallProgress: 'llama:install-progress',
  evtServerStatus: 'llama:server-status'
} as const

export interface AppPaths {
  modelsDir: string
  dataDir: string
  runtimeDir: string
}
