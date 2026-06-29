// Batch: スイープ軸の直積を計算し、ドライラン（総数＋サンプル）を出す。
// （実生成＝Forge へのジョブ発行は後段。ここでは純ロジックのみ）
import { compileScene, seedValues } from './compile'
import type { BatchData, GraphEdge, GraphNode } from './types'

// スイープ軸。各軸は1ノードに対応し、値リストを持つ。
export interface Axis {
  nodeId: string
  label: string
  kind: 'camera' | 'seed'
  values: string[] // 表示用ラベル（camera=プリセット, seed=値）
  // override に渡す実値（camera は index, seed は値文字列）
  resolve: (index: number) => number | string
}

function buildIncomers(edges: GraphEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const e of edges) {
    const list = m.get(e.target) ?? []
    list.push(e.source)
    m.set(e.target, list)
  }
  return m
}

/** Batch ノードの上流から Scene を1つ探す。 */
export function findSceneForBatch(
  batchId: string,
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphNode | null {
  const incomers = buildIncomers(edges)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const src of incomers.get(batchId) ?? []) {
    const n = byId.get(src)
    if (n?.kind === 'scene') return n
  }
  return null
}

/** Scene の上流をたどり、多値ノード（camera プリセット>1, seed 値>1）を軸として集める。 */
export function collectAxes(scene: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): Axis[] {
  const incomers = buildIncomers(edges)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const axes: Axis[] = []

  for (const srcId of incomers.get(scene.id) ?? []) {
    const n = byId.get(srcId)
    if (!n) continue
    if (n.data.kind === 'camera') {
      const lines = n.data.presets.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length > 1) {
        axes.push({
          nodeId: n.id,
          label: n.data.label || 'Camera',
          kind: 'camera',
          values: lines,
          resolve: (i) => i // プリセット index
        })
      }
    } else if (n.data.kind === 'seed') {
      const vals = seedValues(n.data)
      if (vals.length > 1) {
        axes.push({
          nodeId: n.id,
          label: n.data.label || 'Seed',
          kind: 'seed',
          values: vals,
          resolve: (i) => vals[i] // seed 値
        })
      }
    }
  }
  return axes
}

/** 全組み合わせ数（直積）。 */
export function totalCombos(axes: Axis[]): number {
  return axes.reduce((acc, a) => acc * a.values.length, 1)
}

/** index 配列（各軸の選択）→ overrides に変換。 */
function toOverrides(axes: Axis[], picks: number[]): Record<string, number | string> {
  const ov: Record<string, number | string> = {}
  axes.forEach((a, i) => {
    ov[a.nodeId] = a.resolve(picks[i])
  })
  return ov
}

/** 全列挙の picks 配列を生成（直積）。limit で打ち切り。 */
function enumerateAll(axes: Axis[], limit: number): number[][] {
  let combos: number[][] = [[]]
  for (const a of axes) {
    const next: number[][] = []
    for (const c of combos) {
      for (let i = 0; i < a.values.length; i++) {
        next.push([...c, i])
        if (next.length >= limit) break
      }
      if (next.length >= limit) break
    }
    combos = next
  }
  return combos.slice(0, limit)
}

/** ランダム抽出（index ベース、count 件）。seed-free のため index は決め打ちで散らす。 */
function enumerateRandom(axes: Axis[], count: number): number[][] {
  const total = totalCombos(axes)
  const n = Math.min(count, total)
  const picks: number[][] = []
  const used = new Set<string>()
  // 決定的に散らす（再現性のため擬似乱数は使わず、等間隔サンプリング）
  for (let k = 0; picks.length < n && k < total; k++) {
    const idx = Math.floor((k * total) / n) % total
    let rem = idx
    const p: number[] = []
    for (const a of axes) {
      p.push(rem % a.values.length)
      rem = Math.floor(rem / a.values.length)
    }
    const key = p.join(',')
    if (!used.has(key)) {
      used.add(key)
      picks.push(p)
    }
  }
  return picks
}

export interface DryRunResult {
  total: number // 直積総数（mode に関わらず全列挙したときの数）
  planned: number // 実際に展開する数（mode 反映後）
  axes: { label: string; count: number }[]
  samples: { overridesLabel: string; positive: string }[]
}

/** ドライラン: 総数・展開数・サンプルプロンプトを返す。 */
export function dryRun(
  batch: BatchData,
  scene: GraphNode,
  nodes: GraphNode[],
  edges: GraphEdge[]
): DryRunResult {
  const axes = collectAxes(scene, nodes, edges)
  const total = totalCombos(axes)

  let picks: number[][]
  if (axes.length === 0) {
    picks = [[]]
  } else if (batch.mode === 'fixed') {
    picks = [axes.map(() => 0)] // 各軸の先頭（現在値相当）
  } else if (batch.mode === 'random') {
    picks = enumerateRandom(axes, Math.max(1, batch.randomCount))
  } else {
    picks = enumerateAll(axes, Math.max(1, batch.sampleCount))
  }

  const planned =
    batch.mode === 'all' ? total : batch.mode === 'random' ? Math.min(batch.randomCount, total) : 1

  const sampleN = Math.max(0, batch.sampleCount)
  const samples = picks.slice(0, sampleN).map((p) => {
    const ov = toOverrides(axes, p)
    const compiled = compileScene(scene, nodes, edges, ov)
    const label = axes.map((a, i) => `${a.label}=${a.values[p[i]]}`).join(' / ') || '(no axis)'
    return { overridesLabel: label, positive: compiled.positive }
  })

  return {
    total,
    planned,
    axes: axes.map((a) => ({ label: a.label, count: a.values.length })),
    samples
  }
}
