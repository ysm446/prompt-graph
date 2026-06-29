import { useEffect, useState } from 'react'
import type { SystemResources } from '@shared/types'

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}`
}

function Bar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const color = percent > 85 ? '#f7768e' : percent > 60 ? '#e0af68' : '#9ece6a'
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 text-[9px] text-[#565f89]">{label}</span>
      <div className="h-1.5 w-16 overflow-hidden rounded bg-[#2a2e3f]">
        <div className="h-full rounded" style={{ width: `${percent}%`, background: color }} />
      </div>
      <span className="w-24 text-[9px] text-[#565f89]">{detail}</span>
    </div>
  )
}

// lm-graph 風のシステムリソース表示。設定 showResources でオンオフ。
export function SystemResourceMonitor() {
  const [enabled, setEnabled] = useState(false)
  const [res, setRes] = useState<SystemResources | null>(null)

  // 設定の読み込み（保存時に発火する pg-settings イベントで再読込）
  useEffect(() => {
    const load = (): void => {
      window.api.getSettings().then((s) => setEnabled(s.showResources))
    }
    load()
    window.addEventListener('pg-settings', load)
    return () => window.removeEventListener('pg-settings', load)
  }, [])

  // 有効時のみポーリング
  useEffect(() => {
    if (!enabled) {
      setRes(null)
      return
    }
    let alive = true
    const tick = async (): Promise<void> => {
      const r = await window.api.getSystemResources()
      if (alive) setRes(r)
    }
    tick()
    const id = setInterval(tick, 1500)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [enabled])

  if (!enabled || !res) return null

  const memPct = res.memTotal > 0 ? Math.round((res.memUsed / res.memTotal) * 100) : 0

  return (
    <div className="flex items-center gap-3">
      <Bar label="CPU" percent={res.cpu} detail={`${res.cpu}%`} />
      <Bar label="RAM" percent={memPct} detail={`${gb(res.memUsed)}/${gb(res.memTotal)} GB`} />
      {res.gpu && (
        <Bar
          label="GPU"
          percent={res.gpu.util}
          detail={`${res.gpu.util}% ${(res.gpu.memUsed / 1024).toFixed(1)}/${(res.gpu.memTotal / 1024).toFixed(1)}G`}
        />
      )}
    </div>
  )
}
