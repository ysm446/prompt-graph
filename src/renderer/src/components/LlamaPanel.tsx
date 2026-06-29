import { useEffect, useMemo, useState } from 'react'
import type {
  LlamaInstall,
  LlamaInstallProgress,
  LlamaModel,
  LlamaRelease,
  LlamaReleaseVariant,
  LlamaServerStatus
} from '@shared/types'

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

export function LlamaPanel() {
  const [install, setInstall] = useState<LlamaInstall | null>(null)
  const [releases, setReleases] = useState<LlamaRelease[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [selectedVariantKey, setSelectedVariantKey] = useState<string>('')
  const [progress, setProgress] = useState<LlamaInstallProgress | null>(null)
  const [installing, setInstalling] = useState(false)
  const [models, setModels] = useState<LlamaModel[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [status, setStatus] = useState<LlamaServerStatus>({
    state: 'stopped',
    baseUrl: null,
    modelPath: null,
    message: null
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getInstall().then(setInstall)
    window.api.getServerStatus().then(setStatus)
    refreshModels()
    const off1 = window.api.onInstallProgress(setProgress)
    const off2 = window.api.onServerStatus(setStatus)
    return () => {
      off1()
      off2()
    }
  }, [])

  const variants = useMemo(() => {
    const map = new Map<string, { release: LlamaRelease; variant: LlamaReleaseVariant }>()
    for (const r of releases) for (const v of r.variants) map.set(v.key, { release: r, variant: v })
    return map
  }, [releases])

  async function refreshModels() {
    const list = await window.api.listModels()
    setModels(list)
    if (list.length && !selectedModel) setSelectedModel(list[0].path)
  }

  async function loadReleases() {
    setLoadingReleases(true)
    setError(null)
    try {
      const r = await window.api.fetchReleases(6)
      setReleases(r)
      const first = r[0]?.variants[0]?.key
      if (first) setSelectedVariantKey(first)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingReleases(false)
    }
  }

  async function doInstall() {
    const entry = variants.get(selectedVariantKey)
    if (!entry) return
    setInstalling(true)
    setError(null)
    setProgress(null)
    try {
      const result = await window.api.installVariant(entry.variant)
      setInstall(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  async function toggleServer() {
    setError(null)
    try {
      if (status.state === 'running' || status.state === 'starting') {
        await window.api.stopServer()
      } else {
        const model = models.find((m) => m.path === selectedModel)
        if (!model) {
          setError('モデルを選択してください')
          return
        }
        await window.api.startServer(model.path, model.mmprojPath)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const stateColor =
    status.state === 'running'
      ? '#9ece6a'
      : status.state === 'starting'
        ? '#e0af68'
        : status.state === 'error'
          ? '#f7768e'
          : '#565f89'

  return (
    <div className="flex flex-col gap-3 text-xs text-[#c0caf5]">
      <h2 className="text-sm font-semibold">llama.cpp</h2>

      {/* Install */}
      <section className="rounded border border-[#2a2e3f] p-2">
        <div className="mb-1 font-semibold text-[#7aa2f7]">ランタイム</div>
        {install ? (
          <p className="text-[#9ece6a]">
            導入済み: {install.build ?? 'unknown'}
            <br />
            <span className="break-all text-[10px] text-[#565f89]">{install.path}</span>
          </p>
        ) : (
          <p className="text-[#565f89]">未インストール</p>
        )}

        <button
          className="mt-2 w-full rounded bg-[#2a2e3f] py-1 hover:bg-[#3a3f55] disabled:opacity-50"
          onClick={loadReleases}
          disabled={loadingReleases}
        >
          {loadingReleases ? '取得中…' : 'リリースを取得 (GitHub)'}
        </button>

        {releases.length > 0 && (
          <>
            <select
              className="mt-2 w-full rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1"
              value={selectedVariantKey}
              onChange={(e) => setSelectedVariantKey(e.target.value)}
            >
              {releases.map((r) => (
                <optgroup key={r.tag} label={`${r.tag}`}>
                  {r.variants.map((v) => (
                    <option key={v.key} value={v.key}>
                      {v.label} ({fmtMB(v.sizeBytes)})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              className="mt-2 w-full rounded bg-[#7aa2f7] py-1 font-semibold text-[#11131a] hover:opacity-90 disabled:opacity-50"
              onClick={doInstall}
              disabled={installing || !selectedVariantKey}
            >
              {installing ? 'インストール中…' : 'インストール'}
            </button>
          </>
        )}

        {progress && (
          <p className="mt-2 text-[10px] text-[#7dcfff]">
            {progress.phase === 'download' &&
              `DL ${progress.fileLabel}: ${progress.percent ?? '?'}%`}
            {progress.phase === 'extract' && `展開中: ${progress.fileLabel}`}
            {progress.phase === 'done' && '完了'}
            {progress.phase === 'error' && `エラー: ${progress.message}`}
          </p>
        )}
      </section>

      {/* Model + server */}
      <section className="rounded border border-[#2a2e3f] p-2">
        <div className="mb-1 flex items-center justify-between font-semibold text-[#7aa2f7]">
          <span>モデル</span>
          <button className="text-[10px] text-[#565f89] hover:text-[#c0caf5]" onClick={refreshModels}>
            ⟳ 再読込
          </button>
        </div>
        {models.length === 0 ? (
          <p className="text-[#565f89]">models/ に GGUF がありません</p>
        ) : (
          <select
            className="w-full rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
          >
            {models.map((m) => (
              <option key={m.path} value={m.path}>
                {m.fileName} {m.quant ?? ''} {m.hasVision ? '👁' : ''}
              </option>
            ))}
          </select>
        )}

        <div className="mt-2 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: stateColor }} />
          <span className="text-[10px] text-[#565f89]">{status.state}</span>
          {status.baseUrl && <span className="text-[10px] text-[#565f89]">{status.baseUrl}</span>}
        </div>

        <button
          className="mt-2 w-full rounded bg-[#2a2e3f] py-1 hover:bg-[#3a3f55] disabled:opacity-50"
          onClick={toggleServer}
          disabled={!install || (status.state !== 'running' && models.length === 0)}
        >
          {status.state === 'running' || status.state === 'starting' ? 'サーバ停止' : 'サーバ起動'}
        </button>
      </section>

      {error && <p className="text-[10px] text-[#f7768e]">{error}</p>}
      <p className="text-[10px] text-[#565f89]">
        ※ 可視性フィルタ・参照分解で使用予定。現マイルストーンでは「インストールできること」が目標。
      </p>
    </div>
  )
}
