// WebUI Forge プロセスの起動・停止・ヘルスチェック。
// image-assistant の sd_process.py を TS へ移植（webui.bat を起動し HTTP readiness を待つ）。
import { spawn, type ChildProcess } from 'node:child_process'
import { createWriteStream, existsSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { ForgeServerStatus } from '../shared/types'

// 初回起動は venv 構築・torch DL が走るため非常に長い（分単位）。
const READY_TIMEOUT_MS = 20 * 60 * 1000
const POLL_INTERVAL_MS = 2000

async function isHttpReady(url: string, signal?: AbortSignal): Promise<boolean> {
  try {
    // Forge 2 は /config（gradio）を返す。ルートでも 200 になる。
    const res = await fetch(`${url}/config`, { signal })
    return res.ok
  } catch {
    return false
  }
}

export interface ForgeStartOptions {
  forgeDir: string
  host: string
  port: number
  logPath: string
}

export class ForgeServerManager {
  private child: ChildProcess | null = null
  private logFh: WriteStream | null = null
  private readyAbort: AbortController | null = null
  private status: ForgeServerStatus = { state: 'stopped', url: null, message: null }
  private onChange?: (status: ForgeServerStatus) => void

  setListener(fn: (status: ForgeServerStatus) => void): void {
    this.onChange = fn
  }

  getStatus(): ForgeServerStatus {
    return this.status
  }

  private update(patch: Partial<ForgeServerStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onChange?.(this.status)
  }

  // 起動はブロックせず、readiness はバックグラウンドでポーリングして状態を更新する
  // （初回は数分〜十数分かかるため）。
  async start(opts: ForgeStartOptions): Promise<ForgeServerStatus> {
    await this.stop()

    const webuiBat = join(opts.forgeDir, 'webui.bat')
    if (!existsSync(webuiBat)) {
      throw new Error(`webui.bat が見つかりません: ${opts.forgeDir}`)
    }

    const url = `http://${opts.host}:${opts.port}`
    // 既に外部/前回のプロセスが応答するなら running 扱い。
    if (await isHttpReady(url)) {
      this.update({ state: 'running', url, message: null })
      return this.status
    }

    this.update({ state: 'starting', url, message: null })

    const env = { ...process.env }
    // Electron 由来のフラグが webui.bat の python 判定を邪魔しないよう除去。
    delete env.ELECTRON_RUN_AS_NODE
    delete env.VIRTUAL_ENV
    // Forge の venv があれば優先。無ければ py ランチャに委ねる。
    const forgeVenvPython = join(opts.forgeDir, 'venv', 'Scripts', 'python.exe')
    if (existsSync(forgeVenvPython)) {
      env.VENV_DIR = join(opts.forgeDir, 'venv')
      env.PYTHON = forgeVenvPython
    }
    env.TORCH_INDEX_URL ??= 'https://download.pytorch.org/whl/cu128'
    env.TORCH_COMMAND ??=
      'pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128'

    const args = [
      '/c',
      webuiBat,
      '--server-name',
      opts.host,
      '--port',
      String(opts.port),
      '--api' // REST(/sdapi) の有無を Phase C で実測できるよう有効化
    ]

    this.logFh = createWriteStream(opts.logPath, { flags: 'w' })
    const child = spawn('cmd.exe', args, {
      cwd: opts.forgeDir,
      windowsHide: true,
      env
    })
    this.child = child
    child.stdout?.on('data', (d) => this.logFh?.write(d))
    child.stderr?.on('data', (d) => this.logFh?.write(d))
    child.on('exit', (code) => {
      this.child = null
      this.closeLog()
      this.readyAbort?.abort()
      if (this.status.state === 'starting' || this.status.state === 'running') {
        this.update({
          state: code === 0 ? 'stopped' : 'error',
          url: code === 0 ? null : this.status.url,
          message: code === 0 ? null : `Forge が終了しました (code ${code})。ログ: ${opts.logPath}`
        })
      }
    })

    void this.pollReady(url)
    return this.status
  }

  private async pollReady(url: string): Promise<void> {
    this.readyAbort?.abort()
    const ac = new AbortController()
    this.readyAbort = ac
    const start = Date.now()
    while (Date.now() - start < READY_TIMEOUT_MS) {
      if (ac.signal.aborted) return
      // プロセスが落ちていたら exit ハンドラ側で状態更新済み。
      if (!this.child) return
      if (await isHttpReady(url, ac.signal)) {
        if (!ac.signal.aborted) this.update({ state: 'running', url, message: null })
        return
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }
    if (!ac.signal.aborted && this.status.state === 'starting') {
      this.update({ state: 'error', message: 'Forge の起動がタイムアウトしました。' })
    }
  }

  private closeLog(): void {
    this.logFh?.end()
    this.logFh = null
  }

  async stop(): Promise<void> {
    this.readyAbort?.abort()
    this.readyAbort = null
    const child = this.child
    this.child = null
    this.closeLog()
    if (child && !child.killed) {
      child.kill()
      if (child.pid) {
        try {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
        } catch {
          /* noop */
        }
      }
    }
    this.update({ state: 'stopped', url: null, message: null })
  }
}
