import { useEffect, useState } from 'react'
import type { AppSettings } from '@shared/types'
import { DEFAULT_VISIBILITY_PROMPT } from '@shared/prompts'

// コンテキスト長のスライダー刻み
const CTX_STEPS = [4096, 8192, 16384, 32768, 65536]
const ctxLabel = (v: number): string => `${Math.round(v / 1024)}k`
const ctxIndex = (v: number): number => {
  const i = CTX_STEPS.indexOf(v)
  if (i >= 0) return i
  // 一致しない場合は最も近い刻みへ
  let best = 0
  for (let k = 1; k < CTX_STEPS.length; k++) {
    if (Math.abs(CTX_STEPS[k] - v) < Math.abs(CTX_STEPS[best] - v)) best = k
  }
  return best
}

// 設定編集パネル。
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

  // トグル類は即保存（ポップオーバーは外側クリックで閉じるため、保存ボタン待ちだと失われる）
  const updateAndSave = (patch: Partial<AppSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    window.api.saveSettings(next).then(() => window.dispatchEvent(new Event('pg-settings')))
  }

  async function save() {
    if (!settings) return
    await window.api.saveSettings(settings)
    window.dispatchEvent(new Event('pg-settings')) // モニタ等へ反映
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="flex w-96 flex-col gap-2 text-xs text-[#c0caf5]">
      <div className="font-semibold text-[#7aa2f7]">設定</div>

      <label className="flex items-center gap-2 text-[11px] text-[#c0caf5]">
        <input
          type="checkbox"
          checked={settings.showResources}
          onChange={(e) => updateAndSave({ showResources: e.target.checked })}
        />
        システムリソースを表示（CPU / RAM / GPU）
      </label>

      <label className="flex items-center gap-2 text-[11px] text-[#c0caf5]">
        <input
          type="checkbox"
          checked={settings.showMinimap}
          onChange={(e) => updateAndSave({ showMinimap: e.target.checked })}
        />
        ミニマップを表示
      </label>

      <label className="flex items-center gap-2 text-[11px] text-[#c0caf5]">
        <input
          type="checkbox"
          checked={settings.snapToGrid}
          onChange={(e) => updateAndSave({ snapToGrid: e.target.checked })}
        />
        ノードをグリッドにスナップ（移動・リサイズ）
      </label>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-[#c0caf5]">
          <span>コンテキスト長</span>
          <span className="text-[#7aa2f7]">{ctxLabel(settings.contextSize)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={CTX_STEPS.length - 1}
          step={1}
          value={ctxIndex(settings.contextSize)}
          onChange={(e) => update({ contextSize: CTX_STEPS[Number(e.target.value)] })}
        />
        <div className="flex justify-between text-[9px] text-[#565f89]">
          {CTX_STEPS.map((v) => (
            <span key={v}>{ctxLabel(v)}</span>
          ))}
        </div>
        <p className="text-[10px] text-[#565f89]">※ 次回モデルロード時に反映されます。</p>
      </div>

      <div className="h-px bg-[#2a2e3f]" />

      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-[#565f89]">
          WebUI Forge 用 Python パス（任意）
        </span>
        <input
          type="text"
          className="rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1 text-[11px] text-[#c0caf5] outline-none focus:border-[#7aa2f7]"
          placeholder="空なら自動検出（Python 3.10 を推奨）"
          value={settings.forgePython}
          onChange={(e) => update({ forgePython: e.target.value })}
        />
        <p className="text-[10px] text-[#565f89]">
          ※ 初回起動で python が見つからない場合に python.exe のパスを指定してください。
        </p>
      </div>

      <div className="h-px bg-[#2a2e3f]" />

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
