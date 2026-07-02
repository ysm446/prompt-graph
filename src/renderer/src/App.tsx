import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  ConnectionLineType,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type OnSelectionChangeParams
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { NodeKind } from '@shared/types'
import { ACCENT, nodeTypes } from './graph/nodes'
import { edgeTypes } from './graph/edges'
import { NODE_LABELS, SCENE_INPUTS } from './graph/factory'
import { useGraphStore } from './store/graphStore'
import { CompilePanel } from './components/CompilePanel'
import { ModelBar } from './components/ModelBar'
import { WorkspacePanel } from './components/WorkspacePanel'
import { SystemResourceMonitor } from './components/SystemResourceMonitor'

const ADD_ORDER: NodeKind[] = [
  'character',
  'soloAction',
  'interaction',
  'background',
  'lighting',
  'camera',
  'quality',
  'style',
  'seed',
  'reference',
  'scene',
  'batch'
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
        className="flex items-center gap-1 rounded-[10px] border border-[var(--border-strong)] bg-[rgba(17,19,24,0.9)] px-2.5 py-1.5 text-xs text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={14} /> ノード追加 <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-40 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-1 text-xs shadow-2xl">
          {ADD_ORDER.map((kind) => (
            <button
              key={kind}
              className="block w-full rounded-[8px] px-3 py-1.5 text-left text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]"
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
  const [showMinimap, setShowMinimap] = useState(true)

  // 設定（ミニマップ表示）を読み込み、保存時の pg-settings で更新
  useEffect(() => {
    const load = (): void => {
      window.api.getSettings().then((s) => setShowMinimap(s.showMinimap))
    }
    load()
    window.addEventListener('pg-settings', load)
    return () => window.removeEventListener('pg-settings', load)
  }, [])

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

  // ピンの種別に合わない接続を弾く（誤接続防止）
  const isValidConnection = useCallback(
    (c: { source: string | null; target: string | null; targetHandle?: string | null }) => {
      const all = useGraphStore.getState().nodes
      const source = all.find((n) => n.id === c.source)
      const target = all.find((n) => n.id === c.target)
      if (!source || !target) return true
      if (target.type === 'scene') {
        const pin = SCENE_INPUTS.find((p) => p.id === c.targetHandle)
        return pin ? pin.kinds.includes(source.type as NodeKind) : true
      }
      // soloAction の charIn は Character のみ
      if (target.type === 'soloAction' && c.targetHandle === 'charIn') {
        return source.type === 'character'
      }
      // Batch の入力は Scene のみ
      if (target.type === 'batch') {
        return source.type === 'scene'
      }
      return true
    },
    []
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
        isValidConnection={isValidConnection}
        fitView
        deleteKeyCode={['Delete', 'Backspace']}
        connectionRadius={45}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={{ interactionWidth: 28 }}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#6a728f', strokeWidth: 2.6, opacity: 0.84 }}
        style={{ backgroundColor: 'var(--bg-canvas)' }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-left">
          <AddNodePanel />
        </Panel>
        <Background color="#394154" gap={20} size={1.4} />
        {showMinimap && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => `${ACCENT[n.type as NodeKind] ?? '#3f4150'}59`}
            nodeStrokeColor="none"
          />
        )}
      </ReactFlow>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} onContextMenu={(e) => e.preventDefault()} />
          <div
            className="fixed z-50 min-w-44 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-1 text-xs text-[var(--text)] shadow-2xl"
            style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 320) }}
          >
            {menu.kind === 'pane' ? (
              <>
                <div className="px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  ノードを追加
                </div>
                {ADD_ORDER.map((kind) => (
                  <button
                    key={kind}
                    className="block w-full rounded-[8px] px-3 py-1.5 text-left text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]"
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
                <div className="truncate px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                  {menu.label}
                </div>
                <button
                  className="flex w-full items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-left text-[var(--danger)] hover:bg-white/5"
                  onClick={() => {
                    removeNode(menu.nodeId)
                    setMenu(null)
                  }}
                >
                  <Trash2 size={13} /> 削除
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
      <div className="flex h-screen w-screen flex-col bg-[var(--bg)] text-[var(--text)]">
        <ModelBar />
        <div className="flex flex-1 overflow-hidden">
          <WorkspacePanel />
          <main className="relative flex-1">
            <Canvas />
          </main>
          <aside className="w-96 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-sidebar)] p-3">
            <CompilePanel />
          </aside>
        </div>
        {/* 下部ステータスバー（右端にシステムリソース） */}
        <footer className="flex h-6 shrink-0 items-center justify-end border-t border-[var(--border)] bg-[var(--bg-sidebar)] px-3">
          <SystemResourceMonitor />
        </footer>
      </div>
    </ReactFlowProvider>
  )
}
