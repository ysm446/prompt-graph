import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useEffect, useState, type ReactNode } from 'react'
import type { GraphEdge, GraphNode, NodeData, NodeKind, SceneData } from '@shared/types'
import { getVisibilityInput, visibilityHash } from '@shared/compile'
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
  scene: '#ff9e64'
}

function useUpdate(id: string) {
  return (patch: Partial<NodeData>) => useGraphStore.getState().updateNodeData(id, patch)
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
          style={{ top: h.top, background: accent }}
          title={h.label}
        />
      ))}
      {hasOutput && (
        <Handle id="out" type="source" position={Position.Right} style={{ background: accent }} />
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
        <Area value={d.presets} onChange={(v) => update({ presets: v })} rows={3} />
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
  return (
    <Shell id={id} kind="seed" title={`🎲 ${d.label}`} selected={selected}>
      <Field label="seed (-1=ランダム)">
        <TextInput value={d.value} onChange={(v) => update({ value: v })} placeholder="-1" />
      </Field>
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
    <Shell id={id} kind="scene" title={`🎬 ${d.label}`} selected={selected} hasOutput={false}>
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
              style={{ background: ACCENT.scene }}
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
  scene: SceneNode
}
