import { useState } from 'react'
import { Plus, Save, X } from 'lucide-react'
import { useGraphStore } from '../store/graphStore'

export function WorkspacePanel() {
  const workspaces = useGraphStore((s) => s.workspaces)
  const activeId = useGraphStore((s) => s.activeId)
  const dirty = useGraphStore((s) => s.dirty)
  const activeName = useGraphStore((s) => s.name)
  const switchWorkspace = useGraphStore((s) => s.switchWorkspace)
  const createWorkspace = useGraphStore((s) => s.createWorkspace)
  const saveActive = useGraphStore((s) => s.saveActive)
  const renameWorkspace = useGraphStore((s) => s.renameWorkspace)
  const deleteWorkspace = useGraphStore((s) => s.deleteWorkspace)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const beginRename = (id: string, current: string) => {
    setRenamingId(id)
    setDraft(current)
  }
  const commitRename = () => {
    if (renamingId) void renameWorkspace(renamingId, draft.trim() || 'untitled')
    setRenamingId(null)
  }

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
              className={`group mx-1 mb-0.5 flex items-center gap-1 rounded px-2 py-1.5 ${
                isActive ? 'bg-[#2a2e3f]' : 'hover:bg-[#1f2230]'
              }`}
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
                onClick={() => {
                  if (confirm(`「${displayName}」を削除しますか？`)) void deleteWorkspace(ws.id)
                }}
                title="削除"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="border-t border-[#2a2e3f] px-3 py-2 text-[10px] text-[#565f89]">
        ダブルクリックで名前変更 / Ctrl+S で保存
      </div>
    </aside>
  )
}
