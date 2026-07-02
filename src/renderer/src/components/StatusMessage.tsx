import { useEffect, useRef, useState } from 'react'

// 下部ステータスバー左側。保存・コピペ等のアクションを一時表示する。
export function StatusMessage() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const on = (e: Event): void => {
      setMsg((e as CustomEvent<string>).detail)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMsg(null), 2500)
    }
    window.addEventListener('pg-status', on)
    return () => {
      window.removeEventListener('pg-status', on)
      clearTimeout(timer.current)
    }
  }, [])

  if (!msg) return null
  return <span className="truncate text-[11px] text-[var(--text-dim)]">{msg}</span>
}
