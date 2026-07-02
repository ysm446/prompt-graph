import { Handle, NodeResizeControl, Position, type NodeProps } from '@xyflow/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Boxes,
  Camera as CameraIcon,
  Clapperboard,
  Dices,
  Handshake,
  Image as ImageIcon,
  ImagePlus,
  Lightbulb,
  Loader2,
  type LucideIcon,
  Mountain,
  Palette,
  PersonStanding,
  Recycle,
  Sparkles,
  User,
  X
} from 'lucide-react'
import type {
  ForgeServerStatus,
  GraphEdge,
  GraphNode,
  NodeData,
  NodeKind,
  SceneData
} from '@shared/types'
import { compileScene, getVisibilityInput, visibilityHash } from '@shared/compile'
import { dryRun, findSceneForBatch, findSceneForNode, type DryRunResult } from '@shared/batch'
import { notifyStatus } from '../lib/status'
import { useGraphStore } from '../store/graphStore'
import type { RFNode } from '../store/graphStore'
import { SCENE_INPUTS } from './factory'

export const ACCENT: Record<NodeKind, string> = {
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
  batch: '#f7768e',
  render: '#bb9af7'
}

const NODE_ICONS: Record<NodeKind, LucideIcon> = {
  character: User,
  soloAction: PersonStanding,
  interaction: Handshake,
  background: Mountain,
  lighting: Lightbulb,
  camera: CameraIcon,
  quality: Sparkles,
  style: Palette,
  seed: Dices,
  reference: ImageIcon,
  scene: Clapperboard,
  batch: Boxes,
  render: ImagePlus
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
  beforeBody,
  inputs,
  hasOutput = true
}: {
  id: string
  kind: NodeKind
  title: string
  selected?: boolean
  children: ReactNode
  /** ヘッダー直後・スクロール領域の外に置く内容（Scene の入力ピン列など。ハンドルが切れないようにする） */
  beforeBody?: ReactNode
  inputs?: { id: string; label: string; top: number }[]
  hasOutput?: boolean
}) {
  const accent = ACCENT[kind]
  const Icon = NODE_ICONS[kind]
  return (
    <div
      className={`relative flex h-full w-full flex-col rounded-2xl border-2 bg-[var(--bg-card)] text-[var(--text)] shadow-lg shadow-black/30 ${
        selected ? 'ring-4 ring-[var(--accent-border)]' : ''
      }`}
      style={{ borderColor: `color-mix(in srgb, ${accent} 60%, var(--bg-card))` }}
    >
      {/* 右下コーナーで縦横リサイズ（選択中のみ表示）。
          高さ未指定なら内容に追従、縮めた場合のみ本文がスクロール。 */}
      {selected && (
        <NodeResizeControl position="bottom-right" minWidth={180} minHeight={80} maxWidth={680} />
      )}
      <div className="flex shrink-0 items-center gap-1.5 px-4 pb-1 pt-2.5">
        <Icon size={13} strokeWidth={2.25} style={{ color: accent }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-dim)]">
          {title}
        </span>
      </div>
      {beforeBody}
      <div className="node-scrollbar flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3 pt-1">
        {children}
      </div>

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
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
      {label}
      {children}
    </label>
  )
}

const inputCls =
  'nodrag rounded-[8px] border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--accent-border)]'

// 内容に合わせて高さが自動で伸びる textarea（内部スクロールバーを出さず、ノードごと縦に伸びる）
// 単一行相当のフィールドも幅を超えたら折り返すよう、全ノードでこの Area を使う。
function Area(props: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
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
      rows={props.rows ?? 1}
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
    <Shell id={id} kind="character" title={d.label} selected={selected}>
      <Field label="数え名詞 (人数タグ集計用 / 空で無効)">
        <Area
          value={d.person ?? 'girl'}
          onChange={(v) => update({ person: v })}
          placeholder="girl, boy, guy, dog…"
        />
      </Field>
      <Field label="表情/顔">
        <Area value={d.face} onChange={(v) => update({ face: v })} placeholder="smile, blue eyes" />
      </Field>
      <Field label="髪">
        <Area value={d.hair} onChange={(v) => update({ hair: v })} placeholder="long hair, blonde" />
      </Field>
      <Field label="上半身">
        <Area value={d.upper} onChange={(v) => update({ upper: v })} placeholder="white shirt" />
      </Field>
      <Field label="下半身">
        <Area value={d.lower} onChange={(v) => update({ lower: v })} placeholder="black skirt" />
      </Field>
      <Field label="全身">
        <Area value={d.fullbody} onChange={(v) => update({ fullbody: v })} placeholder="dress" />
      </Field>
      <Field label="小物">
        <Area value={d.accessory} onChange={(v) => update({ accessory: v })} placeholder="glasses" />
      </Field>
      <Field label="weight">
        <WeightInput value={d.weight} onChange={(v) => update({ weight: v })} />
      </Field>
    </Shell>
  )
}

function TagNode(kind: 'soloAction' | 'interaction' | 'background' | 'lighting' | 'quality' | 'style') {
  return function TagNodeInner({ id, data, selected }: NodeProps<RFNode>) {
    const d = data as Extract<NodeData, { kind: typeof kind }>
    const update = useUpdate(id)
    const inputs = kind === 'soloAction' ? [{ id: 'charIn', label: 'Character', top: 36 }] : undefined
    return (
      <Shell id={id} kind={kind} title={d.label} selected={selected} inputs={inputs}>
        {kind === 'soloAction' && (
          <p className="text-[10px] text-[var(--text-faint)]">← Character を接続（鎖: char → action → scene）</p>
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

export const SoloActionNode = TagNode('soloAction')
export const InteractionNode = TagNode('interaction')
export const BackgroundNode = TagNode('background')
export const LightingNode = TagNode('lighting')
export const QualityNode = TagNode('quality')
export const StyleNode = TagNode('style')

export function CameraNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'camera' }>
  const update = useUpdate(id)
  const lines = d.presets.split('\n').map((l) => l.trim()).filter(Boolean)
  return (
    <Shell id={id} kind="camera" title={d.label} selected={selected}>
      <Field label="presets (1行=1プリセット)">
        <Area value={d.presets} onChange={(v) => update({ presets: v })} />
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

// Seed ノードの下流をたどり、Render ノードの実 seed(lastSeed)を集める。
function downstreamRenderSeeds(seedId: string, nodes: GraphNode[], edges: GraphEdge[]): number[] {
  const out = new Map<string, string[]>()
  for (const e of edges) {
    const list = out.get(e.source) ?? []
    list.push(e.target)
    out.set(e.source, list)
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const queue = [seedId]
  const seeds: number[] = []
  while (queue.length) {
    const cur = queue.shift() as string
    for (const t of out.get(cur) ?? []) {
      if (seen.has(t)) continue
      seen.add(t)
      const n = byId.get(t)
      if (n?.kind === 'render') {
        const ls = (n.data as Extract<NodeData, { kind: 'render' }>).lastSeed
        if (typeof ls === 'number') seeds.push(ls)
      }
      queue.push(t)
    }
  }
  return seeds
}

export function SeedNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'seed' }>
  const update = useUpdate(id)
  const mode = d.mode ?? 'fixed'

  // 下流 Render の実 seed を取得して value へ反映
  const pullSeed = (): void => {
    const { nodes, edges } = storeGraph()
    const seeds = downstreamRenderSeeds(id, nodes, edges)
    if (seeds.length === 0) {
      notifyStatus('下流の Render に seed がありません')
      return
    }
    update({ value: mode === 'list' ? seeds.join(', ') : String(seeds[0]) })
    notifyStatus(`seed を取得: ${seeds.join(', ')}`)
  }

  const recycleBtn = (
    <button
      className="nodrag flex shrink-0 items-center rounded-[8px] border border-[var(--border)] p-1.5 text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]"
      onClick={pullSeed}
      title="下流の Render の seed を取得"
    >
      <Recycle size={13} />
    </button>
  )
  const numInput = (value: number, on: (n: number) => void) => (
    <input
      type="number"
      className={`${inputCls} w-20`}
      value={value}
      onChange={(e) => on(Number(e.target.value) || 0)}
    />
  )
  return (
    <Shell id={id} kind="seed" title={d.label} selected={selected}>
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
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <Area value={d.value} onChange={(v) => update({ value: v })} placeholder="-1" />
            </div>
            {recycleBtn}
          </div>
        </Field>
      )}
      {mode === 'list' && (
        <Field label="seed リスト">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <Area value={d.value} onChange={(v) => update({ value: v })} placeholder="1, 2, 3" />
            </div>
            {recycleBtn}
          </div>
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
    <div className="-mx-4 mt-1 border-t border-[var(--border)] px-4 pt-2">
      <label className="flex items-center gap-2 text-[10px] text-[var(--text-faint)]">
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
              className="nodrag rounded-[8px] bg-[rgba(68,54,124,0.96)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[rgba(82,66,146,0.98)] disabled:opacity-40"
              onClick={run}
              disabled={busy || !running}
            >
              {busy ? '判定中…' : '実行'}
            </button>
            {!running && <span className="text-[10px] text-[#e0af68]">モデルをロードしてください</span>}
          </div>

          {err && <span className="text-[10px] text-[var(--danger)]">{err}</span>}

          <div className="text-[10px] text-[var(--text-faint)]">
            除去トークン（クリックで戻す / 手修正可）:
          </div>
          <div className="flex flex-wrap gap-1">
            {removed.length === 0 && (
              <span className="text-[10px] text-[var(--text-faint)] opacity-60">なし</span>
            )}
            {removed.map((t) => (
              <button
                key={t}
                className="nodrag flex items-center gap-1 rounded-[6px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--danger)] hover:bg-white/5"
                title="クリックで除去を取り消す"
                onClick={() => update({ visibilityRemoved: removed.filter((x) => x !== t) })}
              >
                {t} <X size={10} />
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
    <Shell
      id={id}
      kind="scene"
      title={d.label}
      selected={selected}
      // カテゴリ別入力ピン（誤接続防止 + 見やすさ）。スクロール外に置きハンドルの見切れを防ぐ
      beforeBody={
        <div className="mb-1 border-b border-[var(--border)] pb-1">
          {SCENE_INPUTS.map((pin) => (
            <div
              key={pin.id}
              className="relative flex h-[22px] items-center pl-4 text-[10px] text-[var(--text-faint)]"
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
      }
    >
      <label className="flex items-center gap-2 text-[10px] text-[var(--text-faint)]">
        <input
          type="checkbox"
          className="nodrag"
          checked={d.peopleTagAuto}
          onChange={(e) => update({ peopleTagAuto: e.target.checked })}
        />
        人数タグを自動付与
      </label>
      {d.peopleTagAuto ? (
        <label className="flex items-center gap-2 pl-4 text-[10px] text-[var(--text-faint)]">
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
          <Area value={d.peopleTag} onChange={(v) => update({ peopleTag: v })} placeholder="1girl, 1boy" />
        </Field>
      )}
      <label className="flex items-center gap-2 text-[10px] text-[var(--text-faint)]">
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
  { key: 'action', label: 'Action' },
  { key: 'interaction', label: 'Interaction' },
  { key: 'background', label: 'Background' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'camera', label: 'Camera' },
  { key: 'quality', label: 'Quality' },
  { key: 'style', label: 'Style' }
]

export function ReferenceNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'reference' }>
  const update = useUpdate(id)
  const [running, setRunning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null) // data URL（非永続）

  useEffect(() => {
    window.api.getServerStatus().then((s) => setRunning(s.state === 'running'))
    return window.api.onServerStatus((s) => setRunning(s.state === 'running'))
  }, [])

  // imagePath が変わったらプレビュー画像を読み込む（保存はしない）
  useEffect(() => {
    let alive = true
    if (!d.imagePath) {
      setPreview(null)
      return
    }
    window.api
      .imageDataUrl(d.imagePath)
      .then((url) => alive && setPreview(url))
      .catch(() => alive && setPreview(null))
    return () => {
      alive = false
    }
  }, [d.imagePath])

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
    <Shell id={id} kind="reference" title={d.label} selected={selected} hasOutput={false}>
      <button
        className="nodrag rounded-[10px] border border-[var(--border-strong)] bg-[rgba(28,31,43,0.92)] py-1 text-xs text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]"
        onClick={load}
      >
        画像を読み込む
      </button>
      {preview && (
        <img
          src={preview}
          alt={fileName}
          className="max-h-40 w-full rounded-[10px] border border-[var(--border-strong)] bg-black/20 object-contain"
        />
      )}
      {fileName && <div className="truncate text-[10px] text-[var(--text-faint)]">{fileName}</div>}

      <Field label="positive (抽出)">
        <Area value={d.positive} onChange={(v) => update({ positive: v })} rows={3} />
      </Field>

      <div className="flex items-center gap-2">
        <button
          className="nodrag rounded-[8px] bg-[rgba(68,54,124,0.96)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[rgba(82,66,146,0.98)] disabled:opacity-40"
          onClick={decompose}
          disabled={busy || !running || !d.positive.trim()}
        >
          {busy ? '分解中…' : 'バケツに分解'}
        </button>
        {!running && <span className="text-[10px] text-[#e0af68]">要モデルロード</span>}
      </div>
      {err && <span className="text-[10px] text-[var(--danger)]">{err}</span>}

      {BUCKET_LABELS.map(({ key, label }) => (
        <Field key={key} label={label}>
          <Area
            value={d.buckets?.[key] ?? ''}
            onChange={(v) => update({ buckets: { ...d.buckets, [key]: v } })}
            rows={1}
          />
        </Field>
      ))}
      <p className="text-[10px] text-[var(--text-faint)]">
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
      title={d.label}
      selected={selected}
      hasOutput={false}
      inputs={[{ id: 'scene', label: 'Scene', top: 36 }]}
    >
      <p className="text-[10px] text-[var(--text-faint)]">← Scene を接続</p>
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
        className="nodrag rounded-[10px] bg-[rgba(68,54,124,0.96)] py-1.5 text-xs font-medium text-white hover:bg-[rgba(82,66,146,0.98)]"
        onClick={run}
      >
        ドライラン
      </button>
      {err && <span className="text-[10px] text-[var(--danger)]">{err}</span>}

      {result && (
        <div className="flex flex-col gap-1 text-[10px] text-[var(--text)]">
          <div>
            総数 <span className="text-[#ff9e64]">{result.total}</span> / 展開{' '}
            <span className="text-[#9ece6a]">{result.planned}</span>
          </div>
          {result.axes.length === 0 ? (
            <div className="text-[var(--text-faint)]">スイープ軸なし（Camera 複数プリセット / Seed 複数値で増えます）</div>
          ) : (
            <div className="text-[var(--text-faint)]">
              軸: {result.axes.map((a) => `${a.label}×${a.count}`).join(', ')}
            </div>
          )}
          {result.samples.map((s, i) => (
            <div key={i} className="rounded-[8px] bg-[var(--bg-input)] p-1.5">
              <div className="text-[#7aa2f7]">{s.overridesLabel}</div>
              <div className="whitespace-pre-wrap break-words text-[#9ece6a]">{s.positive}</div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

// Forge が running になるまで待つ（起動失敗/停止/タイムアウトで reject）。
function waitForForgeRunning(timeoutMs = 20 * 60 * 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false
    let off: () => void = () => {}
    const timer = setTimeout(() => {
      if (done) return
      done = true
      off()
      reject(new Error('Forge の起動がタイムアウトしました'))
    }, timeoutMs)
    const finish = (err?: Error): void => {
      if (done) return
      done = true
      off()
      clearTimeout(timer)
      err ? reject(err) : resolve()
    }
    const check = (s: ForgeServerStatus): void => {
      if (s.state === 'running') finish()
      else if (s.state === 'error') finish(new Error(s.message ?? 'Forge の起動に失敗しました'))
      else if (s.state === 'stopped') finish(new Error('Forge が停止しました'))
    }
    off = window.api.onForgeStatus(check)
    // 既に running の場合の取りこぼし防止
    window.api.getForgeStatus().then((s) => {
      if (s.state === 'running') finish()
    })
  })
}

// Render: 接続した Scene を Forge (txt2img) で生成する。生成画像は永続化しない。
function NumField({
  label,
  value,
  step,
  min,
  onChange
}: {
  label: string
  value: number
  step?: number
  min?: number
  onChange: (n: number) => void
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        className={inputCls}
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || (min ?? 0))}
      />
    </Field>
  )
}

export function RenderNode({ id, data, selected }: NodeProps<RFNode>) {
  const d = data as Extract<NodeData, { kind: 'render' }>
  const update = useUpdate(id)
  const [forge, setForge] = useState<ForgeServerStatus>({ state: 'stopped', url: null, message: null })
  const [models, setModels] = useState<{ title: string; modelName: string }[]>([])
  const [samplers, setSamplers] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null) // 起動中などの一時メッセージ
  const [err, setErr] = useState<string | null>(null)
  const [img, setImg] = useState<string | null>(null) // data URL（非永続）
  const [seed, setSeed] = useState<number | null>(d.lastSeed ?? null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(false) // 画像の拡大表示
  const [elapsedMs, setElapsedMs] = useState<number | null>(null) // 生成の経過時間（生成後も保持）
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const startRef = useRef(0)

  useEffect(() => {
    window.api.getForgeStatus().then(setForge)
    return window.api.onForgeStatus(setForge)
  }, [])

  // アンマウント時にタイマー停止
  useEffect(() => () => clearInterval(timerRef.current), [])

  // 保存済み画像パスから再表示（起動直後・ワークスペース切替時）
  useEffect(() => {
    if (!d.lastImagePath) {
      setImg(null)
      return
    }
    let alive = true
    window.api
      .imageDataUrl(d.lastImagePath)
      .then((u) => alive && setImg(u))
      .catch(() => alive && setImg(null))
    return () => {
      alive = false
    }
  }, [d.lastImagePath])

  const running = forge.state === 'running'
  useEffect(() => {
    if (!running) return
    window.api.forgeSdModels().then(setModels).catch(() => setModels([]))
    window.api.forgeSamplers().then(setSamplers).catch(() => setSamplers([]))
  }, [running])

  // 画像コンテキストメニューの外側クリックで閉じる
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  // 拡大表示は Escape で閉じる
  useEffect(() => {
    if (!zoom) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setZoom(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  async function generate() {
    setErr(null)
    const { nodes, edges } = storeGraph()
    const scene = findSceneForNode(id, nodes, edges)
    if (!scene) {
      setErr('Scene を接続してください')
      return
    }
    const compiled = compileScene(scene, nodes, edges)
    if (!compiled.positive.trim()) {
      setErr('プロンプトが空です')
      return
    }
    setBusy(true)
    startRef.current = 0
    try {
      // 未起動なら起動して稼働まで待つ（初回は venv/torch 構築で長い）
      if (forge.state !== 'running') {
        setNote('Forge を起動中…')
        await window.api.startForge()
        await waitForForgeRunning()
        setNote(null)
      }
      // ここから生成時間を計測（起動待ちは含めない）
      startRef.current = performance.now()
      setElapsedMs(0)
      clearInterval(timerRef.current)
      timerRef.current = setInterval(() => setElapsedMs(performance.now() - startRef.current), 100)

      const s = compiled.seed && Number.isFinite(Number(compiled.seed)) ? Number(compiled.seed) : -1
      const res = await window.api.forgeTxt2img({
        prompt: compiled.positive,
        steps: d.steps,
        cfgScale: d.cfg,
        sampler: d.sampler,
        width: d.width,
        height: d.height,
        seed: s,
        model: d.model
      })
      setImg(res.imageDataUrl)
      setSeed(res.seed)
      // 次回起動時の再表示用にパスと seed をノードへ保存
      update({ lastImagePath: res.savedPath, lastSeed: res.seed })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      clearInterval(timerRef.current)
      if (startRef.current > 0) setElapsedMs(performance.now() - startRef.current) // 最終値を確定
      setBusy(false)
      setNote(null)
    }
  }

  return (
    <Shell
      id={id}
      kind="render"
      title={d.label}
      selected={selected}
      hasOutput={false}
      inputs={[{ id: 'scene', label: 'Scene', top: 36 }]}
    >
      <p className="text-[10px] text-[var(--text-faint)]">← Scene を接続</p>

      <Field label="モデル">
        <select
          className={inputCls}
          value={d.model ?? ''}
          onChange={(e) => update({ model: e.target.value || null })}
        >
          <option value="">（現在ロード中のモデル）</option>
          {models.map((m) => (
            <option key={m.title} value={m.title}>
              {m.modelName}
            </option>
          ))}
        </select>
      </Field>
      <Field label="サンプラ">
        <select
          className={inputCls}
          value={d.sampler}
          onChange={(e) => update({ sampler: e.target.value })}
        >
          {(samplers.length ? samplers : [d.sampler]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex gap-2">
        <NumField label="幅" value={d.width} step={64} min={64} onChange={(n) => update({ width: n })} />
        <NumField label="高さ" value={d.height} step={64} min={64} onChange={(n) => update({ height: n })} />
      </div>
      <div className="flex gap-2">
        <NumField label="steps" value={d.steps} step={1} min={1} onChange={(n) => update({ steps: n })} />
        <NumField label="CFG" value={d.cfg} step={0.5} min={1} onChange={(n) => update({ cfg: n })} />
      </div>

      <button
        className="nodrag flex items-center justify-center gap-1.5 rounded-[10px] bg-[rgba(68,54,124,0.96)] py-1.5 text-xs font-medium text-white hover:bg-[rgba(82,66,146,0.98)] disabled:opacity-40"
        onClick={generate}
        disabled={busy}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
        {note ?? (busy ? '生成中…' : '画像生成')}
      </button>
      {!running && !busy && (
        <span className="text-[10px] text-[var(--text-faint)]">
          Forge 未起動（生成時に自動起動します。初回は数分かかります）
        </span>
      )}
      {err && <span className="text-[10px] text-[var(--danger)]">{err}</span>}

      {elapsedMs != null && (
        <span className="text-[10px] text-[var(--text-faint)]">
          {busy ? '経過' : '生成時間'}:{' '}
          {elapsedMs < 60000
            ? `${(elapsedMs / 1000).toFixed(1)}s`
            : `${Math.floor(elapsedMs / 60000)}:${String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0')}`}
        </span>
      )}

      {img && (
        <div className="flex flex-col gap-1">
          <img
            src={img}
            alt="生成結果"
            className="nodrag w-full cursor-zoom-in rounded-[10px] border border-[var(--border-strong)] bg-black/20 object-contain"
            onClick={() => setZoom(true)}
            onContextMenu={(e) => {
              if (!d.lastImagePath) return
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY })
            }}
          />
          {seed != null && <span className="text-[10px] text-[var(--text-faint)]">seed: {seed}</span>}
        </div>
      )}

      {menu &&
        createPortal(
          <div
            className="fixed z-[100] min-w-44 rounded-[8px] border border-[var(--border-strong)] bg-[var(--bg-card)] p-1 text-xs shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="block w-full rounded-[6px] px-3 py-1.5 text-left text-[var(--text-dim)] hover:bg-white/5 hover:text-[var(--text)]"
              onClick={() => {
                window.api.showItemInFolder(d.lastImagePath)
                setMenu(null)
              }}
            >
              画像の保存場所を開く
            </button>
          </div>,
          document.body
        )}

      {zoom &&
        img &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-8 backdrop-blur-md"
            onClick={() => setZoom(false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            <img
              src={img}
              alt="生成結果（拡大）"
              className="max-h-full max-w-full cursor-zoom-out rounded-[10px] object-contain shadow-2xl"
            />
          </div>,
          document.body
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
  batch: BatchNode,
  render: RenderNode
}
