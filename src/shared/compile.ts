// Scene コンパイル: 上流ノードをたどって素のプロンプトを合成する。
// （可視性フィルタ・Forge 連携・Dynamic Prompt は後段。ここでは素の合成のみ）
import type {
  CharacterData,
  CompiledScene,
  GraphEdge,
  GraphNode,
  NodeData,
  TagData
} from './types'

/** "a, b,, c" -> ["a","b","c"] */
function splitTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

/** weight が 1 以外なら (block:weight) で括る。SD の強調記法。 */
function applyWeight(block: string, weight: number): string {
  if (!block) return ''
  if (!Number.isFinite(weight) || weight === 1) return block
  return `(${block}:${Number(weight.toFixed(2))})`
}

function characterTags(data: CharacterData): string[] {
  return [data.face, data.hair, data.upper, data.lower, data.fullbody, data.accessory].flatMap(
    splitTags
  )
}

interface Graph {
  nodes: Map<string, GraphNode>
  /** target -> その上流（source）ノード id 群 */
  incomers: Map<string, string[]>
}

function buildGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  const map = new Map(nodes.map((n) => [n.id, n]))
  const incomers = new Map<string, string[]>()
  for (const e of edges) {
    if (!map.has(e.source) || !map.has(e.target)) continue
    const list = incomers.get(e.target) ?? []
    list.push(e.source)
    incomers.set(e.target, list)
  }
  return { nodes: map, incomers }
}

function dataOf<T extends NodeData['kind']>(node: GraphNode, kind: T): Extract<NodeData, { kind: T }> | null {
  return node.data.kind === kind ? (node.data as Extract<NodeData, { kind: T }>) : null
}

/**
 * キャラの鎖（character → solo action → scene）を1ブロックに解決する。
 * 起点が soloAction なら上流の character を拾い、bare character ならそのまま。
 */
interface ChainResult {
  block: string
  person?: string // 人数タグ集計用の数え名詞（character が解決できたときのみ）
  warning?: string
}

function resolveCharacterChain(startId: string, g: Graph): ChainResult | null {
  const start = g.nodes.get(startId)
  if (!start) return null

  if (start.data.kind === 'character') {
    const c = start.data
    const block = characterTags(c).join(', ')
    return { block: applyWeight(block, c.weight), person: c.person ?? 'girl' }
  }

  if (start.data.kind === 'soloAction') {
    const action = start.data as TagData & { kind: 'soloAction' }
    // soloAction の上流から character を探す
    const ups = g.incomers.get(startId) ?? []
    const charNode = ups.map((id) => g.nodes.get(id)).find((n) => n?.data.kind === 'character')
    const actionTags = splitTags(action.tags)
    if (!charNode) {
      const block = applyWeight(actionTags.join(', '), action.weight)
      return block
        ? { block, warning: `Solo Action「${action.label || action.tags}」に Character が接続されていません` }
        : null
    }
    const c = charNode.data as CharacterData & { kind: 'character' }
    const parts = [...characterTags(c), ...actionTags]
    const block = parts.join(', ')
    // weight はキャラ側を優先（束ねたブロック全体に適用）
    return { block: applyWeight(block, c.weight), person: c.person ?? 'girl' }
  }

  return null
}

/** 英語名詞の簡易複数形化（girl→girls, fox→foxes, lady→ladies, guy→guys）。 */
function pluralize(noun: string): string {
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`
  return `${noun}s`
}

/**
 * 接続キャラの数え名詞を集計して人数タグを作る（記述式）。
 * 例: [girl, girl] → '2girls' / [girl, dog] → '1girl, 1dog' / [guy, guy] → '2guys'。
 * 出現順を保持。空文字は数えない。
 */
function aggregatePeopleTag(persons: string[]): string | null {
  const order: string[] = []
  const counts = new Map<string, number>()
  for (const raw of persons) {
    const noun = raw.trim().toLowerCase()
    if (!noun) continue
    if (!counts.has(noun)) order.push(noun)
    counts.set(noun, (counts.get(noun) ?? 0) + 1)
  }
  const tags = order.map((noun) => {
    const n = counts.get(noun)!
    return n === 1 ? `1${noun}` : `${n}${pluralize(noun)}`
  })
  return tags.length > 0 ? tags.join(', ') : null
}

/** 単一 Scene をコンパイルする。 */
export function compileScene(sceneNode: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): CompiledScene {
  const g = buildGraph(nodes, edges)
  const scene = dataOf(sceneNode, 'scene')
  const warnings: string[] = []
  const ups = (g.incomers.get(sceneNode.id) ?? []).map((id) => g.nodes.get(id)!).filter(Boolean)

  // --- 収集 ---
  const characterBlocks: string[] = []
  const persons: string[] = []
  const qualities: string[] = []
  const interactions: string[] = []
  const backgrounds: string[] = []
  const lightings: string[] = []
  const styles: string[] = []
  let seed: string | null = null

  for (const up of ups) {
    switch (up.data.kind) {
      case 'character':
      case 'soloAction': {
        const r = resolveCharacterChain(up.id, g)
        if (r) {
          if (r.warning) warnings.push(r.warning)
          if (r.block) characterBlocks.push(r.block)
          if (r.person) persons.push(r.person)
        }
        break
      }
      case 'interaction': {
        const d = up.data as TagData
        const b = applyWeight(splitTags(d.tags).join(', '), d.weight)
        if (b) interactions.push(b)
        break
      }
      case 'background': {
        const d = up.data as TagData
        const b = applyWeight(splitTags(d.tags).join(', '), d.weight)
        if (b) backgrounds.push(b)
        break
      }
      case 'lighting': {
        const d = up.data as TagData
        const b = applyWeight(splitTags(d.tags).join(', '), d.weight)
        if (b) lightings.push(b)
        break
      }
      case 'quality': {
        const d = up.data as TagData
        const b = applyWeight(splitTags(d.tags).join(', '), d.weight)
        if (b) qualities.push(b)
        break
      }
      case 'style': {
        const d = up.data as TagData
        const b = applyWeight(splitTags(d.tags).join(', '), d.weight)
        if (b) styles.push(b)
        break
      }
      case 'camera': {
        const d = up.data
        const lines = d.presets.split('\n').map((l) => l.trim()).filter(Boolean)
        const chosen = lines[d.selected] ?? lines[0]
        if (chosen) styles.push(chosen) // MVP: カメラ束はそのまま付与（順序は後述で末尾寄り）
        break
      }
      case 'seed': {
        const v = up.data.value.trim()
        if (v) seed = v.split(',')[0].trim()
        break
      }
      default:
        break
    }
  }

  // --- 人数タグ（spec §6）: キャラの種別を集計して 2girls / 1girl, 1boy などにする ---
  let peopleTag: string | null = null
  if (scene) {
    if (scene.peopleTagAuto) peopleTag = aggregatePeopleTag(persons)
    else peopleTag = scene.peopleTag.trim() || null
  }

  // --- 順序づけ（spec §5-5）: quality(先頭) → 人数 → キャラ各ブロック → interaction → background → lighting → style ---
  const useBreak = scene?.useBreak ?? false
  const segments: string[] = []
  segments.push(...qualities) // 品質タグはプロンプト先頭（効きを最大化）
  if (peopleTag) segments.push(peopleTag)

  if (useBreak && characterBlocks.length > 1) {
    // キャラブロックを BREAK で CLIP チャンク分割（特徴の混ざり軽減）
    characterBlocks.forEach((b, i) => {
      if (i > 0) segments.push('BREAK')
      segments.push(b)
    })
  } else {
    segments.push(...characterBlocks)
  }

  segments.push(...interactions, ...backgrounds, ...lightings, ...styles)

  const positive = segments.filter(Boolean).join(', ').replace(/,\s*BREAK\s*,/g, ', BREAK, ')

  if (characterBlocks.length === 0) warnings.push('Character が1つも接続されていません')
  if (characterBlocks.length > 2) warnings.push('キャラは最大2人を想定（3人以上はスコープ外）')

  return { sceneId: sceneNode.id, positive, seed, warnings }
}
