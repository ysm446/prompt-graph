// ワークスペース・設定・llama インストール記録の永続化（JSON ファイル）。
// 当面はファイルベース。将来 better-sqlite3 へ拡張余地を残す。
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type {
  AppSettings,
  ForgeInstall,
  LlamaInstall,
  ProjectSnapshot,
  WorkspaceMeta
} from '../shared/types'
import { DEFAULT_VISIBILITY_PROMPT } from '../shared/prompts'

const DEFAULT_SETTINGS: AppSettings = {
  selectedModelPath: null,
  contextSize: 4096,
  visibilityPrompt: DEFAULT_VISIBILITY_PROMPT,
  showResources: false,
  showMinimap: true,
  snapToGrid: false,
  forgeHost: '127.0.0.1',
  forgePort: 7861,
  forgePython: ''
}

export class Store {
  private readonly workspacesDir: string

  constructor(private readonly dataDir: string) {
    this.workspacesDir = join(dataDir, 'workspaces')
  }

  private path(name: string): string {
    return join(this.dataDir, name)
  }

  private async readJson<T>(full: string, fallback: T): Promise<T> {
    if (!existsSync(full)) return fallback
    try {
      const text = await readFile(full, { encoding: 'utf-8' })
      return JSON.parse(text) as T
    } catch {
      return fallback
    }
  }

  private async writeJson(full: string, value: unknown): Promise<void> {
    await mkdir(dirname(full), { recursive: true })
    const tmp = `${full}.tmp`
    await writeFile(tmp, JSON.stringify(value, null, 2), { encoding: 'utf-8' })
    await rename(tmp, full)
  }

  // --- settings ---
  async getSettings(): Promise<AppSettings> {
    return { ...DEFAULT_SETTINGS, ...(await this.readJson<Partial<AppSettings>>(this.path('settings.json'), {})) }
  }
  saveSettings(settings: AppSettings): Promise<void> {
    return this.writeJson(this.path('settings.json'), settings)
  }

  // --- llama install ---
  getLlamaInstall(): Promise<LlamaInstall | null> {
    return this.readJson<LlamaInstall | null>(this.path('llama.json'), null)
  }
  saveLlamaInstall(install: LlamaInstall): Promise<void> {
    return this.writeJson(this.path('llama.json'), install)
  }

  // --- forge install ---
  getForgeInstall(): Promise<ForgeInstall | null> {
    return this.readJson<ForgeInstall | null>(this.path('forge.json'), null)
  }
  saveForgeInstall(install: ForgeInstall): Promise<void> {
    return this.writeJson(this.path('forge.json'), install)
  }

  // --- workspaces ---
  private wsFile(id: string): string {
    return join(this.workspacesDir, `${id}.json`)
  }

  async listWorkspaces(): Promise<WorkspaceMeta[]> {
    await this.migrateLegacyProject()
    if (!existsSync(this.workspacesDir)) return []
    const files = (await readdir(this.workspacesDir)).filter((f) => f.endsWith('.json'))
    const metas: Array<WorkspaceMeta & { _mtime: number }> = []
    for (const file of files) {
      const full = join(this.workspacesDir, file)
      const snap = await this.readJson<ProjectSnapshot | null>(full, null)
      if (!snap?.id) continue
      const { mtimeMs } = await stat(full)
      metas.push({ id: snap.id, name: snap.name, updatedAt: new Date(mtimeMs).toISOString(), _mtime: mtimeMs })
    }
    metas.sort((a, b) => b._mtime - a._mtime)
    return metas.map(({ _mtime, ...m }) => m)
  }

  loadWorkspace(id: string): Promise<ProjectSnapshot | null> {
    return this.readJson<ProjectSnapshot | null>(this.wsFile(id), null)
  }

  async saveWorkspace(snapshot: ProjectSnapshot): Promise<void> {
    await this.writeJson(this.wsFile(snapshot.id), snapshot)
  }

  async createWorkspace(name: string): Promise<ProjectSnapshot> {
    const snapshot: ProjectSnapshot = {
      version: 1,
      id: randomUUID(),
      name: name.trim() || 'untitled',
      nodes: [],
      edges: []
    }
    await this.saveWorkspace(snapshot)
    return snapshot
  }

  async renameWorkspace(id: string, name: string): Promise<void> {
    const snap = await this.loadWorkspace(id)
    if (!snap) return
    snap.name = name.trim() || snap.name
    await this.saveWorkspace(snap)
  }

  async deleteWorkspace(id: string): Promise<void> {
    await rm(this.wsFile(id), { force: true })
  }

  // 旧バージョンの単一 data/project.json があれば最初のワークスペースとして取り込む。
  private async migrateLegacyProject(): Promise<void> {
    const legacy = this.path('project.json')
    if (!existsSync(legacy)) return
    if (existsSync(this.workspacesDir)) {
      const files = (await readdir(this.workspacesDir)).filter((f) => f.endsWith('.json'))
      if (files.length > 0) {
        await rm(legacy, { force: true })
        return
      }
    }
    const old = await this.readJson<Partial<ProjectSnapshot> | null>(legacy, null)
    if (old) {
      const snapshot: ProjectSnapshot = {
        version: 1,
        id: randomUUID(),
        name: old.name || 'imported',
        nodes: old.nodes ?? [],
        edges: old.edges ?? []
      }
      await this.saveWorkspace(snapshot)
    }
    await rm(legacy, { force: true })
  }
}
