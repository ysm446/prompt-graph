import Database from 'better-sqlite3'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GraphEdgeRecord, GraphNodeRecord, NodeType, ProjectRecord, ProjectSnapshot } from './types'

type NodeRow = {
  id: string
  project_id: string
  type: NodeType
  title: string
  content: string
  instruction: string | null
  model: string | null
  is_generated: number
  created_at: string
  updated_at: string
  x: number
  y: number
}

type EdgeRow = {
  id: string
  project_id: string
  source_id: string
  target_id: string
}

type ProjectRow = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface CreateNodeInput {
  projectId: string
  type: NodeType
  title?: string
  content?: string
  instruction?: string | null
  model?: string | null
  isGenerated?: boolean
  position?: { x: number; y: number }
}

export interface UpdateNodeInput {
  id: string
  title?: string
  content?: string
  instruction?: string | null
  position?: { x: number; y: number }
  model?: string | null
  isGenerated?: boolean
}

export class GraphRepository {
  private readonly db: Database.Database

  constructor() {
    const dbPath = join(app.getPath('userData'), 'graph-chat.db')
    mkdirSync(dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK(type IN ('text', 'context', 'instruction')),
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        instruction TEXT,
        model TEXT,
        is_generated INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        UNIQUE(source_id, target_id)
      );
      CREATE TABLE IF NOT EXISTS node_positions (
        node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
        x REAL NOT NULL,
        y REAL NOT NULL
      );
    `)
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare('SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC, created_at DESC')
      .all() as ProjectRow[]
    return rows.map(mapProject)
  }

  createProject(name: string): ProjectRecord {
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, now, now)
    return this.getProject(id)
  }

  renameProject(id: string, name: string): ProjectRecord {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id)
    return this.getProject(id)
  }

  deleteProject(id: string): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  getProjectSnapshot(projectId: string): ProjectSnapshot {
    return {
      project: this.getProject(projectId),
      nodes: this.listNodes(projectId),
      edges: this.listEdges(projectId)
    }
  }

  ensureDefaultProject(): ProjectSnapshot {
    const existing = this.listProjects()
    if (existing.length > 0) {
      return this.getProjectSnapshot(existing[0].id)
    }
    const project = this.createProject('Project 1')
    return this.getProjectSnapshot(project.id)
  }

  createNode(input: CreateNodeInput): GraphNodeRecord {
    const now = new Date().toISOString()
    const id = randomUUID()
    const position = input.position ?? { x: 80, y: 80 }
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO nodes (id, project_id, type, title, content, instruction, model, is_generated, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.projectId,
          input.type,
          input.title ?? '',
          input.content ?? '',
          input.instruction ?? null,
          input.model ?? null,
          input.isGenerated ? 1 : 0,
          now,
          now
        )
      this.db.prepare('INSERT INTO node_positions (node_id, x, y) VALUES (?, ?, ?)').run(id, position.x, position.y)
      this.touchProject(input.projectId)
    })()
    return this.getNode(id)
  }

  updateNode(input: UpdateNodeInput): GraphNodeRecord {
    const now = new Date().toISOString()
    const current = this.getNode(input.id)
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE nodes SET title = ?, content = ?, instruction = ?, model = ?, is_generated = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.title ?? current.title,
          input.content ?? current.content,
          input.instruction === undefined ? current.instruction : input.instruction,
          input.model ?? current.model,
          input.isGenerated === undefined ? Number(current.isGenerated) : Number(input.isGenerated),
          now,
          input.id
        )
      const position = input.position ?? current.position
      this.db
        .prepare(
          `INSERT INTO node_positions (node_id, x, y)
           VALUES (?, ?, ?)
           ON CONFLICT(node_id) DO UPDATE SET x = excluded.x, y = excluded.y`
        )
        .run(input.id, position.x, position.y)
      this.touchProject(current.projectId)
    })()
    return this.getNode(input.id)
  }

  deleteNode(id: string): void {
    const node = this.getNode(id)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id)
      this.touchProject(node.projectId)
    })()
  }

  createEdge(projectId: string, sourceId: string, targetId: string): GraphEdgeRecord {
    if (sourceId === targetId) {
      throw new Error('A node cannot connect to itself.')
    }
    const nodes = this.listNodes(projectId)
    const edges = this.listEdges(projectId)
    if (wouldCreateCycle(sourceId, targetId, edges)) {
      throw new Error('This connection would create a cycle.')
    }
    if (!nodes.some((node) => node.id === sourceId) || !nodes.some((node) => node.id === targetId)) {
      throw new Error('Source or target node was not found.')
    }
    const id = randomUUID()
    this.db.prepare('INSERT INTO edges (id, project_id, source_id, target_id) VALUES (?, ?, ?, ?)').run(id, projectId, sourceId, targetId)
    this.touchProject(projectId)
    return { id, projectId, sourceId, targetId }
  }

  deleteEdge(id: string): void {
    const edge = this.db.prepare('SELECT project_id FROM edges WHERE id = ?').get(id) as { project_id: string } | undefined
    this.db.prepare('DELETE FROM edges WHERE id = ?').run(id)
    if (edge) {
      this.touchProject(edge.project_id)
    }
  }

  getNode(id: string): GraphNodeRecord {
    const row = this.db
      .prepare(
        `SELECT n.id, n.project_id, n.type, n.title, n.content, n.instruction, n.model, n.is_generated, n.created_at, n.updated_at,
                COALESCE(p.x, 80) AS x, COALESCE(p.y, 80) AS y
         FROM nodes n
         LEFT JOIN node_positions p ON p.node_id = n.id
         WHERE n.id = ?`
      )
      .get(id) as NodeRow | undefined
    if (!row) {
      throw new Error(`Node not found: ${id}`)
    }
    return mapNode(row)
  }

  listNodes(projectId: string): GraphNodeRecord[] {
    const rows = this.db
      .prepare(
        `SELECT n.id, n.project_id, n.type, n.title, n.content, n.instruction, n.model, n.is_generated, n.created_at, n.updated_at,
                COALESCE(p.x, 80) AS x, COALESCE(p.y, 80) AS y
         FROM nodes n
         LEFT JOIN node_positions p ON p.node_id = n.id
         WHERE n.project_id = ?
         ORDER BY n.created_at ASC`
      )
      .all(projectId) as NodeRow[]
    return rows.map(mapNode)
  }

  listEdges(projectId: string): GraphEdgeRecord[] {
    const rows = this.db
      .prepare('SELECT id, project_id, source_id, target_id FROM edges WHERE project_id = ? ORDER BY rowid ASC')
      .all(projectId) as EdgeRow[]
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sourceId: row.source_id,
      targetId: row.target_id
    }))
  }

  private getProject(id: string): ProjectRecord {
    const row = this.db.prepare('SELECT id, name, created_at, updated_at FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    if (!row) {
      throw new Error(`Project not found: ${id}`)
    }
    return mapProject(row)
  }

  private touchProject(projectId: string): void {
    this.db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), projectId)
  }
}

function mapProject(row: ProjectRow): ProjectRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

function mapNode(row: NodeRow): GraphNodeRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    title: row.title,
    content: row.content,
    instruction: row.instruction,
    model: row.model,
    isGenerated: Boolean(row.is_generated),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    position: { x: row.x, y: row.y }
  }
}

function wouldCreateCycle(sourceId: string, targetId: string, edges: GraphEdgeRecord[]): boolean {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const list = outgoing.get(edge.sourceId) ?? []
    list.push(edge.targetId)
    outgoing.set(edge.sourceId, list)
  }
  const stack = [targetId]
  const visited = new Set<string>()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === sourceId) {
      return true
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    for (const next of outgoing.get(current) ?? []) {
      stack.push(next)
    }
  }
  return false
}
