import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type OnSelectionChangeParams
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { NodeKind } from '@shared/types'
import { nodeTypes } from './graph/nodes'
import { NODE_LABELS } from './graph/factory'
import { useGraphStore } from './store/graphStore'
import { CompilePanel } from './components/CompilePanel'
import { ModelBar } from './components/ModelBar'
import { WorkspacePanel } from './components/WorkspacePanel'

const ADD_ORDER: NodeKind[] = [
  'character',
  'soloAction',
  'interaction',
  'background',
  'lighting',
  'camera',
  'style',
  'seed',
  'scene'
]

type Menu =
  | { kind: 'pane'; x: number; y: number; flow: { x: number; y: number } }
  | { kind: 'node'; x: number; y: number; nodeId: string; label: string }

function AddNodePanel() {
  const addNode = useGraphStore((s) => s.addNode)
  const { screenToFlowPosition } = useReactFlow()
  const [open, setOpen] = useState(false)

  const handleAdd = (kind: NodeKind) => {
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2 - 120 + Math.random() * 80,
      y: 160 + Math.random() * 120
    })
    addNode(kind, pos)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        className="rounded border border-[#2a2e3f] bg-[#1a1b26] px-2 py-1 text-xs text-[#c0caf5] hover:border-[#7aa2f7]"
        onClick={() => setOpen((v) => !v)}
      >
        ＋ ノード追加 ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-40 rounded-md border border-[#2a2e3f] bg-[#1a1b26] py-1 text-xs shadow-2xl">
          {ADD_ORDER.map((kind) => (
            <button
              key={kind}
              className="block w-full px-3 py-1.5 text-left text-[#c0caf5] hover:bg-[#2a2e3f]"
              onClick={() => handleAdd(kind)}
            >
              + {NODE_LABELS[kind]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Canvas() {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const onNodesChange = useGraphStore((s) => s.onNodesChange)
  const onEdgesChange = useGraphStore((s) => s.onEdgesChange)
  const onConnect = useGraphStore((s) => s.onConnect)
  const setSelected = useGraphStore((s) => s.setSelected)
  const removeNode = useGraphStore((s) => s.removeNode)
  const addNode = useGraphStore((s) => s.addNode)
  const { screenToFlowPosition } = useReactFlow()
  const [menu, setMenu] = useState<Menu | null>(null)

  const onSelectionChange = useCallback(
    (p: OnSelectionChangeParams) => setSelected(p.nodes[0]?.id ?? null),
    [setSelected]
  )

  const closeMenu = useCallback(() => setMenu(null), [])

  const onPaneContextMenu = useCallback(
    (e: MouseEvent | ReactMouseEvent) => {
      e.preventDefault()
      setMenu({
        kind: 'pane',
        x: e.clientX,
        y: e.clientY,
        flow: screenToFlowPosition({ x: e.clientX, y: e.clientY })
      })
    },
    [screenToFlowPosition]
  )

  const onNodeContextMenu = useCallback((e: ReactMouseEvent, node: { id: string }) => {
    e.preventDefault()
    const data = useGraphStore.getState().nodes.find((n) => n.id === node.id)?.data
    setMenu({ kind: 'node', x: e.clientX, y: e.clientY, nodeId: node.id, label: data?.label ?? node.id })
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodesDelete={(deleted) => deleted.forEach((n) => removeNode(n.id))}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={closeMenu}
        onMoveStart={closeMenu}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-left">
          <AddNodePanel />
        </Panel>
        <Background color="#2a2e3f" gap={20} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-[#1a1b26]" />
      </ReactFlow>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(e) => e.preventDefault()} />
          <div
            className="fixed z-50 min-w-44 overflow-hidden rounded-md border border-[#2a2e3f] bg-[#1a1b26] py-1 text-xs text-[#c0caf5] shadow-2xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 320) }}
          >
            {menu.kind === 'pane' ? (
              <>
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-[#565f89]">
                  ノードを追加
                </div>
                {ADD_ORDER.map((kind) => (
                  <button
                    key={kind}
                    className="block w-full px-3 py-1.5 text-left hover:bg-[#2a2e3f]"
                    onClick={() => {
                      addNode(kind, menu.flow)
                      setMenu(null)
                    }}
                  >
                    + {NODE_LABELS[kind]}
                  </button>
                ))}
              </>
            ) : (
              <>
                <div className="truncate px-3 py-1 text-[10px] uppercase tracking-wide text-[#565f89]">
                  {menu.label}
                </div>
                <button
                  className="block w-full px-3 py-1.5 text-left text-[#f7768e] hover:bg-[#2a2e3f]"
                  onClick={() => {
                    removeNode(menu.nodeId)
                    setMenu(null)
                  }}
                >
                  🗑 削除
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

export default function App() {
  const init = useGraphStore((s) => s.init)
  const saveActive = useGraphStore((s) => s.saveActive)
  const initedRef = useRef(false)

  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    void init()
  }, [init])

  // Ctrl+S で保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveActive()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveActive])

  return (
    <ReactFlowProvider>
      <div className="flex h-screen w-screen flex-col bg-[#0f1115] text-[#c0caf5]">
        <ModelBar />
        <div className="flex flex-1 overflow-hidden">
          <WorkspacePanel />
          <main className="relative flex-1">
            <Canvas />
          </main>
          <aside className="w-96 overflow-y-auto border-l border-[#2a2e3f] bg-[#16171f] p-3">
            <CompilePanel />
          </aside>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
