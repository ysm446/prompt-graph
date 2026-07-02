import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Save, X } from 'lucide-react'
import { useGraphStore } from '../store/graphStore'

interface WsMenu {
  id: string
  name: string
  isActive: boolean
  x: number
  y: number
}

export function WorkspacePanel() {
  const workspaces = useGraphStore((s) => s.workspaces)
  const activeId = useGraphStore((s) => s.activeId)
  const dirty = useGraphStore((s) => s.dirty)
  const activeName = useGraphStore((s) => s.name)
  const switchWorkspace = useGraphStore((s) => s.switchWorkspace)
  const createWorkspace = useGraphStore((s) => s.createWorkspace)
  const duplicateWorkspace = useGraphStore((s) => s.duplicateWorkspace)
  const saveActive = useGraphStore((s) => s.saveActive)
  const renameWorkspace = useGraphStore((s) => s.renameWorkspace)
  const deleteWorkspace = useGraphStore((s) => s.deleteWorkspace)
  const reorderWorkspaces = useGraphStore((s) => s.reorderWorkspaces)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<WsMenu | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const handleDrop = (targetId: string) => {
    setOverId(null)
    if (!dragId || dragId === targetId) return
    const ids = workspaces.map((w) => w.id).filter((id) => id !== dragId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, dragId) // ターゲットの前に挿入
    setDragId(null)
    void reorderWorkspaces(ids)
  }

  const beginRename = (id: string, current: string) => {
    setRenamingId(id)
    setDraft(current)
  }
  const commitRename = () => {
    if (renamingId) void renameWorkspace(renamingId, draft.trim() || 'untitled')
    setRenamingId(null)
  }

  const remove = (id: string, name: string) => {
    if (confirm(`「${name}」を削除しますか？`)) void deleteWorkspace(id)
  }

  // メニューの外側クリックで閉じる
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  return (
    <aside className="flex w-60 flex-col border-r border-[#2a2e3f] bg-[#16171f] text-xs text-[#c0caf5]">
      <div className="flex items-center justify-between border-b border-[#2a2e3f] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#565f89]">
          ワークスペース
        </span>
        <button
          className="flex items-center rounded border border-[#2a2e3f] p-1 hover:border-[#7aa2f7]"
          onClick={() => void createWorkspace()}
          title="新規ワークスペース"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {workspaces.length === 0 && (
          <p className="px-3 py-2 text-[10px] text-[#565f89]">ワークスペースがありません</p>
        )}
        {workspaces.map((ws) => {
          const isActive = ws.id === activeId
          const displayName = isActive ? activeName : ws.name
          return (
            <div
              key={ws.id}
              draggable={renamingId !== ws.id}
              onDragStart={() => setDragId(ws.id)}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (overId !== ws.id) setOverId(ws.id)
              }}
              onDrop={() => handleDrop(ws.id)}
              className={`group mx-1 mb-0.5 flex items-center gap-1 rounded px-2 py-1.5 ${
                isActive ? 'bg-[#2a2e3f]' : 'hover:bg-[#1f2230]'
              } ${dragId === ws.id ? 'opacity-40' : ''} ${
                overId === ws.id && dragId && dragId !== ws.id
                  ? 'shadow-[inset_0_2px_0_0_#7aa2f7]'
                  : ''
              }`}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: ws.id, name: displayName, isActive, x: e.clientX, y: e.clientY })
              }}
            >
              {renamingId === ws.id ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded border border-[#7aa2f7] bg-[#11131a] px-1 py-0.5 outline-none"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  onClick={() => void switchWorkspace(ws.id)}
                  onDoubleClick={() => beginRename(ws.id, displayName)}
                  title={displayName}
                >
                  {displayName}
                  {isActive && dirty && <span className="ml-1 text-[#e0af68]">•</span>}
                </button>
              )}

              {/* 保存ボタン（各ワークスペースに表示。編集中のアクティブのみ有効） */}
              <button
                className={`flex items-center rounded p-1 ${
                  isActive
                    ? dirty
                      ? 'text-[#7aa2f7] hover:bg-[#3a3f55]'
                      : 'text-[#565f89] hover:bg-[#3a3f55]'
                    : 'text-[#3a3f55]'
                }`}
                onClick={() => isActive && void saveActive()}
                disabled={!isActive}
                title={isActive ? '保存' : '（アクティブなワークスペースのみ保存）'}
              >
                <Save size={13} />
              </button>

              {/* 削除 */}
              <button
                className="flex items-center rounded p-1 text-[#565f89] opacity-0 hover:bg-[#3a3f55] hover:text-[#f7768e] group-hover:opacity-100"
                onClick={() => remove(ws.id, displayName)}
                title="削除"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-[#2a2e3f] px-3 py-2 text-[10px] text-[#565f89]">
        ドラッグで並べ替え / 右クリックでメニュー / ダブルクリックで名前変更
      </div>

      {menu &&
        createPortal(
          <div
            className="fixed z-[100] min-w-36 rounded-[8px] border border-[#2a2e3f] bg-[#1b1d27] p-1 text-xs text-[#c0caf5] shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="block w-full rounded-[6px] px-3 py-1.5 text-left hover:bg-white/5"
              onClick={() => {
                beginRename(menu.id, menu.name)
                setMenu(null)
              }}
            >
              名前変更
            </button>
            <button
              className="block w-full rounded-[6px] px-3 py-1.5 text-left hover:bg-white/5"
              onClick={() => {
                void duplicateWorkspace(menu.id)
                setMenu(null)
              }}
            >
              複製
            </button>
            {menu.isActive && (
              <button
                className="block w-full rounded-[6px] px-3 py-1.5 text-left hover:bg-white/5"
                onClick={() => {
                  void saveActive()
                  setMenu(null)
                }}
              >
                保存
              </button>
            )}
            <button
              className="block w-full rounded-[6px] px-3 py-1.5 text-left text-[#f7768e] hover:bg-white/5"
              onClick={() => {
                remove(menu.id, menu.name)
                setMenu(null)
              }}
            >
              削除
            </button>
          </div>,
          document.body
        )}
    </aside>
  )
}
