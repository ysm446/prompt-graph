import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { DEFAULT_VISIBILITY_PROMPT } from '@shared/prompts'

// 設定編集パネル。現状は可視性フィルタのシステムプロンプト（編集可）。
export function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
  }, [])

  if (!settings) return <div className="w-96 text-xs text-[#565f89]">読み込み中…</div>

  const update = (patch: Partial<AppSettings>) => {
    setSettings({ ...settings, ...patch })
    setSaved(false)
  }

  async function save() {
    if (!settings) return
    await window.api.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="flex w-96 flex-col gap-2 text-xs text-[#c0caf5]">
      <div className="font-semibold text-[#7aa2f7]">設定</div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-[#565f89]">
          可視性フィルタ システムプロンプト
        </span>
        <button
          className="text-[10px] text-[#565f89] hover:text-[#c0caf5]"
          onClick={() => update({ visibilityPrompt: DEFAULT_VISIBILITY_PROMPT })}
        >
          既定に戻す
        </button>
      </div>
      <textarea
        className="h-64 resize-none rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1 text-[11px] leading-relaxed text-[#c0caf5] outline-none focus:border-[#7aa2f7]"
        value={settings.visibilityPrompt}
        onChange={(e) => update({ visibilityPrompt: e.target.value })}
      />
      <p className="text-[10px] text-[#565f89]">
        ※ 出力は「除去タグの JSON 配列のみ」というルールは残してください（崩れたら「既定に戻す」で復元）。
      </p>

      <div className="flex items-center gap-2">
        <button
          className="rounded bg-[#7aa2f7] px-3 py-1 font-semibold text-[#11131a] hover:opacity-90"
          onClick={save}
        >
          保存
        </button>
        {saved && <span className="text-[10px] text-[#9ece6a]">保存しました</span>}
      </div>
    </div>
  )
}
