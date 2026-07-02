import { useEffect, useState } from 'react'
import type { ForgeInstall, ForgeInstallProgress, ForgeServerStatus } from '@shared/types'

const STATE_LABEL: Record<ForgeServerStatus['state'], string> = {
  stopped: '停止中',
  starting: '起動中…',
  running: '稼働中',
  error: 'エラー'
}

// WebUI Forge の取得（git clone）と起動・停止 UI。
// llama の RuntimeInstall 相当。txt2img 連携は後続フェーズ。
export function ForgePanel({ onInstalled }: { onInstalled?: (i: ForgeInstall) => void }) {
  const [install, setInstall] = useState<ForgeInstall | null>(null)
  const [progress, setProgress] = useState<ForgeInstallProgress | null>(null)
  const [installing, setInstalling] = useState(false)
  const [status, setStatus] = useState<ForgeServerStatus>({
    state: 'stopped',
    url: null,
    message: null
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.getForgeInstall().then(setInstall)
    window.api.getForgeStatus().then(setStatus)
    const offP = window.api.onForgeInstallProgress(setProgress)
    const offS = window.api.onForgeStatus(setStatus)
    return () => {
      offP()
      offS()
    }
  }, [])

  async function doInstall() {
    setInstalling(true)
    setError(null)
    setProgress(null)
    try {
      const result = await window.api.installForge()
      setInstall(result)
      onInstalled?.(result)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setInstalling(false)
    }
  }

  async function start() {
    setError(null)
    setBusy(true)
    try {
      await window.api.startForge()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setError(null)
    setBusy(true)
    try {
      await window.api.stopForge()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const running = status.state === 'running'
  const starting = status.state === 'starting' || busy

  return (
    <div className="flex w-80 flex-col gap-2 text-xs text-[#c0caf5]">
      <div className="font-semibold text-[#7aa2f7]">WebUI Forge</div>

      {install ? (
        <p className="text-[#9ece6a]">
          導入済み
          <br />
          <span className="break-all text-[10px] text-[#565f89]">{install.path}</span>
        </p>
      ) : (
        <p className="text-[#565f89]">
          未インストール。GitHub から clone します（git と Python 3.10 が必要。初回起動時に
          venv/torch を自動構築します）。
        </p>
      )}

      {!install && (
        <button
          className="rounded bg-[#7aa2f7] py-1 font-semibold text-[#11131a] hover:opacity-90 disabled:opacity-50"
          onClick={doInstall}
          disabled={installing}
        >
          {installing ? 'clone 中…' : 'インストール (git clone)'}
        </button>
      )}

      {progress && !install && (
        <p className="text-[10px] text-[#7dcfff]">
          {progress.phase === 'clone' && `${progress.label}: ${progress.percent ?? '?'}%`}
          {progress.phase === 'done' && '完了'}
          {progress.phase === 'error' && `エラー: ${progress.message}`}
        </p>
      )}

      {install && (
        <>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-[#565f89]">状態:</span>
            <span
              className={
                running
                  ? 'text-[#9ece6a]'
                  : status.state === 'error'
                    ? 'text-[#f7768e]'
                    : 'text-[#e0af68]'
              }
            >
              {STATE_LABEL[status.state]}
            </span>
            {status.url && <span className="text-[10px] text-[#565f89]">{status.url}</span>}
          </div>

          <div className="flex gap-2">
            <button
              className="flex-1 rounded bg-[#2a2e3f] py-1 hover:bg-[#3a3f55] disabled:opacity-50"
              onClick={start}
              disabled={starting || running}
            >
              {starting ? '起動中…' : '起動'}
            </button>
            <button
              className="flex-1 rounded bg-[#2a2e3f] py-1 hover:bg-[#3a3f55] disabled:opacity-50"
              onClick={stop}
              disabled={status.state === 'stopped'}
            >
              停止
            </button>
          </div>
          {status.state === 'starting' && (
            <p className="text-[10px] text-[#565f89]">
              初回は venv 構築と torch のダウンロードで数分〜十数分かかります。
            </p>
          )}
        </>
      )}

      {status.state === 'error' && status.message && (
        <p className="text-[10px] text-[#f7768e]">{status.message}</p>
      )}
      {error && <p className="text-[10px] text-[#f7768e]">{error}</p>}
    </div>
  )
}
