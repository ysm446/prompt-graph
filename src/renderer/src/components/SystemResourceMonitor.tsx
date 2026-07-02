import { useEffect, useState } from 'react'
import type { SystemResources } from '@shared/types'

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}`
}

function Bar({ label, percent, detail }: { label: string; percent: number; detail: string }) {
  const color = percent > 85 ? '#f7768e' : percent > 60 ? '#e0af68' : '#9ece6a'
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 text-[9px] text-[#565f89]">{label}</span>
      <div className="h-[3px] w-16 overflow-hidden rounded-full bg-[#2a2e3f]">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
      </div>
      <span className="whitespace-nowrap text-[9px] text-[#565f89]">{detail}</span>
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
    <div className="flex items-center gap-2.5">
      <Bar label="CPU" percent={res.cpu} detail={`${res.cpu}%`} />
      <Bar label="RAM" percent={memPct} detail={`${gb(res.memUsed)}/${gb(res.memTotal)} GB`} />
      {res.gpu && (
        <>
          <Bar label="GPU" percent={res.gpu.util} detail={`${res.gpu.util}%`} />
          <Bar
            label="VRAM"
            percent={
              res.gpu.memTotal > 0 ? Math.round((res.gpu.memUsed / res.gpu.memTotal) * 100) : 0
            }
            detail={`${(res.gpu.memUsed / 1024).toFixed(1)}/${(res.gpu.memTotal / 1024).toFixed(1)} GB`}
          />
        </>
      )}
    </div>
  )
}
