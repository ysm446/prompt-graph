import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { IPC, type AppPaths } from '../shared/ipc'
import type {
  AppSettings,
  LlamaInstallProgress,
  LlamaReleaseVariant,
  ProjectSnapshot
} from '../shared/types'
import { fetchLlamaReleases, installLlamaVariant } from './llamaInstaller'
import { runVisibilityFilter } from './llamaClient'
import { LlamaServerManager, listModels } from './llamaServer'
import { Store } from './store'

// 開発時はリポジトリ直下、パッケージ時は userData を基準にする
const ROOT = app.isPackaged ? app.getPath('userData') : process.cwd()
const PATHS: AppPaths = {
  modelsDir: join(process.cwd(), 'models'), // モデルは常にリポジトリの models/ を参照
  dataDir: join(ROOT, 'data'),
  runtimeDir: join(ROOT, 'bin', 'llama-runtime')
}

const store = new Store(PATHS.dataDir)
const server = new LlamaServerManager()
let installAbort: AbortController | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  server.setListener((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.evtServerStatus, status)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.appPaths, (): AppPaths => PATHS)

  ipcMain.handle(IPC.workspaceList, () => store.listWorkspaces())
  ipcMain.handle(IPC.workspaceLoad, (_e, id: string) => store.loadWorkspace(id))
  ipcMain.handle(IPC.workspaceSave, (_e, snapshot: ProjectSnapshot) => store.saveWorkspace(snapshot))
  ipcMain.handle(IPC.workspaceCreate, (_e, name: string) => store.createWorkspace(name))
  ipcMain.handle(IPC.workspaceRename, (_e, id: string, name: string) =>
    store.renameWorkspace(id, name)
  )
  ipcMain.handle(IPC.workspaceDelete, (_e, id: string) => store.deleteWorkspace(id))

  ipcMain.handle(IPC.settingsGet, () => store.getSettings())
  ipcMain.handle(IPC.settingsSave, (_e, settings: AppSettings) => store.saveSettings(settings))

  ipcMain.handle(IPC.llamaReleases, (_e, limit?: number) => fetchLlamaReleases(limit ?? 8))

  ipcMain.handle(IPC.llamaGetInstall, () => store.getLlamaInstall())

  ipcMain.handle(IPC.llamaInstall, async (e, variant: LlamaReleaseVariant) => {
    installAbort?.abort()
    installAbort = new AbortController()
    const onProgress = (p: LlamaInstallProgress): void => {
      e.sender.send(IPC.evtInstallProgress, p)
    }
    try {
      const result = await installLlamaVariant({
        runtimeDir: PATHS.runtimeDir,
        variant,
        onProgress,
        signal: installAbort.signal
      })
      const install = { ...result, installedAt: new Date().toISOString() }
      await store.saveLlamaInstall(install)
      return install
    } catch (err) {
      const message = (err as Error).message
      onProgress({ phase: 'error', message })
      throw err
    } finally {
      installAbort = null
    }
  })

  ipcMain.handle(IPC.llamaInstallCancel, () => {
    installAbort?.abort()
    installAbort = null
  })

  ipcMain.handle(IPC.llamaModels, () => listModels(PATHS.modelsDir))

  ipcMain.handle(IPC.llamaStart, async (_e, modelPath: string, mmprojPath: string | null) => {
    const install = await store.getLlamaInstall()
    if (!install) throw new Error('llama.cpp がインストールされていません')
    const settings = await store.getSettings()
    return server.start({
      serverPath: install.path,
      modelPath,
      mmprojPath,
      contextSize: settings.contextSize
    })
  })

  ipcMain.handle(IPC.llamaStop, () => server.stop())
  ipcMain.handle(IPC.llamaStatus, () => server.getStatus())

  ipcMain.handle(IPC.llamaVisibility, (_e, framing: string | null, tags: string[]) => {
    const status = server.getStatus()
    if (status.state !== 'running' || !status.baseUrl) {
      throw new Error('モデルがロードされていません')
    }
    return runVisibilityFilter(status.baseUrl, framing, tags)
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  server.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  server.stop()
})

// 外部リンクは既定ブラウザで開く
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
