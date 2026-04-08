import Database from 'better-sqlite3'
import { app, nativeImage } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GraphEdgeRecord, GraphNodeRecord, ImageAsset, NodeInputHandle, NodeType, ProjectRecord, ProjectSnapshot } from './types'

const DEFAULT_NODE_WIDTH = 288
const DEFAULT_NODE_HEIGHT = 180
const DEFAULT_IMAGE_NODE_WIDTH = 360
const DEFAULT_IMAGE_NODE_HEIGHT = 280
const IMAGE_THUMBNAIL_WIDTH = 720

type NodeRow = {
  id: string
  project_id: string
  type: NodeType
  title: string
  content: string
  instruction: string | null
  is_local: number
  model: string | null
  is_generated: number
  generation_meta: string | null
  image_asset: string | null
  created_at: string
  updated_at: string
  x: number
  y: number
  width: number
  height: number
}

type EdgeRow = {
  id: string
  project_id: string
  source_id: string
  target_id: string
  source_handle: 'output' | null
  target_handle: NodeInputHandle | null
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
  isLocal?: boolean
  model?: string | null
  isGenerated?: boolean
  generationMeta?: GraphNodeRecord['generationMeta']
  image?: ImageAsset | null
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export interface UpdateNodeInput {
  id: string
  title?: string
  content?: string
  instruction?: string | null
  isLocal?: boolean
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  model?: string | null
  isGenerated?: boolean
  generationMeta?: GraphNodeRecord['generationMeta']
  image?: ImageAsset | null
}

export interface ImportImageNodeInput {
  projectId: string
  sourcePath: string
  position?: { x: number; y: number }
}

export class GraphRepository {
  private readonly db: Database.Database
  private readonly assetsDir: string
  private readonly imageAssetsDir: string

  constructor() {
    const dbPath = join(app.getPath('userData'), 'graph-chat.db')
    this.assetsDir = join(app.getPath('userData'), 'assets')
    this.imageAssetsDir = join(this.assetsDir, 'images')
    mkdirSync(dirname(dbPath), { recursive: true })
    mkdirSync(this.imageAssetsDir, { recursive: true })
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
        type TEXT NOT NULL CHECK(type IN ('text', 'context', 'local_context', 'instruction', 'local_instruction', 'image')),
        title TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        instruction TEXT,
        is_local INTEGER NOT NULL DEFAULT 0,
        model TEXT,
        is_generated INTEGER NOT NULL DEFAULT 0,
        generation_meta TEXT,
        image_asset TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS edges (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        source_handle TEXT,
        target_handle TEXT,
        UNIQUE(source_id, target_id)
      );
      CREATE TABLE IF NOT EXISTS node_positions (
        node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
        x REAL NOT NULL,
        y REAL NOT NULL
      );
    `)
    this.ensureNodeColumns()
    this.ensureNodePositionColumns()
    this.ensureEdgeHandleColumns()
    this.ensureNodeTypeConstraint()
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
    const snapshot = this.getProjectSnapshot(id)
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
    for (const node of snapshot.nodes) {
      this.deleteImageAsset(node.image)
    }
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

  saveProjectSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
    const now = new Date().toISOString()
    const previousNodes = this.listNodes(snapshot.project.id)
    const preparedNodes = this.ensureUniqueImageAssets(snapshot.nodes)
    const nextNodeMap = new Map(preparedNodes.map((node) => [node.id, node]))

    this.db.transaction(() => {
      this.db.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?').run(snapshot.project.name, now, snapshot.project.id)
      this.db.prepare('DELETE FROM edges WHERE project_id = ?').run(snapshot.project.id)
      this.db.prepare('DELETE FROM nodes WHERE project_id = ?').run(snapshot.project.id)

      const insertNode = this.db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, content, instruction, is_local, model, is_generated, generation_meta, image_asset, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertPosition = this.db.prepare('INSERT INTO node_positions (node_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)')
      const insertEdge = this.db.prepare('INSERT INTO edges (id, project_id, source_id, target_id, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)')

      for (const node of preparedNodes) {
        insertNode.run(
          node.id,
          snapshot.project.id,
          node.type,
          node.title,
          node.content,
          node.instruction,
          node.isLocal ? 1 : 0,
          node.model,
          node.isGenerated ? 1 : 0,
          node.generationMeta ? JSON.stringify(node.generationMeta) : null,
          node.image ? JSON.stringify(node.image) : null,
          node.createdAt,
          node.updatedAt
        )
        insertPosition.run(node.id, node.position.x, node.position.y, node.size.width, node.size.height)
      }

      for (const edge of snapshot.edges) {
        insertEdge.run(edge.id, snapshot.project.id, edge.sourceId, edge.targetId, edge.sourceHandle, edge.targetHandle)
      }
    })()

    for (const previousNode of previousNodes) {
      const nextNode = nextNodeMap.get(previousNode.id)
      if (!nextNode) {
        this.deleteImageAsset(previousNode.image)
        continue
      }
      if (previousNode.image?.path && previousNode.image.path !== nextNode.image?.path) {
        this.deleteImageAsset(previousNode.image)
      }
    }

    return this.getProjectSnapshot(snapshot.project.id)
  }

  private ensureUniqueImageAssets(nodes: GraphNodeRecord[]): GraphNodeRecord[] {
    const seenImagePaths = new Map<string, string>()
    return nodes.map((node) => {
      if (!node.image?.path) return node
      const existingOwnerId = seenImagePaths.get(node.image.path)
      if (!existingOwnerId) {
        seenImagePaths.set(node.image.path, node.id)
        return node
      }
      return {
        ...node,
        image: this.cloneImageAsset(node.image, node.id)
      }
    })
  }

  duplicateProject(id: string, newName: string): ProjectSnapshot {
    const source = this.getProjectSnapshot(id)
    const now = new Date().toISOString()
    const newProjectId = randomUUID()
    this.db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(newProjectId, newName, now, now)

    const idMap = new Map<string, string>()
    for (const node of source.nodes) {
      idMap.set(node.id, randomUUID())
    }

    const duplicatedImageMap = new Map<string, ImageAsset | null>()
    for (const node of source.nodes) {
      const newId = idMap.get(node.id)!
      duplicatedImageMap.set(node.id, node.image ? this.cloneImageAsset(node.image, newId) : null)
    }

    const insertNode = this.db.prepare(
      `INSERT INTO nodes (id, project_id, type, title, content, instruction, is_local, model, is_generated, generation_meta, image_asset, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertPosition = this.db.prepare('INSERT INTO node_positions (node_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)')
    const insertEdge = this.db.prepare('INSERT INTO edges (id, project_id, source_id, target_id, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)')

    this.db.transaction(() => {
      for (const node of source.nodes) {
        const newId = idMap.get(node.id)!
        const duplicatedImage = duplicatedImageMap.get(node.id) ?? null
        insertNode.run(newId, newProjectId, node.type, node.title, node.content, node.instruction, node.isLocal ? 1 : 0, node.model, node.isGenerated ? 1 : 0, node.generationMeta ? JSON.stringify(node.generationMeta) : null, duplicatedImage ? JSON.stringify(duplicatedImage) : null, now, now)
        insertPosition.run(newId, node.position.x, node.position.y, node.size.width, node.size.height)
      }
      for (const edge of source.edges) {
        const newSourceId = idMap.get(edge.sourceId)
        const newTargetId = idMap.get(edge.targetId)
        if (newSourceId && newTargetId) {
          insertEdge.run(randomUUID(), newProjectId, newSourceId, newTargetId, edge.sourceHandle, edge.targetHandle)
        }
      }
    })()

    return this.getProjectSnapshot(newProjectId)
  }

  createNode(input: CreateNodeInput): GraphNodeRecord {
    const now = new Date().toISOString()
    const id = randomUUID()
    const position = input.position ?? { x: 80, y: 80 }
    const size = input.size ?? defaultNodeSize(input.type, input.image)
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO nodes (id, project_id, type, title, content, instruction, is_local, model, is_generated, generation_meta, image_asset, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          input.projectId,
          input.type,
          input.title ?? '',
          input.content ?? '',
          input.instruction ?? null,
          input.isLocal ? 1 : 0,
          input.model ?? null,
          input.isGenerated ? 1 : 0,
          input.generationMeta ? JSON.stringify(input.generationMeta) : null,
          input.image ? JSON.stringify(input.image) : null,
          now,
          now
        )
      this.db.prepare('INSERT INTO node_positions (node_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)').run(id, position.x, position.y, size.width, size.height)
      this.touchProject(input.projectId)
    })()
    return this.getNode(id)
  }

  importImageNode(input: ImportImageNodeInput): GraphNodeRecord {
    const image = this.copyImageAsset(input.sourcePath)
    return this.createNode({
      projectId: input.projectId,
      type: 'image',
      title: stripExtension(image.originalName),
      content: '',
      image,
      position: input.position,
      size: defaultNodeSize('image', image)
    })
  }
  replaceImageNode(id: string, sourcePath: string): GraphNodeRecord {
    const current = this.getNode(id)
    if (current.type !== 'image') {
      throw new Error('Only image nodes can replace images.')
    }
    const image = this.copyImageAsset(sourcePath)
    return this.updateNode({
      id,
      title: current.title.trim() === '' || current.title === 'Image' ? stripExtension(image.originalName) : current.title,
      image,
      size: current.image ? current.size : defaultNodeSize('image', image)
    })
  }

  updateNode(input: UpdateNodeInput): GraphNodeRecord {
    const now = new Date().toISOString()
    const current = this.getNode(input.id)
    const nextImage = input.image === undefined ? current.image : input.image
    this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE nodes SET title = ?, content = ?, instruction = ?, is_local = ?, model = ?, is_generated = ?, generation_meta = ?, image_asset = ?, updated_at = ? WHERE id = ?`
        )
        .run(
          input.title ?? current.title,
          input.content ?? current.content,
          input.instruction === undefined ? current.instruction : input.instruction,
          input.isLocal === undefined ? Number(current.isLocal) : Number(input.isLocal),
          input.model ?? current.model,
          input.isGenerated === undefined ? Number(current.isGenerated) : Number(input.isGenerated),
          input.generationMeta === undefined ? (current.generationMeta ? JSON.stringify(current.generationMeta) : null) : (input.generationMeta ? JSON.stringify(input.generationMeta) : null),
          nextImage ? JSON.stringify(nextImage) : null,
          now,
          input.id
        )
      const position = input.position ?? current.position
      const size = input.size ?? current.size
      this.db
        .prepare(
          `INSERT INTO node_positions (node_id, x, y, width, height)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(node_id) DO UPDATE SET
             x = excluded.x,
             y = excluded.y,
             width = excluded.width,
             height = excluded.height`
        )
        .run(input.id, position.x, position.y, size.width, size.height)
      this.touchProject(current.projectId)
    })()

    if (current.image?.path && current.image.path !== nextImage?.path) {
      this.deleteImageAsset(current.image)
    }

    return this.getNode(input.id)
  }

  deleteNode(id: string): void {
    const node = this.getNode(id)
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM nodes WHERE id = ?').run(id)
      this.touchProject(node.projectId)
    })()
    this.deleteImageAsset(node.image)
  }

  createEdge(projectId: string, sourceId: string, targetId: string, sourceHandle: GraphEdgeRecord['sourceHandle'] = null, targetHandle: GraphEdgeRecord['targetHandle'] = null): GraphEdgeRecord {
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
    this.db.prepare('INSERT INTO edges (id, project_id, source_id, target_id, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)').run(id, projectId, sourceId, targetId, sourceHandle, targetHandle)
    this.touchProject(projectId)
    return { id, projectId, sourceId, targetId, sourceHandle, targetHandle }
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
        `SELECT n.id, n.project_id, n.type, n.title, n.content, n.instruction, n.is_local, n.model, n.is_generated, n.generation_meta, n.image_asset, n.created_at, n.updated_at,
                COALESCE(p.x, 80) AS x, COALESCE(p.y, 80) AS y,
                COALESCE(p.width, ${DEFAULT_NODE_WIDTH}) AS width, COALESCE(p.height, ${DEFAULT_NODE_HEIGHT}) AS height
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
        `SELECT n.id, n.project_id, n.type, n.title, n.content, n.instruction, n.is_local, n.model, n.is_generated, n.generation_meta, n.image_asset, n.created_at, n.updated_at,
                COALESCE(p.x, 80) AS x, COALESCE(p.y, 80) AS y,
                COALESCE(p.width, ${DEFAULT_NODE_WIDTH}) AS width, COALESCE(p.height, ${DEFAULT_NODE_HEIGHT}) AS height
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
      .prepare('SELECT id, project_id, source_id, target_id, source_handle, target_handle FROM edges WHERE project_id = ? ORDER BY rowid ASC')
      .all(projectId) as EdgeRow[]
    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      sourceId: row.source_id,
      targetId: row.target_id,
      sourceHandle: row.source_handle,
      targetHandle: row.target_handle
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


  private ensureNodeTypeConstraint(): void {
    const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'nodes'").get() as { sql: string | null } | undefined
    const createSql = row?.sql ?? ''
    if (createSql.includes("'image'")) return

    const nodeRows = this.db.prepare(`
      SELECT n.id, n.project_id, n.type, n.title, n.content, n.instruction, n.is_local, n.model, n.is_generated, n.generation_meta, n.image_asset, n.created_at, n.updated_at,
             COALESCE(p.x, 80) AS x, COALESCE(p.y, 80) AS y,
             COALESCE(p.width, ${DEFAULT_NODE_WIDTH}) AS width, COALESCE(p.height, ${DEFAULT_NODE_HEIGHT}) AS height
      FROM nodes n
      LEFT JOIN node_positions p ON p.node_id = n.id
      ORDER BY n.created_at ASC
    `).all() as NodeRow[]
    const edgeRows = this.db.prepare('SELECT id, project_id, source_id, target_id, source_handle, target_handle FROM edges ORDER BY rowid ASC').all() as EdgeRow[]

    this.db.exec('PRAGMA foreign_keys = OFF;')
    this.db.transaction(() => {
      this.db.exec(`
        DROP TABLE IF EXISTS edges;
        DROP TABLE IF EXISTS node_positions;
        DROP TABLE IF EXISTS nodes;
        CREATE TABLE nodes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          type TEXT NOT NULL CHECK(type IN ('text', 'context', 'local_context', 'instruction', 'local_instruction', 'image')),
          title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          instruction TEXT,
          is_local INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          is_generated INTEGER NOT NULL DEFAULT 0,
          generation_meta TEXT,
          image_asset TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE edges (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
          source_handle TEXT,
          target_handle TEXT,
          UNIQUE(source_id, target_id)
        );
        CREATE TABLE node_positions (
          node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL DEFAULT ${DEFAULT_NODE_WIDTH},
          height REAL NOT NULL DEFAULT ${DEFAULT_NODE_HEIGHT}
        );
      `)

      const insertNode = this.db.prepare(
        `INSERT INTO nodes (id, project_id, type, title, content, instruction, is_local, model, is_generated, generation_meta, image_asset, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      const insertPosition = this.db.prepare('INSERT INTO node_positions (node_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)')
      const insertEdge = this.db.prepare('INSERT INTO edges (id, project_id, source_id, target_id, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?)')

      for (const node of nodeRows) {
        insertNode.run(
          node.id,
          node.project_id,
          node.type,
          node.title,
          node.content,
          node.instruction,
          node.is_local,
          node.model,
          node.is_generated,
          node.generation_meta,
          node.image_asset,
          node.created_at,
          node.updated_at
        )
        insertPosition.run(node.id, node.x, node.y, node.width, node.height)
      }

      for (const edge of edgeRows) {
        insertEdge.run(edge.id, edge.project_id, edge.source_id, edge.target_id, edge.source_handle, edge.target_handle)
      }
    })()
    this.db.exec('PRAGMA foreign_keys = ON;')
  }
  private ensureNodeColumns(): void {
    const columns = this.db.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    if (!names.has('generation_meta')) {
      this.db.exec('ALTER TABLE nodes ADD COLUMN generation_meta TEXT;')
    }
    if (!names.has('is_local')) {
      this.db.exec('ALTER TABLE nodes ADD COLUMN is_local INTEGER NOT NULL DEFAULT 0;')
    }
    if (!names.has('image_asset')) {
      this.db.exec('ALTER TABLE nodes ADD COLUMN image_asset TEXT;')
    }
  }

  private ensureNodePositionColumns(): void {
    const columns = this.db.prepare('PRAGMA table_info(node_positions)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    if (!names.has('width')) {
      this.db.exec(`ALTER TABLE node_positions ADD COLUMN width REAL NOT NULL DEFAULT ${DEFAULT_NODE_WIDTH};`)
    }
    if (!names.has('height')) {
      this.db.exec(`ALTER TABLE node_positions ADD COLUMN height REAL NOT NULL DEFAULT ${DEFAULT_NODE_HEIGHT};`)
    }
  }

  private ensureEdgeHandleColumns(): void {
    const columns = this.db.prepare('PRAGMA table_info(edges)').all() as Array<{ name: string }>
    const names = new Set(columns.map((column) => column.name))
    if (!names.has('source_handle')) {
      this.db.exec('ALTER TABLE edges ADD COLUMN source_handle TEXT;')
    }
    if (!names.has('target_handle')) {
      this.db.exec('ALTER TABLE edges ADD COLUMN target_handle TEXT;')
    }
  }

  private copyImageAsset(sourcePath: string): ImageAsset {
    const extension = extname(sourcePath) || '.png'
    const assetId = randomUUID()
    const assetDir = join(this.imageAssetsDir, assetId)
    mkdirSync(assetDir, { recursive: true })

    const safeName = sanitizeFileName(basename(sourcePath, extension)) || 'image'
    const destinationPath = join(assetDir, `${safeName}${extension.toLowerCase()}`)
    copyFileSync(sourcePath, destinationPath)

    const image = nativeImage.createFromPath(destinationPath)
    if (image.isEmpty()) {
      rmSync(assetDir, { recursive: true, force: true })
      throw new Error('The selected file could not be loaded as an image.')
    }

    const thumbnailPath = join(assetDir, `${safeName}.thumb.png`)
    const thumbnail = image.resize({ width: Math.min(IMAGE_THUMBNAIL_WIDTH, Math.max(image.getSize().width, 1)) })
    const thumbnailBuffer = thumbnail.toPNG()
    writeFileSync(thumbnailPath, thumbnailBuffer)
    const size = image.getSize()
    return {
      path: destinationPath,
      thumbnailPath,
      thumbnailDataUrl: `data:image/png;base64,${thumbnailBuffer.toString('base64')}`,
      originalName: basename(sourcePath),
      mimeType: guessImageMimeType(extension),
      width: size.width || null,
      height: size.height || null
    }
  }

  private cloneImageAsset(asset: ImageAsset, nodeId: string): ImageAsset {
    const extension = extname(asset.path) || '.png'
    const assetDir = join(this.imageAssetsDir, nodeId)
    mkdirSync(assetDir, { recursive: true })

    const safeName = sanitizeFileName(basename(asset.originalName, extname(asset.originalName))) || 'image'
    const destinationPath = join(assetDir, `${safeName}${extension.toLowerCase()}`)
    copyFileSync(asset.path, destinationPath)

    const thumbnailPath = asset.thumbnailPath
      ? join(assetDir, `${safeName}.thumb.png`)
      : null

    if (asset.thumbnailPath && existsSync(asset.thumbnailPath) && thumbnailPath) {
      copyFileSync(asset.thumbnailPath, thumbnailPath)
    }

    return {
      ...asset,
      path: destinationPath,
      thumbnailPath,
      thumbnailDataUrl: asset.thumbnailDataUrl ?? null
    }
  }

  private deleteImageAsset(asset: ImageAsset | null): void {
    if (!asset) return
    const candidates = [asset.path, asset.thumbnailPath].filter((value): value is string => Boolean(value))
    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        rmSync(filePath, { force: true })
      }
    }
    const parentDir = dirname(asset.path)
    if (existsSync(parentDir)) {
      rmSync(parentDir, { recursive: true, force: true })
    }
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
    isLocal: row.is_local === 1,
    model: row.model,
    isGenerated: Boolean(row.is_generated),
    generationMeta: row.generation_meta ? JSON.parse(row.generation_meta) : null,
    image: row.image_asset ? hydrateImageAsset(JSON.parse(row.image_asset) as ImageAsset) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    position: { x: row.x, y: row.y },
    size: { width: row.width, height: row.height }
  }
}


function hydrateImageAsset(asset: ImageAsset): ImageAsset {
  if (asset.thumbnailDataUrl) return asset
  if (asset.thumbnailPath && existsSync(asset.thumbnailPath)) {
    const image = nativeImage.createFromPath(asset.thumbnailPath)
    if (!image.isEmpty()) {
      return {
        ...asset,
        thumbnailDataUrl: image.toDataURL()
      }
    }
  }
  return {
    ...asset,
    thumbnailDataUrl: null
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
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of outgoing.get(current) ?? []) {
      stack.push(next)
    }
  }
  return false
}

function defaultNodeSize(type: NodeType, image: ImageAsset | null | undefined): { width: number; height: number } {
  if (type !== 'image') {
    return { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT }
  }

  const width = image?.width ?? DEFAULT_IMAGE_NODE_WIDTH
  const height = image?.height ?? DEFAULT_IMAGE_NODE_HEIGHT
  const maxPreviewWidth = 420
  const minPreviewWidth = 280
  const maxPreviewHeight = 280
  const scaledWidth = Math.max(minPreviewWidth, Math.min(maxPreviewWidth, width))
  const ratio = width > 0 ? scaledWidth / width : 1
  const scaledHeight = Math.min(maxPreviewHeight, Math.max(160, Math.round(height * ratio)))
  return {
    width: scaledWidth + 40,
    height: scaledHeight + 110
  }
}

function stripExtension(fileName: string): string {
  const extension = extname(fileName)
  return extension ? fileName.slice(0, -extension.length) : fileName
}

function sanitizeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim()
}

function guessImageMimeType(extension: string): string | null {
  const normalized = extension.toLowerCase()
  if (normalized === '.png') return 'image/png'
  if (normalized === '.jpg' || normalized === '.jpeg') return 'image/jpeg'
  if (normalized === '.gif') return 'image/gif'
  if (normalized === '.webp') return 'image/webp'
  if (normalized === '.bmp') return 'image/bmp'
  return null
}
