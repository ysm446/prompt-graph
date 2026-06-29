import { useEffect, useRef, useState } from 'react'
import type { LlamaInstall, LlamaModel, LlamaServerStatus } from '@shared/types'
import { RuntimeInstall } from './RuntimeInstall'

const STATE_COLOR: Record<LlamaServerStatus['state'], string> = {
  running: '#9ece6a',
  starting: '#e0af68',
  error: '#f7768e',
  stopped: '#565f89'
}

const STATE_LABEL: Record<LlamaServerStatus['state'], string> = {
  running: 'ロード済み',
  starting: 'ロード中…',
  error: 'エラー',
  stopped: '未ロード'
}

// 上部バー: モデルのロード（lm-graph のモデルセレクタ相当）。
export function ModelBar() {
  const [install, setInstall] = useState<LlamaInstall | null>(null)
  const [models, setModels] = useState<LlamaModel[]>([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState<LlamaServerStatus>({
    state: 'stopped',
    baseUrl: null,
    modelPath: null,
    message: null
  })
  const [busy, setBusy] = useState(false)
  const [showRuntime, setShowRuntime] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runtimeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getInstall().then(setInstall)
    window.api.getServerStatus().then(setStatus)
    refreshModels()
    return window.api.onServerStatus(setStatus)
  }, [])

  // ランタイムポップオーバーの外側クリックで閉じる
  useEffect(() => {
    if (!showRuntime) return
    const onClick = (e: MouseEvent) => {
      if (runtimeRef.current && !runtimeRef.current.contains(e.target as Node)) setShowRuntime(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [showRuntime])

  async function refreshModels() {
    const list = await window.api.listModels()
    setModels(list)
    setSelected((prev) => prev || list[0]?.path || '')
  }

  const running = status.state === 'running' || status.state === 'starting'

  async function toggleLoad() {
    setError(null)
    setBusy(true)
    try {
      if (running) {
        await window.api.stopServer()
      } else {
        const model = models.find((m) => m.path === selected)
        if (!model) {
          setError('モデルを選択してください')
          return
        }
        await window.api.startServer(model.path, model.mmprojPath)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="relative z-30 flex h-12 items-center gap-3 border-b border-[#2a2e3f] bg-[#16171f] px-4 text-xs text-[#c0caf5]">
      {/* left: 中央寄せのための空スペーサー（右の runtime と均等幅） */}
      <div className="flex-1" />

      {/* center: モデル選択バー */}
      <div className="flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-wide text-[#565f89]">モデル</span>
      <select
        className="min-w-56 rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1 disabled:opacity-50"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={running || models.length === 0}
      >
        {models.length === 0 ? (
          <option value="">models/ に GGUF がありません</option>
        ) : (
          models.map((m) => (
            <option key={m.path} value={m.path}>
              {m.fileName} {m.quant ?? ''} {m.hasVision ? '👁' : ''}
            </option>
          ))
        )}
      </select>
      <button
        className="rounded px-1 text-[#565f89] hover:text-[#c0caf5]"
        onClick={refreshModels}
        title="モデル一覧を再読込"
      >
        ⟳
      </button>

      {/* load / eject */}
      <button
        className="rounded bg-[#7aa2f7] px-3 py-1 font-semibold text-[#11131a] hover:opacity-90 disabled:opacity-50"
        onClick={toggleLoad}
        disabled={busy || !install || (!running && models.length === 0)}
      >
        {running ? 'Eject' : 'Load'}
      </button>

      {/* status */}
      <span className="ml-1 inline-flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: STATE_COLOR[status.state] }} />
        <span className="text-[10px] text-[#565f89]">{STATE_LABEL[status.state]}</span>
        {status.baseUrl && status.state === 'running' && (
          <span className="text-[10px] text-[#565f89]">{status.baseUrl}</span>
        )}
      </span>

      {error && <span className="text-[10px] text-[#f7768e]">{error}</span>}
      </div>

      {/* right: runtime install（左の title と均等幅にして中央を真ん中へ） */}
      <div className="flex flex-1 items-center justify-end">
        <div className="relative" ref={runtimeRef}>
          <button
            className={`rounded border px-2 py-1 ${
              install ? 'border-[#2a2e3f] text-[#c0caf5]' : 'border-[#e0af68] text-[#e0af68]'
            } hover:border-[#7aa2f7]`}
            onClick={() => setShowRuntime((v) => !v)}
          >
            {install ? '⚙ ランタイム' : '⚠ ランタイム未導入'}
          </button>
          {showRuntime && (
            <div className="absolute right-0 top-full z-50 mt-1 rounded-md border border-[#2a2e3f] bg-[#1a1b26] p-3 shadow-2xl">
              <RuntimeInstall onInstalled={(i) => setInstall(i)} />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
