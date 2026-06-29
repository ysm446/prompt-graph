// llama-server プロセスの起動・停止・ヘルスチェック、モデル列挙。
// lm-graph (src/main/llamaServer.ts) を簡素化して流用。
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { basename, dirname, join } from 'node:path'
import type { LlamaModel, LlamaServerStatus } from '../shared/types'

const HOST = '127.0.0.1'

function parseQuant(name: string): string | null {
  const m = name.match(/(Q\d_[A-Z0-9_]+|Q\d|F16|F32|BF16|IQ\d[A-Z0-9_]*)/i)
  return m ? m[1].toUpperCase() : null
}

function parseParams(name: string): string | null {
  const m = name.match(/(\d+(?:\.\d+)?[BM])(?![A-Za-z])/i)
  return m ? m[1].toUpperCase() : null
}

/** modelsDir 配下を走査し GGUF モデルを列挙（mmproj は vision 投影として紐付け）。 */
export async function listModels(modelsDir: string): Promise<LlamaModel[]> {
  if (!existsSync(modelsDir)) return []
  const ggufFiles: string[] = []

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.gguf')) ggufFiles.push(full)
    }
  }
  await walk(modelsDir)

  const mmprojFiles = ggufFiles.filter((f) => basename(f).toLowerCase().includes('mmproj'))
  const modelFiles = ggufFiles.filter((f) => !basename(f).toLowerCase().includes('mmproj'))

  const models: LlamaModel[] = []
  for (const path of modelFiles) {
    const info = await stat(path)
    const fileName = basename(path)
    // 同フォルダの mmproj を vision 投影として紐付ける
    const mmprojPath = mmprojFiles.find((m) => dirname(m) === dirname(path)) ?? null
    models.push({
      fileName,
      path,
      sizeBytes: info.size,
      quant: parseQuant(fileName),
      params: parseParams(fileName),
      hasVision: mmprojPath !== null,
      mmprojPath
    })
  }
  models.sort((a, b) => a.fileName.localeCompare(b.fileName))
  return models
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, HOST)
  })
}

async function findAvailablePort(start = 8080, tries = 20): Promise<number> {
  for (let port = start; port < start + tries; port++) {
    if (await canListen(port)) return port
  }
  throw new Error('No available port found for llama-server')
}

async function isHealthy(baseUrl: string, signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal })
    return res.ok
  } catch {
    return false
  }
}

async function waitForHealthy(baseUrl: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isHealthy(baseUrl)) return
    await new Promise((r) => setTimeout(r, 700))
  }
  throw new Error('llama-server did not become healthy in time')
}

export interface StartOptions {
  serverPath: string // llama-server.exe
  modelPath: string
  mmprojPath?: string | null
  contextSize?: number
  gpuLayers?: number
}

export class LlamaServerManager {
  private child: ChildProcess | null = null
  private status: LlamaServerStatus = { state: 'stopped', baseUrl: null, modelPath: null, message: null }
  private onChange?: (status: LlamaServerStatus) => void

  setListener(fn: (status: LlamaServerStatus) => void): void {
    this.onChange = fn
  }

  getStatus(): LlamaServerStatus {
    return this.status
  }

  private update(patch: Partial<LlamaServerStatus>): void {
    this.status = { ...this.status, ...patch }
    this.onChange?.(this.status)
  }

  async start(opts: StartOptions): Promise<LlamaServerStatus> {
    await this.stop()
    if (!existsSync(opts.serverPath)) throw new Error(`llama-server が見つかりません: ${opts.serverPath}`)
    if (!existsSync(opts.modelPath)) throw new Error(`モデルが見つかりません: ${opts.modelPath}`)

    const port = await findAvailablePort()
    const baseUrl = `http://${HOST}:${port}`
    this.update({ state: 'starting', baseUrl, modelPath: opts.modelPath, message: null })

    const args = [
      '--host', HOST,
      '--port', String(port),
      '-m', opts.modelPath,
      '-c', String(opts.contextSize ?? 4096),
      '-ngl', String(opts.gpuLayers ?? 999),
      '--flash-attn', 'on'
    ]
    if (opts.mmprojPath) args.push('--mmproj', opts.mmprojPath)

    const child = spawn(opts.serverPath, args, { windowsHide: true })
    this.child = child
    child.stderr.on('data', () => {
      /* ログは将来ファイルへ。今は破棄 */
    })
    child.on('exit', (code) => {
      this.child = null
      if (this.status.state !== 'stopped') {
        this.update({
          state: code === 0 ? 'stopped' : 'error',
          message: code === 0 ? null : `llama-server exited with code ${code}`
        })
      }
    })

    try {
      await waitForHealthy(baseUrl)
      this.update({ state: 'running', message: null })
    } catch (e) {
      await this.stop()
      this.update({ state: 'error', message: (e as Error).message })
    }
    return this.status
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    if (!child || child.killed) {
      this.update({ state: 'stopped', baseUrl: null, message: null })
      return
    }
    child.kill()
    // Windows でぶら下がる場合は taskkill でフォールバック
    if (child.pid) {
      try {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
      } catch {
        /* noop */
      }
    }
    this.update({ state: 'stopped', baseUrl: null, message: null })
  }
}
