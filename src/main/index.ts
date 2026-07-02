import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC, type AppPaths } from '../shared/ipc'
import type {
  AppSettings,
  ForgeInstallProgress,
  ForgeTxt2ImgParams,
  LlamaInstallProgress,
  LlamaReleaseVariant,
  ProjectSnapshot
} from '../shared/types'
import { fetchLlamaReleases, installLlamaVariant } from './llamaInstaller'
import { cloneForge, isForgeCloned } from './forgeInstaller'
import { ForgeServerManager } from './forgeServer'
import { listSamplers, listSdModels, txt2img } from './forgeClient'
import { runDecompose, runVisibilityFilter } from './llamaClient'
import { LlamaServerManager, listModels } from './llamaServer'
import { readImageDataUrl, readImageMetadata } from './pngMeta'
import { getResources } from './systemInfo'
import { Store } from './store'

// 開発時はリポジトリ直下、パッケージ時は userData を基準にする
const ROOT = app.isPackaged ? app.getPath('userData') : process.cwd()
const PATHS: AppPaths = {
  modelsDir: join(process.cwd(), 'models'), // モデルは常にリポジトリの models/ を参照
  dataDir: join(ROOT, 'data'),
  runtimeDir: join(ROOT, 'runtime', 'llama-server'),
  forgeDir: join(ROOT, 'runtime', 'stable-diffusion-webui-forge')
}

const store = new Store(PATHS.dataDir)
const server = new LlamaServerManager()
const forge = new ForgeServerManager()
let installAbort: AbortController | null = null
let forgeInstallAbort: AbortController | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    useContentSize: true, // width/height を（フレーム込みでなく）コンテンツ領域基準にする
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

  forge.setListener((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC.evtForgeStatus, status)
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

  ipcMain.handle(IPC.llamaVisibility, async (_e, framing: string | null, tags: string[]) => {
    const status = server.getStatus()
    if (status.state !== 'running' || !status.baseUrl) {
      throw new Error('モデルがロードされていません')
    }
    const settings = await store.getSettings()
    return runVisibilityFilter(status.baseUrl, framing, tags, settings.visibilityPrompt)
  })

  ipcMain.handle(IPC.llamaDecompose, (_e, positive: string) => {
    const status = server.getStatus()
    if (status.state !== 'running' || !status.baseUrl) {
      throw new Error('モデルがロードされていません')
    }
    return runDecompose(status.baseUrl, positive)
  })

  // --- WebUI Forge ---
  ipcMain.handle(IPC.forgeGetInstall, async () => {
    const install = await store.getForgeInstall()
    // 記録があっても実体（webui.bat）が無ければ未インストール扱い。
    if (install && !isForgeCloned(install.path)) return null
    if (!install && isForgeCloned(PATHS.forgeDir)) {
      // 手動配置などで記録が無い場合は補完する。
      const rec = { path: PATHS.forgeDir, clonedAt: new Date().toISOString() }
      await store.saveForgeInstall(rec)
      return rec
    }
    return install
  })

  ipcMain.handle(IPC.forgeInstall, async (e) => {
    forgeInstallAbort?.abort()
    forgeInstallAbort = new AbortController()
    const onProgress = (p: ForgeInstallProgress): void => {
      e.sender.send(IPC.evtForgeInstallProgress, p)
    }
    try {
      const result = await cloneForge({
        forgeDir: PATHS.forgeDir,
        onProgress,
        signal: forgeInstallAbort.signal
      })
      const install = { path: result.path, clonedAt: new Date().toISOString() }
      await store.saveForgeInstall(install)
      return install
    } catch (err) {
      onProgress({ phase: 'error', message: (err as Error).message })
      throw err
    } finally {
      forgeInstallAbort = null
    }
  })

  ipcMain.handle(IPC.forgeInstallCancel, () => {
    forgeInstallAbort?.abort()
    forgeInstallAbort = null
  })

  ipcMain.handle(IPC.forgeStart, async () => {
    const install = await store.getForgeInstall()
    const forgeDir = install?.path ?? PATHS.forgeDir
    if (!isForgeCloned(forgeDir)) throw new Error('WebUI Forge がインストールされていません')
    const settings = await store.getSettings()
    return forge.start({
      forgeDir,
      host: settings.forgeHost,
      port: settings.forgePort,
      logPath: join(PATHS.dataDir, 'forge_server.log'),
      pythonPath: settings.forgePython
    })
  })

  ipcMain.handle(IPC.forgeStop, () => forge.stop())
  ipcMain.handle(IPC.forgeStatus, () => forge.getStatus())

  const forgeBaseUrl = (): string => {
    const status = forge.getStatus()
    if (status.state !== 'running' || !status.url) {
      throw new Error('WebUI Forge が稼働していません')
    }
    return status.url
  }

  ipcMain.handle(IPC.forgeSdModels, () => listSdModels(forgeBaseUrl()))
  ipcMain.handle(IPC.forgeSamplers, () => listSamplers(forgeBaseUrl()))
  ipcMain.handle(IPC.forgeTxt2img, (_e, params: ForgeTxt2ImgParams) =>
    txt2img(forgeBaseUrl(), params)
  )

  ipcMain.handle(IPC.dialogOpenImage, async () => {
    const opts = {
      title: '参照画像を選択',
      properties: ['openFile' as const],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, opts)
      : await dialog.showOpenDialog(opts)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.imageMetadata, (_e, path: string) => readImageMetadata(path))
  ipcMain.handle(IPC.imageDataUrl, (_e, path: string) => readImageDataUrl(path))

  ipcMain.handle(IPC.systemResources, () => getResources())
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
  forge.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  server.stop()
  forge.stop()
})

// 外部リンクは既定ブラウザで開く
app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
})
