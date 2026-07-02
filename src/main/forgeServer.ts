// WebUI Forge プロセスの起動・停止・ヘルスチェック。
// image-assistant の sd_process.py を TS へ移植（webui.bat を起動し HTTP readiness を待つ）。
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, openSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ForgeServerStatus } from '../shared/types'

function run(cmd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout) => {
      resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout: String(stdout) })
    })
  })
}

// py ランチャで指定タグの python 実体パスを取得する。
async function pyExecutable(tagArgs: string[]): Promise<string | null> {
  const r = await run('py', [...tagArgs, '-c', 'import sys;print(sys.executable)'])
  const out = r.stdout.trim()
  return r.code === 0 && out ? out : null
}

// Forge が要求する Python 3.10 の実行ファイルを探す。
// PATH の python は Windows Store のダミーのことがあるため py ランチャ経由で解決する。
export async function resolvePython310(): Promise<string | null> {
  // 1) 標準タグ
  for (const args of [['-3.10'], ['-3.10-64']]) {
    const exe = await pyExecutable(args)
    if (exe) return exe
  }
  // 2) py --list を解析して 3.10 系タグ（例: Astral/CPython3.10.18）を拾う
  const list = await run('py', ['--list'])
  for (const line of list.stdout.split(/\r?\n/)) {
    if (!/3\.10/.test(line)) continue
    const m = line.match(/-V:(\S+)/)
    if (!m) continue
    const exe = await pyExecutable([`-V:${m[1]}`])
    if (exe) return exe
  }
  return null
}

// 前セッションの取りこぼし（dev の強制終了等）で残った、この forgeDir 配下の
// Forge プロセスを掃除する。他アプリ（別パス）の Forge は対象外。
// これをしないと start() が孤児に isHttpReady でアタッチし、古い stdio のまま
// txt2img が OSError(Errno 22) になる。
async function killStaleForge(forgeDir: string): Promise<void> {
  const ps =
    `Get-CimInstance Win32_Process | ` +
    `Where-Object { $_.CommandLine -like '*${forgeDir.replace(/'/g, "''")}*' } | ` +
    `ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>$null }`
  await new Promise<void>((resolve) => {
    try {
      const cp = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
        windowsHide: true
      })
      const timer = setTimeout(() => {
        cp.kill()
        resolve()
      }, 8000)
      cp.on('error', () => {
        clearTimeout(timer)
        resolve()
      })
      cp.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    } catch {
      resolve()
    }
  })
}

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
  pythonPath?: string // 設定で明示指定された Python（空なら自動検出）
}

export class ForgeServerManager {
  private child: ChildProcess | null = null
  private logFd: number | null = null
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

    // 前セッションの孤児 Forge を掃除してから起動（古い stdio へのアタッチを防ぐ）。
    await killStaleForge(opts.forgeDir)

    const url = `http://${opts.host}:${opts.port}`
    // 掃除後もまだ応答するなら、別アプリ管理の外部 Forge とみなして再利用する。
    if (await isHttpReady(url)) {
      this.update({ state: 'running', url, message: null })
      return this.status
    }

    this.update({ state: 'starting', url, message: null })

    const env = { ...process.env }
    // Electron 由来のフラグが webui.bat の python 判定を邪魔しないよう除去。
    delete env.ELECTRON_RUN_AS_NODE
    delete env.VIRTUAL_ENV
    // Forge の venv があれば最優先。無ければ Python 3.10 を明示指定する
    // （PATH の python は Windows Store のダミーで失敗するため）。
    const forgeVenvPython = join(opts.forgeDir, 'venv', 'Scripts', 'python.exe')
    if (existsSync(forgeVenvPython)) {
      env.VENV_DIR = join(opts.forgeDir, 'venv')
      env.PYTHON = forgeVenvPython
    } else {
      const python = opts.pythonPath?.trim() || (await resolvePython310())
      if (!python) {
        this.closeLog()
        this.update({ state: 'stopped', url: null, message: null })
        throw new Error(
          'Python 3.10 が見つかりません。Python 3.10 をインストールするか、設定で Python パスを指定してください。'
        )
      }
      env.PYTHON = python
    }
    env.TORCH_INDEX_URL ??= 'https://download.pytorch.org/whl/cu128'
    env.TORCH_COMMAND ??=
      'pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128'
    env.PYTHONUNBUFFERED = '1' // ログを即時フラッシュ

    // setuptools 81 で pkg_resources が削除され、CLIP 等の古い setup.py が
    // ビルドできなくなるため、ビルド時 setuptools を 81 未満に固定する。
    // （PIP_CONSTRAINT は分離ビルドの依存にも適用される）
    if (!env.PIP_CONSTRAINT) {
      const constraintFile = join(dirname(opts.logPath), 'pip-constraints.txt')
      try {
        writeFileSync(constraintFile, 'setuptools<81\n', 'utf-8')
        env.PIP_CONSTRAINT = constraintFile
      } catch {
        /* 書けなくても致命ではない */
      }
    }

    const args = [
      '/c',
      webuiBat,
      '--server-name',
      opts.host,
      '--port',
      String(opts.port),
      '--api' // REST(/sdapi) の有無を Phase C で実測できるよう有効化
    ]

    // 子の stdout/stderr は「実ファイルの fd」に直接向ける（パイプにしない）。
    // パイプ経由だと Windows で Forge の進捗出力が OSError(Errno 22) を誘発するため。
    // stdin は 'ignore'（EOF）にして webui.bat の `pause` が即抜けるようにする。
    this.logFd = openSync(opts.logPath, 'w')
    const child = spawn('cmd.exe', args, {
      cwd: opts.forgeDir,
      windowsHide: true,
      env,
      stdio: ['ignore', this.logFd, this.logFd]
    })
    this.child = child
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
    if (this.logFd !== null) {
      try {
        closeSync(this.logFd)
      } catch {
        /* 既に閉じている場合など */
      }
      this.logFd = null
    }
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
