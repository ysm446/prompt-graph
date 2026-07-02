import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, Cpu, ImageIcon, Loader2, RefreshCw, Settings } from 'lucide-react'
import type { LlamaInstall, LlamaModel, LlamaServerStatus } from '@shared/types'
import { RuntimeInstall } from './RuntimeInstall'
import { ForgePanel } from './ForgePanel'
import { SettingsPanel } from './SettingsPanel'

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${Math.round(bytes / 1e6)} MB`
}

// 上部バー: 中央のモデルセレクタボタン + モーダルでモデル選択（lm-graph 準拠）。
// モデルをクリックすると即ロード（稼働中なら内部で stop → start）。
export function ModelBar() {
  const [install, setInstall] = useState<LlamaInstall | null>(null)
  const [models, setModels] = useState<LlamaModel[]>([])
  const [status, setStatus] = useState<LlamaServerStatus>({
    state: 'stopped',
    baseUrl: null,
    modelPath: null,
    message: null
  })
  const [busy, setBusy] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showRuntime, setShowRuntime] = useState(false)
  const [showForge, setShowForge] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const runtimeRef = useRef<HTMLDivElement>(null)
  const forgeRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getInstall().then(setInstall)
    window.api.getServerStatus().then(setStatus)
    void refreshModels()
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

  // Forge ポップオーバーの外側クリックで閉じる
  useEffect(() => {
    if (!showForge) return
    const onClick = (e: MouseEvent) => {
      if (forgeRef.current && !forgeRef.current.contains(e.target as Node)) setShowForge(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [showForge])

  // 設定ポップオーバーの外側クリックで閉じる
  useEffect(() => {
    if (!showSettings) return
    const onClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setShowSettings(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [showSettings])

  // Escape でモーダルを閉じる
  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowModal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  async function refreshModels() {
    const list = await window.api.listModels()
    setModels(list)
  }

  const loading = busy || status.state === 'starting'
  const loaded = status.state === 'running'
  const currentName = status.modelPath ? status.modelPath.replace(/^.*[\\/]/, '') : null

  const buttonLabel = loading
    ? `${currentName ?? 'モデル'} をロード中…`
    : loaded && currentName
      ? currentName
      : 'モデルを選択'

  async function openModal() {
    setError(null)
    await refreshModels()
    setShowModal(true)
  }

  async function selectModel(m: LlamaModel) {
    if (!install) {
      setError('llama.cpp ランタイムが未導入です（右上から導入）')
      return
    }
    setShowModal(false)
    setError(null)
    setBusy(true)
    try {
      await window.api.startServer(m.path, m.mmprojPath)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function eject() {
    setError(null)
    setBusy(true)
    try {
      await window.api.stopServer()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="relative z-30 flex h-12 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-sidebar)] px-4 text-xs text-[var(--text)]">
      {/* left: 中央寄せのための空スペーサー（右側と均等幅） */}
      <div className="flex-1" />

      {/* center: モデルセレクタボタン（クリックでモーダル） */}
      <div className="flex items-center gap-3">
        <button
          className={`flex min-w-[220px] max-w-[480px] items-center gap-2 rounded-[8px] border px-3.5 py-1.5 text-[13px] font-medium transition ${
            loading
              ? 'animate-pulse border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
              : loaded
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]'
                : 'border-[var(--border-strong)] bg-white/5 text-[var(--text-dim)] hover:border-[var(--accent)] hover:bg-white/10 hover:text-[var(--text)]'
          }`}
          onClick={() => void openModal()}
        >
          <span className="flex w-4 shrink-0 justify-center">
            <Cpu size={15} />
          </span>
          <span className="min-w-0 flex-1 truncate text-center">{buttonLabel}</span>
          <span className="flex w-4 shrink-0 justify-center">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={12} />}
          </span>
        </button>
        {status.state === 'error' && (
          <span className="max-w-64 truncate text-[10px] text-[var(--danger)]" title={status.message ?? ''}>
            {status.message ?? 'エラー'}
          </span>
        )}
        {error && <span className="max-w-64 truncate text-[10px] text-[var(--danger)]">{error}</span>}
      </div>

      {/* right: runtime install / settings */}
      <div className="flex flex-1 items-center justify-end gap-1.5">
        <div className="relative" ref={runtimeRef}>
          <button
            className={`flex items-center gap-1 rounded-[8px] border px-2 py-1 transition ${
              install
                ? 'border-[var(--border-strong)] text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]'
                : 'border-[#e0af68] text-[#e0af68] hover:bg-white/5'
            }`}
            onClick={() => setShowRuntime((v) => !v)}
          >
            {install ? <Settings size={13} /> : <AlertTriangle size={13} />}
            {install ? 'ランタイム' : 'ランタイム未導入'}
          </button>
          {showRuntime && (
            <div className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-3 shadow-2xl">
              <RuntimeInstall onInstalled={(i) => setInstall(i)} />
            </div>
          )}
        </div>

        <div className="relative" ref={forgeRef}>
          <button
            className="flex items-center gap-1 rounded-[8px] border border-[var(--border-strong)] px-2 py-1 text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
            onClick={() => setShowForge((v) => !v)}
            title="WebUI Forge"
          >
            <ImageIcon size={13} />
            Forge
          </button>
          {showForge && (
            <div className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-3 shadow-2xl">
              <ForgePanel />
            </div>
          )}
        </div>

        <div className="relative" ref={settingsRef}>
          <button
            className="flex items-center rounded-[8px] border border-[var(--border-strong)] px-2 py-1 text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
            onClick={() => setShowSettings((v) => !v)}
            title="設定"
          >
            <Settings size={14} />
          </button>
          {showSettings && (
            <div className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] p-3 shadow-2xl">
              <SettingsPanel />
            </div>
          )}
        </div>
      </div>

      {/* モデル選択モーダル（lm-graph 準拠） */}
      {showModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/35 p-6"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative w-full max-w-xl rounded-xl border border-[var(--border-strong)] bg-[var(--bg-sidebar)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  className="rounded-[10px] border border-[var(--border-strong)] p-1.5 text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]"
                  onClick={() => void refreshModels()}
                  title="モデル一覧を再読込"
                >
                  <RefreshCw size={13} />
                </button>
                {loaded && (
                  <button
                    className="rounded-[10px] border border-[var(--border-strong)] px-2.5 py-1 text-[12px] text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)] disabled:opacity-40"
                    onClick={() => void eject()}
                    disabled={loading}
                  >
                    アンロード
                  </button>
                )}
                {loaded && status.baseUrl && (
                  <span className="text-[10px] text-[var(--text-faint)]">{status.baseUrl}</span>
                )}
              </div>
              <button
                className="rounded-[10px] border border-[var(--border-strong)] px-2.5 py-1 text-[13px] text-[var(--text)] transition hover:bg-white/5"
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
            </div>

            <div className="mt-3 max-h-[360px] overflow-y-auto">
              <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)]">
                Your Models (models/)
              </div>
              {models.map((m) => {
                const isActive = (loaded || status.state === 'starting') && m.path === status.modelPath
                return (
                  <button
                    key={m.path}
                    className={`block w-full rounded-[10px] border px-3 py-2 text-left text-[12px] transition disabled:cursor-wait disabled:opacity-70 ${
                      isActive
                        ? 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]'
                        : 'border-transparent text-[var(--text-dim)] hover:border-[var(--border-strong)] hover:bg-white/5 hover:text-[var(--text)]'
                    }`}
                    onClick={() => void selectModel(m)}
                    disabled={loading}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[13px] font-semibold leading-5">
                          {m.fileName}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-faint)]">
                          {m.hasVision && (
                            <span className="rounded-[6px] border border-[rgba(124,90,247,0.35)] bg-[rgba(124,90,247,0.12)] px-2 py-0.5 font-semibold text-[var(--accent)]">
                              vision
                            </span>
                          )}
                          {isActive && <span>{status.state === 'starting' ? 'ロード中…' : 'ロード済み'}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-faint)]">
                        <span className="rounded-[7px] bg-white/5 px-2.5 py-0.5 font-semibold text-[var(--text-dim)]">
                          {m.params ?? '--'}
                        </span>
                        <span className="rounded-[7px] bg-white/5 px-2.5 py-0.5 font-semibold text-[var(--text-dim)]">
                          {m.quant ?? '--'}
                        </span>
                        <span>{formatSize(m.sizeBytes)}</span>
                      </div>
                    </div>
                  </button>
                )
              })}
              {models.length === 0 && (
                <p className="px-3 py-4 text-center text-[13px] text-[var(--text-faint)]">
                  models/ に GGUF がありません
                </p>
              )}
            </div>

            {!install && (
              <p className="mt-3 text-[12px] text-[#e0af68]">
                llama.cpp ランタイムが未導入です。右上の「ランタイム未導入」から導入してください。
              </p>
            )}
            {error && <p className="mt-3 text-[12px] text-[var(--danger)]">{error}</p>}

            {loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-[12px] border border-[var(--border-strong)] bg-[rgba(17,19,24,0.94)] px-3 py-2.5 shadow-xl">
                  <div className="inline-flex items-center gap-2.5 text-[13px] font-medium text-[var(--text)]">
                    <Loader2 size={16} className="animate-spin" />
                    <span>モデルを読み込んでいます</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
