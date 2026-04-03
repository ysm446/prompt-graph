import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app } from 'electron'
import type { AppSettings } from './types'

const DEFAULT_PORT = 8080

export class LlamaServerManager {
  private process: ChildProcessWithoutNullStreams | null = null
  private readonly settings: AppSettings

  constructor() {
    this.settings = detectSettings()
  }

  getSettings(): AppSettings {
    return this.settings
  }

  async ensureRunning(): Promise<AppSettings> {
    if (await this.isHealthy()) {
      return this.settings
    }
    if (!this.process) {
      this.start()
    }
    await this.waitForHealthy()
    return this.settings
  }

  async stop(): Promise<void> {
    const proc = this.process
    this.process = null
    if (!proc || proc.killed) return
    proc.kill()
    await delay(400)
  }

  private start(): void {
    const { resolvedServerPath, resolvedModelPath } = this.settings
    this.process = spawn(
      resolvedServerPath,
      [
        '--host',
        '127.0.0.1',
        '--port',
        String(DEFAULT_PORT),
        '--model',
        resolvedModelPath,
        '--alias',
        this.settings.llamaModelAlias,
        '--ctx-size',
        '8192',
        '--n-gpu-layers',
        '999'
      ],
      {
        cwd: join(resolvedServerPath, '..'),
        windowsHide: true
      }
    )
    this.process.stdout.on('data', (data) => process.stdout.write(`[llama-server] ${data}`))
    this.process.stderr.on('data', (data) => process.stderr.write(`[llama-server] ${data}`))
    this.process.on('exit', () => {
      this.process = null
    })
  }

  private async waitForHealthy(): Promise<void> {
    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      if (await this.isHealthy()) return
      await delay(1_000)
    }
    throw new Error('llama.cpp server did not become ready within 90 seconds.')
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.settings.llamaBaseUrl}/health`)
      return response.ok
    } catch {
      return false
    }
  }
}

function detectSettings(): AppSettings {
  const rootDir = app.isPackaged ? process.cwd() : app.getAppPath()
  const serverDir = join(rootDir, 'bin', 'llama-server', 'llama-b8466-bin-win-cuda-13.1-x64')
  const serverPath = join(serverDir, 'llama-server.exe')
  const modelsDir = join(rootDir, 'models')
  const modelPath = findModelFile(modelsDir)
  accessSync(serverPath, constants.F_OK)
  return {
    llamaBaseUrl: `http://127.0.0.1:${DEFAULT_PORT}`,
    llamaModelAlias: 'qwen3.5-27b',
    resolvedModelPath: modelPath,
    resolvedServerPath: serverPath
  }
}

function findModelFile(modelsDir: string): string {
  if (!existsSync(modelsDir)) {
    throw new Error(`Models directory was not found: ${modelsDir}`)
  }
  const candidates = walkFiles(modelsDir).filter((file) => file.toLowerCase().endsWith('.gguf'))
  const preferred = candidates.find((file) => /qwen3\.5-27b-q6_k\.gguf$/i.test(file))
  const fallback = candidates.find((file) => !/mmproj/i.test(file))
  const modelPath = preferred ?? fallback
  if (!modelPath) {
    throw new Error('No GGUF model file was found in models/.')
  }
  return modelPath
}

function walkFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
    } else {
      files.push(fullPath)
    }
  }
  return files
}
