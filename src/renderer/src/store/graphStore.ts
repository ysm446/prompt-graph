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
import { createNode } from '../graph/factory'

export type RFNode = Node<NodeData, NodeKind>

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
  setSelected: (id: string | null) => void
  setName: (name: string) => void

  // workspace ops
  init: () => Promise<void>
  refreshWorkspaces: () => Promise<void>
  switchWorkspace: (id: string) => Promise<void>
  createWorkspace: () => Promise<void>
  saveActive: () => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
}

function toRFNode(n: GraphNode): RFNode {
  return { id: n.id, type: n.kind, position: n.position, data: n.data }
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
      data: n.data
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
  return {
    activeId: snap.id,
    name: snap.name,
    nodes: snap.nodes.map(toRFNode),
    edges: snap.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null
    })),
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
