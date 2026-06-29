import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import {
  Background,
  Controls,
  MiniMap,
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
import { LlamaPanel } from './components/LlamaPanel'

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

function Toolbar() {
  const addNode = useGraphStore((s) => s.addNode)
  const { screenToFlowPosition } = useReactFlow()

  const handleAdd = (kind: NodeKind) => {
    // ビューポート中央付近に少しずらして配置
    const pos = screenToFlowPosition({
      x: window.innerWidth / 2 - 120 + Math.random() * 80,
      y: 160 + Math.random() * 120
    })
    addNode(kind, pos)
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {ADD_ORDER.map((kind) => (
        <button
          key={kind}
          className="rounded border border-[#2a2e3f] bg-[#1a1b26] px-2 py-1 text-xs text-[#c0caf5] hover:border-[#7aa2f7]"
          onClick={() => handleAdd(kind)}
        >
          + {NODE_LABELS[kind]}
        </button>
      ))}
    </div>
  )
}

type Menu =
  | { kind: 'pane'; x: number; y: number; flow: { x: number; y: number } }
  | { kind: 'node'; x: number; y: number; nodeId: string; label: string }

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

  const onNodeContextMenu = useCallback(
    (e: ReactMouseEvent, node: { id: string }) => {
      e.preventDefault()
      const data = useGraphStore.getState().nodes.find((n) => n.id === node.id)?.data
      setMenu({
        kind: 'node',
        x: e.clientX,
        y: e.clientY,
        nodeId: node.id,
        label: data?.label ?? node.id
      })
    },
    []
  )

  // Esc で閉じる
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
        <Background color="#2a2e3f" gap={20} />
        <Controls />
        <MiniMap pannable zoomable className="!bg-[#1a1b26]" />
      </ReactFlow>

      {menu && (
        <>
          {/* クリックで閉じるための透明オーバーレイ */}
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
  const [tab, setTab] = useState<'compile' | 'llama'>('compile')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const loadSnapshot = useGraphStore((s) => s.loadSnapshot)
  const toSnapshot = useGraphStore((s) => s.toSnapshot)
  const markSaved = useGraphStore((s) => s.markSaved)
  const dirty = useGraphStore((s) => s.dirty)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    window.api.loadProject().then((snap) => loadSnapshot(snap))
  }, [loadSnapshot])

  const save = useCallback(async () => {
    await window.api.saveProject(toSnapshot())
    markSaved()
    setSaveMsg('保存しました')
    setTimeout(() => setSaveMsg(null), 1500)
  }, [toSnapshot, markSaved])

  // Ctrl+S で保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  return (
    <ReactFlowProvider>
      <div className="flex h-screen w-screen flex-col bg-[#0f1115] text-[#c0caf5]">
        {/* header */}
        <header className="flex items-center gap-3 border-b border-[#2a2e3f] px-4 py-2">
          <h1 className="text-sm font-bold text-[#7aa2f7]">prompt-graph</h1>
          <div className="flex-1">
            <Toolbar />
          </div>
          <button
            className="rounded bg-[#7aa2f7] px-3 py-1 text-xs font-semibold text-[#11131a] hover:opacity-90"
            onClick={save}
          >
            保存 {dirty ? '•' : ''}
          </button>
          {saveMsg && <span className="text-[10px] text-[#9ece6a]">{saveMsg}</span>}
        </header>

        {/* body */}
        <div className="flex flex-1 overflow-hidden">
          <main className="relative flex-1">
            <Canvas />
          </main>
          <aside className="w-96 overflow-y-auto border-l border-[#2a2e3f] bg-[#16171f] p-3">
            <div className="mb-3 flex gap-1">
              <button
                className={`flex-1 rounded px-2 py-1 text-xs ${tab === 'compile' ? 'bg-[#2a2e3f]' : 'bg-transparent text-[#565f89]'}`}
                onClick={() => setTab('compile')}
              >
                合成
              </button>
              <button
                className={`flex-1 rounded px-2 py-1 text-xs ${tab === 'llama' ? 'bg-[#2a2e3f]' : 'bg-transparent text-[#565f89]'}`}
                onClick={() => setTab('llama')}
              >
                llama.cpp
              </button>
            </div>
            {tab === 'compile' ? <CompilePanel /> : <LlamaPanel />}
          </aside>
        </div>
      </div>
    </ReactFlowProvider>
  )
}
