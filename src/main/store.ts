// プロジェクト・設定・llama インストール記録の永続化（JSON ファイル）。
// 当面はファイルベース。将来 better-sqlite3 へ拡張余地を残す。
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppSettings, LlamaInstall, ProjectSnapshot } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = { selectedModelPath: null, contextSize: 4096 }

export class Store {
  constructor(private readonly dataDir: string) {}

  private path(name: string): string {
    return join(this.dataDir, name)
  }

  private async readJson<T>(file: string, fallback: T): Promise<T> {
    const full = this.path(file)
    if (!existsSync(full)) return fallback
    try {
      const text = await readFile(full, { encoding: 'utf-8' })
      return { ...fallback, ...(JSON.parse(text) as T) }
    } catch {
      return fallback
    }
  }

  private async writeJson(file: string, value: unknown): Promise<void> {
    const full = this.path(file)
    await mkdir(dirname(full), { recursive: true })
    const tmp = `${full}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf-8' })
    await rename(tmp, full)
  }

  // --- settings ---
  getSettings(): Promise<AppSettings> {
    return this.readJson<AppSettings>('settings.json', DEFAULT_SETTINGS)
  }
  saveSettings(settings: AppSettings): Promise<void> {
    return this.writeJson('settings.json', settings)
  }

  // --- llama install ---
  getLlamaInstall(): Promise<LlamaInstall | null> {
    return this.readJson<LlamaInstall | null>('llama.json', null)
  }
  saveLlamaInstall(install: LlamaInstall): Promise<void> {
    return this.writeJson('llama.json', install)
  }

  // --- project（当面は単一プロジェクト）---
  getProject(): Promise<ProjectSnapshot | null> {
    return this.readJson<ProjectSnapshot | null>('project.json', null)
  }
  saveProject(snapshot: ProjectSnapshot): Promise<void> {
    return this.writeJson('project.json', snapshot)
  }
}
