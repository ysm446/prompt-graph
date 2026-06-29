import { useEffect, useMemo, useState } from 'react'
import type {
  LlamaInstall,
  LlamaInstallProgress,
  LlamaRelease,
  LlamaReleaseVariant
} from '@shared/types'

function fmtMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

// llama.cpp ランタイム（llama-server.exe）のダウンロード・展開 UI。
export function RuntimeInstall({ onInstalled }: { onInstalled?: (i: LlamaInstall) => void }) {
  const [install, setInstall] = useState<LlamaInstall | null>(null)
  const [releases, setReleases] = useState<LlamaRelease[]>([])
  const [loadingReleases, setLoadingReleases] = useState(false)
  const [selectedVariantKey, setSelectedVariantKey] = useState('')
  const [progress, setProgress] = useState<LlamaInstallProgress | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getInstall().then(setInstall)
    return window.api.onInstallProgress(setProgress)
  }, [])

  const variants = useMemo(() => {
    const map = new Map<string, LlamaReleaseVariant>()
    for (const r of releases) for (const v of r.variants) map.set(v.key, v)
    return map
  }, [releases])

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
    const variant = variants.get(selectedVariantKey)
    if (!variant) return
    setInstalling(true)
    setError(null)
    setProgress(null)
    try {
      const result = await window.api.installVariant(variant)
      setInstall(result)
      onInstalled?.(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  return (
    <div className="flex w-80 flex-col gap-2 text-xs text-[#c0caf5]">
      <div className="font-semibold text-[#7aa2f7]">llama.cpp ランタイム</div>
      {install ? (
        <p className="text-[#9ece6a]">
          導入済み: {install.build ?? 'unknown'}
          <br />
          <span className="break-all text-[10px] text-[#565f89]">{install.path}</span>
        </p>
      ) : (
        <p className="text-[#565f89]">未インストール。お使いの GPU に合うビルドを取得してください。</p>
      )}

      <button
        className="rounded bg-[#2a2e3f] py-1 hover:bg-[#3a3f55] disabled:opacity-50"
        onClick={loadReleases}
        disabled={loadingReleases}
      >
        {loadingReleases ? '取得中…' : 'リリースを取得 (GitHub)'}
      </button>

      {releases.length > 0 && (
        <>
          <select
            className="rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1"
            value={selectedVariantKey}
            onChange={(e) => setSelectedVariantKey(e.target.value)}
          >
            {releases.map((r) => (
              <optgroup key={r.tag} label={r.tag}>
                {r.variants.map((v) => (
                  <option key={v.key} value={v.key}>
                    {v.label} ({fmtMB(v.sizeBytes)})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            className="rounded bg-[#7aa2f7] py-1 font-semibold text-[#11131a] hover:opacity-90 disabled:opacity-50"
            onClick={doInstall}
            disabled={installing || !selectedVariantKey}
          >
            {installing ? 'インストール中…' : 'インストール'}
          </button>
        </>
      )}

      {progress && (
        <p className="text-[10px] text-[#7dcfff]">
          {progress.phase === 'download' && `DL ${progress.fileLabel}: ${progress.percent ?? '?'}%`}
          {progress.phase === 'extract' && `展開中: ${progress.fileLabel}`}
          {progress.phase === 'done' && '完了'}
          {progress.phase === 'error' && `エラー: ${progress.message}`}
        </p>
      )}
      {error && <p className="text-[10px] text-[#f7768e]">{error}</p>}
    </div>
  )
}
