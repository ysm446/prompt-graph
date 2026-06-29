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
import type { GraphEdge, GraphNode, NodeData, NodeKind, ProjectSnapshot } from '@shared/types'
import { createNode } from '../graph/factory'

export type RFNode = Node<NodeData, NodeKind>

interface GraphState {
  projectName: string
  nodes: RFNode[]
  edges: Edge[]
  selectedId: string | null
  dirty: boolean

  onNodesChange: (changes: NodeChange<RFNode>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onConnect: (connection: Connection) => void
  addNode: (kind: NodeKind, position: { x: number; y: number }) => void
  updateNodeData: (id: string, patch: Partial<NodeData>) => void
  removeNode: (id: string) => void
  setSelected: (id: string | null) => void

  loadSnapshot: (snapshot: ProjectSnapshot | null) => void
  toSnapshot: () => ProjectSnapshot
  markSaved: () => void
}

function toRFNode(n: GraphNode): RFNode {
  return { id: n.id, type: n.kind, position: n.position, data: n.data }
}

export const useGraphStore = create<GraphState>((set, get) => ({
  projectName: 'untitled',
  nodes: [],
  edges: [],
  selectedId: null,
  dirty: false,

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes), dirty: true })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges), dirty: true })),

  onConnect: (connection) =>
    set((s) => ({
      edges: addEdge({ ...connection, id: nanoid(8) }, s.edges),
      dirty: true
    })),

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

  loadSnapshot: (snapshot) => {
    if (!snapshot) {
      set({ projectName: 'untitled', nodes: [], edges: [], selectedId: null, dirty: false })
      return
    }
    set({
      projectName: snapshot.name,
      nodes: snapshot.nodes.map(toRFNode),
      edges: snapshot.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null
      })),
      selectedId: null,
      dirty: false
    })
  },

  toSnapshot: (): ProjectSnapshot => {
    const { projectName, nodes, edges } = get()
    return {
      version: 1,
      name: projectName,
      nodes: nodes.map<GraphNode>((n) => ({
        id: n.id,
        kind: n.type as NodeKind,
        position: n.position,
        data: n.data
      })),
      edges: edges.map<GraphEdge>((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null
      }))
    }
  },

  markSaved: () => set({ dirty: false })
}))
