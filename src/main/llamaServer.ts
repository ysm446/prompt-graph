import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, join, relative, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { app } from 'electron'
import type { AppSettings, ModelOption } from './types'

const DEFAULT_PORT = 8080
const DEFAULT_CONTEXT_LENGTH = 32768
const DEFAULT_TEMPERATURE = 0.8

export class LlamaServerManager {
  private process: ChildProcessWithoutNullStreams | null = null
  private readonly rootDir: string
  private readonly serverPath: string
  private readonly modelsDir: string
  private port = DEFAULT_PORT
  private settings: AppSettings

  constructor() {
    this.rootDir = app.isPackaged ? process.cwd() : app.getAppPath()
    this.serverPath = join(this.rootDir, 'bin', 'llama-server', 'llama-b8648-bin-win-cuda-13.1-x64', 'llama-server.exe')
    this.modelsDir = join(this.rootDir, 'models')
    this.settings = this.buildSettings(findDefaultModel(this.listModels()))
  }

  getSettings(): AppSettings {
    return {
      ...this.settings,
      availableModels: [...this.settings.availableModels]
    }
  }

  listModels(): ModelOption[] {
    if (!existsSync(this.modelsDir)) {
      throw new Error(`Models directory was not found: ${this.modelsDir}`)
    }
    const candidates = walkFiles(this.modelsDir)
      .filter((file) => file.toLowerCase().endsWith('.gguf'))
      .filter((file) => !/mmproj/i.test(file))
      .map((file) => ({
        path: file,
        name: relative(this.modelsDir, file).replace(/\\/g, '/'),
        sizeBytes: statSync(file).size
      }))
      .sort((left, right) => left.name.localeCompare(right.name))

    if (candidates.length === 0) {
      throw new Error('No GGUF model file was found in models/.')
    }
    return candidates
  }

  async selectModel(modelPath: string): Promise<AppSettings> {
    const resolvedPath = resolve(modelPath)
    const availableModels = this.listModels()
    const selected = availableModels.find((model) => resolve(model.path) === resolvedPath)
    if (!selected) {
      throw new Error('Selected model was not found in models/.')
    }

    const shouldRestart = this.process !== null
    if (shouldRestart) {
      await this.stop()
    }
    this.settings = this.buildSettings(selected, availableModels)
    await this.ensureRunning()
    return this.getSettings()
  }

  async updateSettings(input: { contextLength?: number; temperature?: number }): Promise<AppSettings> {
    const nextContextLength = input.contextLength ?? this.settings.contextLength
    const nextTemperature = input.temperature ?? this.settings.temperature
    const currentModel = this.listModels().find((model) => resolve(model.path) === resolve(this.settings.selectedModelPath))
    if (!currentModel) {
      throw new Error('Selected model was not found in models/.')
    }

    const changed = nextContextLength !== this.settings.contextLength
    if (changed && this.process) {
      await this.stop()
    }

    this.settings = this.buildSettings(currentModel, this.listModels(), nextContextLength, nextTemperature)
    return this.getSettings()
  }

  async ensureRunning(): Promise<AppSettings> {
    await this.ensureAvailablePort()
    if (await this.isHealthy()) {
      return this.getSettings()
    }
    if (!this.process) {
      this.start()
    }
    await this.waitForHealthy()
    return this.getSettings()
  }

  async stop(): Promise<void> {
    const proc = this.process
    this.process = null
    if (!proc) return
    if (proc.killed || proc.exitCode !== null) return

    proc.kill()
    const exited = await waitForProcessExit(proc, 5_000)
    if (exited || !proc.pid) return

    const killer = spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true })
    await new Promise<void>((resolve) => {
      killer.once('exit', () => resolve())
      killer.once('error', () => resolve())
    })
    await waitForProcessExit(proc, 2_000)
  }

  private buildSettings(selectedModel: ModelOption, availableModels = this.listModels(), contextLength = this.settings?.contextLength ?? DEFAULT_CONTEXT_LENGTH, temperature = this.settings?.temperature ?? DEFAULT_TEMPERATURE): AppSettings {
    accessSync(this.serverPath, constants.F_OK)
    return {
      llamaBaseUrl: `http://127.0.0.1:${this.port}`,
      llamaModelAlias: toModelAlias(selectedModel.name),
      selectedModelPath: selectedModel.path,
      selectedModelName: selectedModel.name,
      contextLength,
      temperature,
      availableModels,
      resolvedModelPath: selectedModel.path,
      resolvedServerPath: this.serverPath
    }
  }

  private start(): void {
    const { resolvedServerPath, resolvedModelPath, llamaModelAlias } = this.settings
    this.process = spawn(
      resolvedServerPath,
      [
        '--host',
        '127.0.0.1',
        '--port',
        String(this.port),
        '--model',
        resolvedModelPath,
        '--alias',
        llamaModelAlias,
        '--ctx-size',
        String(this.settings.contextLength),
        '--flash-attn',
        'on',
        '--reasoning',
        'off',
        '--reasoning-format',
        'none',
        '--chat-template-kwargs',
        '{"thinking":false}',
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

  private async ensureAvailablePort(): Promise<void> {
    if (this.process) return
    const availablePort = await findAvailablePort(DEFAULT_PORT)
    if (availablePort === this.port) return
    this.port = availablePort
    const currentModel = this.listModels().find((model) => resolve(model.path) === resolve(this.settings.selectedModelPath))
    if (!currentModel) {
      throw new Error('Selected model was not found in models/.')
    }
    this.settings = this.buildSettings(currentModel, this.listModels(), this.settings.contextLength, this.settings.temperature)
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

async function findAvailablePort(startPort: number, attempts = 20): Promise<number> {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = startPort + offset
    if (await canListen(candidate)) {
      return candidate
    }
  }
  throw new Error(`No available port was found for llama.cpp starting at ${startPort}.`)
}

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

async function waitForProcessExit(proc: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (proc.exitCode !== null) return true
  return await new Promise<boolean>((resolve) => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      proc.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    proc.once('exit', onExit)
  })
}

function findDefaultModel(models: ModelOption[]): ModelOption {
  const preferred = models.find((model) => /qwen3\.5-27b-q6_k\.gguf$/i.test(model.name))
  return preferred ?? models[0]
}

function toModelAlias(modelName: string): string {
  return basename(modelName, '.gguf').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'local-model'
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
