import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange
} from '@xyflow/react'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import type {
  GraphEdge,
  GraphNode,
  NodeData,
  NodeKind,
  ProjectSnapshot,
  WorkspaceMeta
} from '@shared/types'
import { createNode, scenePinForKind, DEFAULT_NODE_WIDTH } from '../graph/factory'

export type RFNode = Node<NodeData, NodeKind>

// コピー/ペースト用クリップボード（セッション内・非永続）。
let clipboard: { nodes: GraphNode[]; edges: GraphEdge[] } | null = null
let pasteCount = 0

interface GraphState {
  // workspaces
  workspaces: WorkspaceMeta[]
  activeId: string | null
  name: string
  dirty: boolean

  // active graph
  nodes: RFNode[]
  edges: Edge[]
  selectedId: string | null

  // graph editing
  onNodesChange: (changes: NodeChange<RFNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (kind: NodeKind, position: { x: number; y: number }) => void
  updateNodeData: (id: string, patch: Partial<NodeData>) => void
  removeNode: (id: string) => void

  // クリップボード（コピー/ペースト）
  hasClipboard: boolean
  copyNodes: (ids: string[]) => void
  pasteNodes: (at?: { x: number; y: number }) => void
  setSelected: (id: string | null) => void
  setName: (name: string) => void

  // workspace ops
  init: () => Promise<void>
  refreshWorkspaces: () => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
  createWorkspace: () => Promise<void>
  duplicateWorkspace: (id: string) => Promise<void>
  saveActive: () => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
}

function toRFNode(n: GraphNode): RFNode {
  return {
    id: n.id,
    type: n.kind,
    position: n.position,
    data: n.data,
    width: n.width ?? DEFAULT_NODE_WIDTH[n.kind], // 旧データは既定幅で補完
    ...(n.height ? { height: n.height } : {})
  }
}

function snapshotOf(state: GraphState): ProjectSnapshot | null {
  if (!state.activeId) return null
  return {
    version: 1,
    id: state.activeId,
    name: state.name,
    nodes: state.nodes.map<GraphNode>((n) => ({
      id: n.id,
      kind: n.type as NodeKind,
      position: n.position,
      data: n.data,
      width: n.width ?? n.measured?.width,
      height: n.height
    })),
    edges: state.edges.map<GraphEdge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null
    }))
  }
}

function applySnapshot(snap: ProjectSnapshot): Partial<GraphState> {
  // 旧データ（Scene の単一 'in' ピン）を新しいカテゴリ別ピンへ移行
  const kindById = new Map(snap.nodes.map((n) => [n.id, n.kind]))
  return {
    activeId: snap.id,
    name: snap.name,
    nodes: snap.nodes.map(toRFNode),
    edges: snap.edges.map((e) => {
      let targetHandle = e.targetHandle ?? null
      if (kindById.get(e.target) === 'scene') {
        const srcKind = kindById.get(e.source)
        const pin = srcKind ? scenePinForKind(srcKind) : null
        if (pin) targetHandle = pin
      }
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle
      }
    }),
    selectedId: null,
    dirty: false
  }
}

export const useGraphStore = create<GraphState>((set, get) => ({
  workspaces: [],
  activeId: null,
  name: 'untitled',
  dirty: false,
  nodes: [],
  edges: [],
  selectedId: null,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes), dirty: true })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), dirty: true })),

  onConnect: (connection) =>
    set((s) => ({ edges: addEdge({ ...connection, id: nanoid(8) }, s.edges), dirty: true })),

  addNode: (kind, position) =>
    set((s) => ({ nodes: [...s.nodes, toRFNode(createNode(kind, position))], dirty: true })),

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } as NodeData } : n
      ),
      dirty: true
    })),

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      dirty: true
    })),

  hasClipboard: false,

  copyNodes: (ids) => {
    const idSet = new Set(ids)
    const sel = get().nodes.filter((n) => idSet.has(n.id))
    if (sel.length === 0) return
    clipboard = {
      nodes: sel.map((n) => ({
        id: n.id,
        kind: n.type as NodeKind,
        position: { ...n.position },
        data: JSON.parse(JSON.stringify(n.data)) as NodeData,
        width: n.width,
        height: n.height
      })),
      // コピー対象ノード同士を結ぶエッジのみ複製する
      edges: get()
        .edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null
        }))
    }
    pasteCount = 0
    set({ hasClipboard: true })
  },

  pasteNodes: (at) =>
    set((s) => {
      if (!clipboard || clipboard.nodes.length === 0) return {}
      const idMap = new Map<string, string>()
      clipboard.nodes.forEach((n) => idMap.set(n.id, nanoid(8)))

      // 配置オフセット: at 指定ならグループ左上をそこへ、無ければ少しずらして重ねる
      let dx = 0
      let dy = 0
      if (at) {
        const minX = Math.min(...clipboard.nodes.map((n) => n.position.x))
        const minY = Math.min(...clipboard.nodes.map((n) => n.position.y))
        dx = at.x - minX
        dy = at.y - minY
      } else {
        pasteCount += 1
        dx = dy = 30 * pasteCount
      }

      const newNodes = clipboard.nodes.map((n) => {
        const rf = toRFNode({
          id: idMap.get(n.id) as string,
          kind: n.kind,
          position: { x: n.position.x + dx, y: n.position.y + dy },
          data: JSON.parse(JSON.stringify(n.data)) as NodeData,
          width: n.width,
          height: n.height
        })
        return { ...rf, selected: true }
      })
      const newEdges: Edge[] = clipboard.edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          id: nanoid(8),
          source: idMap.get(e.source) as string,
          target: idMap.get(e.target) as string,
          sourceHandle: e.sourceHandle ?? null,
          targetHandle: e.targetHandle ?? null,
          selected: true
        }))

      return {
        nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
        edges: [...s.edges, ...newEdges],
        selectedId: newNodes[0]?.id ?? s.selectedId,
        dirty: true
      }
    }),

  setSelected: (id) => set({ selectedId: id }),
  setName: (name) => set({ name, dirty: true }),

  // --- workspace ops ---
  init: async () => {
    let list = await window.api.listWorkspaces()
    if (list.length === 0) {
      const created = await window.api.createWorkspace('workspace 1')
      list = await window.api.listWorkspaces()
      set({ workspaces: list, ...applySnapshot(created) })
      return
    }
    set({ workspaces: list })
    await get().switchWorkspace(list[0].id)
  },

  refreshWorkspaces: async () => {
    set({ workspaces: await window.api.listWorkspaces() })
  },

  switchWorkspace: async (id) => {
    const { activeId, dirty } = get()
    if (id === activeId) return
    if (activeId && dirty) await get().saveActive()
    const snap = await window.api.loadWorkspace(id)
    if (!snap) {
      await get().refreshWorkspaces()
      return
    }
    set(applySnapshot(snap))
    await get().refreshWorkspaces()
  },

  createWorkspace: async () => {
    const { activeId, dirty } = get()
    if (activeId && dirty) await get().saveActive()
    const n = get().workspaces.length + 1
    const created = await window.api.createWorkspace(`workspace ${n}`)
    set(applySnapshot(created))
    await get().refreshWorkspaces()
  },

  duplicateWorkspace: async (id) => {
    const { activeId, dirty } = get()
    if (activeId && dirty) await get().saveActive()
    // 複製元の内容を取得（アクティブは現在の状態、それ以外はディスクから）
    const src = id === get().activeId ? snapshotOf(get()) : await window.api.loadWorkspace(id)
    if (!src) return
    const created = await window.api.createWorkspace(`${src.name} のコピー`)
    const filled: ProjectSnapshot = { ...created, nodes: src.nodes, edges: src.edges }
    await window.api.saveWorkspace(filled)
    set(applySnapshot(filled)) // 複製先へ切り替え
    await get().refreshWorkspaces()
  },

  saveActive: async () => {
    const snap = snapshotOf(get())
    if (!snap) return
    await window.api.saveWorkspace(snap)
    set({ dirty: false })
    await get().refreshWorkspaces()
  },

  renameWorkspace: async (id, name) => {
    if (id === get().activeId) {
      set({ name })
      await get().saveActive()
    } else {
      await window.api.renameWorkspace(id, name)
      await get().refreshWorkspaces()
    }
  },

  deleteWorkspace: async (id) => {
    await window.api.deleteWorkspace(id)
    const remaining = await window.api.listWorkspaces()
    set({ workspaces: remaining })
    if (id === get().activeId) {
      if (remaining.length > 0) {
        set({ activeId: null }) // 強制切替のためリセット
        await get().switchWorkspace(remaining[0].id)
      } else {
        await get().createWorkspace()
      }
    }
  }
}))
