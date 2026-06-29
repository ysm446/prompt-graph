import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { GraphEdge, GraphNode, NodeData, NodeKind, SceneData } from '@shared/types'
import { getVisibilityInput, visibilityHash } from '@shared/compile'
import { dryRun, findSceneForBatch, type DryRunResult } from '@shared/batch'
import { useGraphStore } from '../store/graphStore'
import type { RFNode } from '../store/graphStore'
import { SCENE_INPUTS } from './factory'

const ACCENT: Record<NodeKind, string> = {
  character: '#7aa2f7',
  soloAction: '#9ece6a',
  interaction: '#e0af68',
  background: '#7dcfff',
  lighting: '#bb9af7',
  camera: '#f7768e',
  quality: '#f7c873',
  style: '#73daca',
  seed: '#a9b1d6',
  reference: '#7dcfff',
  scene: '#ff9e64',
  batch: '#f7768e'
}

function useUpdate(id: string) {
  return (patch: Partial<NodeData>) => useGraphStore.getState().updateNodeData(id, patch)
}

/** ストアの RFNode/Edge を共有ロジック用の GraphNode/GraphEdge に変換。 */
function storeGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const s = useGraphStore.getState()
  return {
    nodes: s.nodes.map((n) => ({
      id: n.id,
      kind: n.type as NodeKind,
      position: n.position,
      data: n.data
    })),
    edges: s.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null
    }))
  }
}

function Shell({
  id,
  kind,
  title,
  selected,
  children,
  inputs,
  hasOutput = true
}: {
  id: string
  kind: NodeKind
  title: string
  selected?: boolean
  children: ReactNode
  inputs?: { id: string; label: string; top: number }[]
  hasOutput?: boolean
}) {
  const accent = ACCENT[kind]
  return (
    <div
      className="rounded-lg border bg-[#1a1b26] text-[#c0caf5] shadow-lg"
      style={{
        borderColor: selected ? accent : '#2a2e3f',
        width: 240,
        boxShadow: selected ? `0 0 0 1px ${accent}` : undefined
      }}
    >
      <div
        className="rounded-t-lg px-3 py-1.5 text-xs font-semibold tracking-wide"
        style={{ background: accent, color: '#11131a' }}
      >
        {title}
      </div>
      <div className="flex flex-col gap-2 p-3">{children}</div>

      {(inputs ?? []).map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="target"
          position={Position.Left}
          style={{ top: h.top, backgroundColor: accent }}
          title={h.label}
        />
      ))}
      {hasOutput && (
        <Handle id="out" type="source" position={Position.Right} style={{ backgroundColor: accent }} />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[#565f89]">
      {label}
      {children}
    </label>
  )
}

const inputCls =
  'nodrag rounded border border-[#2a2e3f] bg-[#11131a] px-2 py-1 text-xs text-[#c0caf5] outline-none placeholder:text-[#363b4d] focus:border-[#7aa2f7]'

function TextInput(props: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      className={inputCls}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

function Area(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return (
    <textarea
      className={`${inputCls} resize-none`}
      rows={props.rows ?? 2}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

// 内容に合わせて高さが自動で伸びる textarea（内部スクロールバーを出さない）
function AutoArea(props: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [props.value])
  return (
    <textarea
      ref={ref}
      className={`${inputCls} resize-none overflow-hidden`}
      rows={1}
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}

function WeightInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      step={0.05}
      min={0}
      max={2}
      className={`${inputCls} w-20`}
      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 1)}
    />
  )
}

// ---------------- per-kind nodes ----------------

export function CharacterNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'character' }>
  const update = useUpdate(id)
  return (
    <Shell id={id} kind="character" title={`👤 ${d.label}`} selected={selected}>
      <Field label="数え名詞 (人数タグ集計用 / 空で無効)">
        <TextInput
          value={d.person ?? 'girl'}
          onChange={(v) => update({ person: v })}
          placeholder="girl, boy, guy, dog…"
        />
      </Field>
      <Field label="表情/顔">
        <Area value={d.face} onChange={(v) => update({ face: v })} placeholder="smile, blue eyes" />
      </Field>
      <Field label="髪">
        <TextInput value={d.hair} onChange={(v) => update({ hair: v })} placeholder="long hair, blonde" />
      </Field>
      <Field label="上半身">
        <TextInput value={d.upper} onChange={(v) => update({ upper: v })} placeholder="white shirt" />
      </Field>
      <Field label="下半身">
        <TextInput value={d.lower} onChange={(v) => update({ lower: v })} placeholder="black skirt" />
      </Field>
      <Field label="全身">
        <TextInput value={d.fullbody} onChange={(v) => update({ fullbody: v })} placeholder="dress" />
      </Field>
      <Field label="小物">
        <TextInput value={d.accessory} onChange={(v) => update({ accessory: v })} placeholder="glasses" />
      </Field>
      <Field label="weight">
        <WeightInput value={d.weight} onChange={(v) => update({ weight: v })} />
      </Field>
    </Shell>
  )
}

function TagNode(
  kind: 'soloAction' | 'interaction' | 'background' | 'lighting' | 'quality' | 'style',
  icon: string
) {
  return function TagNodeInner({ id, data, selected }: NodeProps<RFNode>) {
    const d = data as Extract<NodeData, { kind: typeof kind }>
    const update = useUpdate(id)
    const inputs = kind === 'soloAction' ? [{ id: 'charIn', label: 'Character', top: 36 }] : undefined
    return (
      <Shell id={id} kind={kind} title={`${icon} ${d.label}`} selected={selected} inputs={inputs}>
        {kind === 'soloAction' && (
          <p className="text-[10px] text-[#565f89]">← Character を接続（鎖: char → action → scene）</p>
        )}
        <Field label="tags">
          <Area value={d.tags} onChange={(v) => update({ tags: v })} placeholder="comma, separated, tags" />
        </Field>
        <Field label="weight">
          <WeightInput value={d.weight} onChange={(v) => update({ weight: v })} />
        </Field>
      </Shell>
    )
  }
}

export const SoloActionNode = TagNode('soloAction', '🤸')
export const InteractionNode = TagNode('interaction', '🤝')
export const BackgroundNode = TagNode('background', '🏞️')
export const LightingNode = TagNode('lighting', '💡')
export const QualityNode = TagNode('quality', '✨')
export const StyleNode = TagNode('style', '🎨')

export function CameraNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'camera' }>
  const update = useUpdate(id)
  const lines = d.presets.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <Shell id={id} kind="camera" title={`🎥 ${d.label}`} selected={selected}>
      <Field label="presets (1行=1プリセット)">
        <AutoArea value={d.presets} onChange={(v) => update({ presets: v })} />
      </Field>
      <Field label="使用プリセット">
        <select
          className={inputCls}
          value={Math.min(d.selected, Math.max(lines.length - 1, 0))}
          onChange={(e) => update({ selected: Number(e.target.value) })}
        >
          {lines.map((l, i) => (
            <option key={i} value={i}>
              {l}
            </option>
          ))}
        </select>
      </Field>
    </Shell>
  )
}

export function SeedNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'seed' }>
  const update = useUpdate(id)
  const mode = d.mode ?? 'fixed'
  const numInput = (value: number, on: (n: number) => void) => (
    <input
      type="number"
      className={`${inputCls} w-20`}
      value={value}
      onChange={(e) => on(Number(e.target.value) || 0)}
    />
  )
  return (
    <Shell id={id} kind="seed" title={`🎲 ${d.label}`} selected={selected}>
      <Field label="モード">
        <select
          className={inputCls}
          value={mode}
          onChange={(e) => update({ mode: e.target.value as typeof d.mode })}
        >
          <option value="fixed">固定（1つ）</option>
          <option value="increment">増加（+stepずつ）</option>
          <option value="random">ランダム（-1×個数）</option>
          <option value="list">リスト（カンマ区切り）</option>
        </select>
      </Field>
      {mode === 'fixed' && (
        <Field label="seed (-1=ランダム)">
          <TextInput value={d.value} onChange={(v) => update({ value: v })} placeholder="-1" />
        </Field>
      )}
      {mode === 'list' && (
        <Field label="seed リスト">
          <TextInput value={d.value} onChange={(v) => update({ value: v })} placeholder="1, 2, 3" />
        </Field>
      )}
      {mode === 'increment' && (
        <div className="flex gap-2">
          <Field label="開始">{numInput(d.start ?? 0, (n) => update({ start: n }))}</Field>
          <Field label="step">{numInput(d.step ?? 1, (n) => update({ step: n }))}</Field>
          <Field label="個数">{numInput(d.count ?? 4, (n) => update({ count: n }))}</Field>
        </div>
      )}
      {mode === 'random' && (
        <Field label="個数">{numInput(d.count ?? 4, (n) => update({ count: n }))}</Field>
      )}
    </Shell>
  )
}

// 可視性フィルタ（spec §4.11）: カメラのフレーミングから画面外タグを LLM で除去
function VisibilitySection({ id, d }: { id: string; d: SceneData }) {
  const update = useUpdate(id)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [addDraft, setAddDraft] = useState('')

  useEffect(() => {
    window.api.getServerStatus().then((s) => setRunning(s.state === 'running'))
    return window.api.onServerStatus((s) => setRunning(s.state === 'running'))
  }, [])

  const removed = d.visibilityRemoved ?? []

  async function run() {
    setErr(null)
    setBusy(true)
    try {
      const state = useGraphStore.getState()
      const gNodes: GraphNode[] = state.nodes.map((n) => ({
        id: n.id,
        kind: n.type as NodeKind,
        position: n.position,
        data: n.data
      }))
      const gEdges: GraphEdge[] = state.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null
      }))
      const sceneNode = gNodes.find((n) => n.id === id)
      if (!sceneNode) return
      const { framing, tags } = getVisibilityInput(sceneNode, gNodes, gEdges)
      if (!framing) {
        setErr('Camera が接続されていません（フレーミング不明）')
        return
      }
      const result = await window.api.visibilityFilter(framing, tags)
      update({ visibilityRemoved: result, visibilityKey: visibilityHash(framing, tags) })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="-mx-3 mt-1 border-t border-[#2a2e3f] px-3 pt-2">
      <label className="flex items-center gap-2 text-[10px] text-[#565f89]">
        <input
          type="checkbox"
          className="nodrag"
          checked={d.visibilityEnabled ?? false}
          onChange={(e) => update({ visibilityEnabled: e.target.checked })}
        />
        可視性フィルタ（画面外タグを除去）
      </label>

      {d.visibilityEnabled && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              className="nodrag rounded bg-[#bb9af7] px-2 py-0.5 text-[10px] font-semibold text-[#11131a] hover:opacity-90 disabled:opacity-40"
              onClick={run}
              disabled={busy || !running}
            >
              {busy ? '判定中…' : '実行'}
            </button>
            {!running && <span className="text-[10px] text-[#e0af68]">モデルをロードしてください</span>}
          </div>

          {err && <span className="text-[10px] text-[#f7768e]">{err}</span>}

          <div className="text-[10px] text-[#565f89]">
            除去トークン（クリックで戻す / 手修正可）:
          </div>
          <div className="flex flex-wrap gap-1">
            {removed.length === 0 && <span className="text-[10px] text-[#3a3f55]">なし</span>}
            {removed.map((t) => (
              <button
                key={t}
                className="nodrag rounded bg-[#2a2e3f] px-1.5 py-0.5 text-[10px] text-[#f7768e] hover:bg-[#3a3f55]"
                title="クリックで除去を取り消す"
                onClick={() => update({ visibilityRemoved: removed.filter((x) => x !== t) })}
              >
                {t} ✕
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            <input
              className={`${inputCls} flex-1`}
              value={addDraft}
              placeholder="手動で除去するタグ"
              onChange={(e) => setAddDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const t = addDraft.trim()
                  if (t && !removed.includes(t)) update({ visibilityRemoved: [...removed, t] })
                  setAddDraft('')
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function SceneNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'scene' }>
  const update = useUpdate(id)
  return (
    <Shell id={id} kind="scene" title={`🎬 ${d.label}`} selected={selected}>
      {/* カテゴリ別入力ピン（誤接続防止 + 見やすさ） */}
      <div className="-mx-3 mb-1 border-b border-[#2a2e3f] pb-1">
        {SCENE_INPUTS.map((pin) => (
          <div
            key={pin.id}
            className="relative flex h-[22px] items-center pl-3 text-[10px] text-[#565f89]"
          >
            <Handle
              id={pin.id}
              type="target"
              position={Position.Left}
              style={{ backgroundColor: ACCENT[pin.kinds[0]] }}
            />
            {pin.label}
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[10px] text-[#565f89]">
        <input
          type="checkbox"
          className="nodrag"
          checked={d.peopleTagAuto}
          onChange={(e) => update({ peopleTagAuto: e.target.checked })}
        />
        人数タグを自動付与
      </label>
      {d.peopleTagAuto ? (
        <label className="flex items-center gap-2 pl-4 text-[10px] text-[#565f89]">
          <input
            type="checkbox"
            className="nodrag"
            checked={d.peoplePerCharacter ?? true}
            onChange={(e) => update({ peoplePerCharacter: e.target.checked })}
          />
          各キャラ直前に付ける（1girl, …, 1boy, …）
        </label>
      ) : (
        <Field label="人数タグ">
          <TextInput value={d.peopleTag} onChange={(v) => update({ peopleTag: v })} placeholder="1girl, 1boy" />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[10px] text-[#565f89]">
        <input
          type="checkbox"
          className="nodrag"
          checked={d.useBreak}
          onChange={(e) => update({ useBreak: e.target.checked })}
        />
        複数キャラを BREAK で分割
      </label>

      <VisibilitySection id={id} d={d} />
    </Shell>
  )
}

// Reference: 既存画像のメタデータ(プロンプト)を読み込み、バケツに分解（spec §4.9）
const BUCKET_LABELS: Array<{ key: keyof Extract<NodeData, { kind: 'reference' }>['buckets']; label: string }> = [
  { key: 'character', label: 'Character' },
  { key: 'background', label: 'Background' },
  { key: 'action', label: 'Action' },
  { key: 'camera', label: 'Camera' },
  { key: 'style', label: 'Style' }
]

export function ReferenceNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'reference' }>
  const update = useUpdate(id)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    window.api.getServerStatus().then((s) => setRunning(s.state === 'running'))
    return window.api.onServerStatus((s) => setRunning(s.state === 'running'))
  }, [])

  async function load() {
    setErr(null)
    try {
      const path = await window.api.openImageDialog()
      if (!path) return
      const meta = await window.api.imageMetadata(path)
      update({
        imagePath: path,
        positive: meta.positive,
        negative: meta.negative,
        settings: meta.settings
      })
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  async function decompose() {
    setErr(null)
    setBusy(true)
    try {
      const buckets = await window.api.decompose(d.positive)
      update({ buckets })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const fileName = d.imagePath ? d.imagePath.replace(/^.*[\\/]/, '') : ''

  return (
    <Shell id={id} kind="reference" title={`🖼️ ${d.label}`} selected={selected} hasOutput={false}>
      <button
        className="nodrag rounded bg-[#2a2e3f] py-1 text-xs hover:bg-[#3a3f55]"
        onClick={load}
      >
        画像を読み込む
      </button>
      {fileName && <div className="truncate text-[10px] text-[#565f89]">{fileName}</div>}

      <Field label="positive (抽出)">
        <Area value={d.positive} onChange={(v) => update({ positive: v })} rows={3} />
      </Field>

      <div className="flex items-center gap-2">
        <button
          className="nodrag rounded bg-[#7dcfff] px-2 py-0.5 text-[10px] font-semibold text-[#11131a] hover:opacity-90 disabled:opacity-40"
          onClick={decompose}
          disabled={busy || !running || !d.positive.trim()}
        >
          {busy ? '分解中…' : 'バケツに分解'}
        </button>
        {!running && <span className="text-[10px] text-[#e0af68]">要モデルロード</span>}
      </div>
      {err && <span className="text-[10px] text-[#f7768e]">{err}</span>}

      {BUCKET_LABELS.map(({ key, label }) => (
        <Field key={key} label={label}>
          <Area
            value={d.buckets?.[key] ?? ''}
            onChange={(v) => update({ buckets: { ...d.buckets, [key]: v } })}
            rows={1}
          />
        </Field>
      ))}
      <p className="text-[10px] text-[#565f89]">
        ※ Scene スロットへの上書き接続は今後対応（現状は分解の確認・編集用）
      </p>
    </Shell>
  )
}

// Batch: スイープ軸の直積・ドライラン（spec §4.12）
export function BatchNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'batch' }>
  const update = useUpdate(id)
  const [result, setResult] = useState<DryRunResult | null>(null)
  const [err, setErr] = useState<string | null>(null)

  function run() {
    setErr(null)
    const { nodes, edges } = storeGraph()
    const scene = findSceneForBatch(id, nodes, edges)
    if (!scene) {
      setErr('Scene を接続してください')
      setResult(null)
      return
    }
    setResult(dryRun(d, scene, nodes, edges))
  }

  return (
    <Shell
      id={id}
      kind="batch"
      title={`📦 ${d.label}`}
      selected={selected}
      hasOutput={false}
      inputs={[{ id: 'scene', label: 'Scene', top: 36 }]}
    >
      <p className="text-[10px] text-[#565f89]">← Scene を接続</p>
      <Field label="展開モード">
        <select
          className={inputCls}
          value={d.mode}
          onChange={(e) => update({ mode: e.target.value as typeof d.mode })}
        >
          <option value="all">全列挙（直積）</option>
          <option value="random">ランダム抽出</option>
          <option value="fixed">固定（現在値）</option>
        </select>
      </Field>
      {d.mode === 'random' && (
        <Field label="抽出数">
          <input
            type="number"
            className={`${inputCls} w-20`}
            value={d.randomCount}
            onChange={(e) => update({ randomCount: Number(e.target.value) || 1 })}
          />
        </Field>
      )}
      <Field label="サンプル表示数">
        <input
          type="number"
          className={`${inputCls} w-20`}
          value={d.sampleCount}
          onChange={(e) => update({ sampleCount: Number(e.target.value) || 1 })}
        />
      </Field>

      <button
        className="nodrag rounded bg-[#f7768e] py-1 text-xs font-semibold text-[#11131a] hover:opacity-90"
        onClick={run}
      >
        ドライラン
      </button>
      {err && <span className="text-[10px] text-[#f7768e]">{err}</span>}

      {result && (
        <div className="flex flex-col gap-1 text-[10px] text-[#c0caf5]">
          <div>
            総数 <span className="text-[#ff9e64]">{result.total}</span> / 展開{' '}
            <span className="text-[#9ece6a]">{result.planned}</span>
          </div>
          {result.axes.length === 0 ? (
            <div className="text-[#565f89]">スイープ軸なし（Camera 複数プリセット / Seed 複数値で増えます）</div>
          ) : (
            <div className="text-[#565f89]">
              軸: {result.axes.map((a) => `${a.label}×${a.count}`).join(', ')}
            </div>
          )}
          {result.samples.map((s, i) => (
            <div key={i} className="rounded bg-[#11131a] p-1">
              <div className="text-[#7aa2f7]">{s.overridesLabel}</div>
              <div className="whitespace-pre-wrap break-words text-[#9ece6a]">{s.positive}</div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

export const nodeTypes = {
  character: CharacterNode,
  soloAction: SoloActionNode,
  interaction: InteractionNode,
  background: BackgroundNode,
  lighting: LightingNode,
  camera: CameraNode,
  quality: QualityNode,
  style: StyleNode,
  seed: SeedNode,
  reference: ReferenceNode,
  scene: SceneNode,
  batch: BatchNode
}
