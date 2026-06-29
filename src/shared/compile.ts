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

/** removeSet（小文字化済み）に含まれるタグを落とす。可視性フィルタの適用。 */
function filterRemoved(tags: string[], removeSet: Set<string>): string[] {
  if (removeSet.size === 0) return tags
  return tags.filter((t) => !removeSet.has(t.trim().toLowerCase()))
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

function resolveCharacterChain(startId: string, g: Graph, removeSet: Set<string>): ChainResult | null {
  const start = g.nodes.get(startId)
  if (!start) return null

  if (start.data.kind === 'character') {
    const c = start.data
    const block = filterRemoved(characterTags(c), removeSet).join(', ')
    return { block: applyWeight(block, c.weight), person: c.person ?? 'girl' }
  }

  if (start.data.kind === 'soloAction') {
    const action = start.data as TagData & { kind: 'soloAction' }
    // soloAction の上流から character を探す
    const ups = g.incomers.get(startId) ?? []
    const charNode = ups.map((id) => g.nodes.get(id)).find((n) => n?.data.kind === 'character')
    const actionTags = filterRemoved(splitTags(action.tags), removeSet)
    if (!charNode) {
      const block = applyWeight(actionTags.join(', '), action.weight)
      return block
        ? { block, warning: `Solo Action「${action.label || action.tags}」に Character が接続されていません` }
        : null
    }
    const c = charNode.data as CharacterData & { kind: 'character' }
    const parts = [...filterRemoved(characterTags(c), removeSet), ...actionTags]
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

/** 表示用に各パートを1行空けて連結する（BREAK はカンマなしで独立行）。 */
function buildPretty(segments: string[]): string {
  let out = ''
  for (const s of segments) {
    if (!out) {
      out = s
      continue
    }
    if (s === 'BREAK' || out.endsWith('BREAK')) out += `\n\n${s}`
    else out += `,\n\n${s}`
  }
  return out
}

/** 単一 Scene をコンパイルする。 */
export function compileScene(sceneNode: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): CompiledScene {
  const g = buildGraph(nodes, edges)
  const scene = dataOf(sceneNode, 'scene')
  const warnings: string[] = []
  const ups = (g.incomers.get(sceneNode.id) ?? []).map((id) => g.nodes.get(id)!).filter(Boolean)

  // 可視性フィルタの除去セット（空間要素＝キャラ/背景のタグにのみ適用）
  const removeSet =
    scene?.visibilityEnabled && scene.visibilityRemoved
      ? new Set(scene.visibilityRemoved.map((t) => t.trim().toLowerCase()).filter(Boolean))
      : new Set<string>()

  // --- 収集 ---
  const characterEntries: Array<{ block: string; person?: string }> = []
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
        const r = resolveCharacterChain(up.id, g, removeSet)
        if (r) {
          if (r.warning) warnings.push(r.warning)
          if (r.block || r.person) characterEntries.push({ block: r.block, person: r.person })
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
        const b = applyWeight(filterRemoved(splitTags(d.tags), removeSet).join(', '), d.weight)
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

  // --- 人数タグ（spec §6） ---
  const auto = scene?.peopleTagAuto ?? true
  const perCharacter = scene?.peoplePerCharacter ?? true
  const persons = characterEntries.map((e) => e.person).filter((p): p is string => !!p)

  // perCharacter（自動＋各キャラ直前）のときは、各ブロック先頭に 1<noun> を付ける
  const interleavePeople = auto && perCharacter
  const charBlocks = characterEntries.map((e) => {
    if (!interleavePeople) return e.block
    const noun = (e.person ?? '').trim().toLowerCase()
    return [noun ? `1${noun}` : '', e.block].filter(Boolean).join(', ')
  })

  // 先頭にまとめる人数タグ（perCharacter のときは付けない）
  let frontPeopleTag: string | null = null
  if (!interleavePeople) {
    frontPeopleTag = auto ? aggregatePeopleTag(persons) : scene?.peopleTag.trim() || null
  }

  // --- 順序づけ（spec §5-5）: quality(先頭) → 人数 → キャラ各ブロック → interaction → background → lighting → style ---
  const useBreak = scene?.useBreak ?? false
  const segments: string[] = []
  segments.push(...qualities) // 品質タグはプロンプト先頭（効きを最大化）
  if (frontPeopleTag) segments.push(frontPeopleTag)

  if (useBreak && charBlocks.length > 1) {
    // キャラブロックを BREAK で CLIP チャンク分割（特徴の混ざり軽減）
    charBlocks.forEach((b, i) => {
      if (i > 0) segments.push('BREAK')
      segments.push(b)
    })
  } else {
    segments.push(...charBlocks)
  }

  segments.push(...interactions, ...backgrounds, ...lightings, ...styles)

  const clean = segments.filter(Boolean)
  // コピー用: 1 行のクリーンな形
  const positive = clean.join(', ').replace(/,\s*BREAK\s*,/g, ', BREAK, ')
  // 表示用: パートごとに 1 行空けて見やすく（SD は改行を無視するので意味は同じ）
  const positivePretty = buildPretty(clean)

  if (characterEntries.length === 0) warnings.push('Character が1つも接続されていません')
  if (characterEntries.length > 2) warnings.push('キャラは最大2人を想定（3人以上はスコープ外）')

  return { sceneId: sceneNode.id, positive, positivePretty, seed, warnings }
}

/**
 * 可視性フィルタの入力を集める。
 * - framing: 接続された Camera の選択プリセット（アングル/フレーミング）。
 * - tags: 空間に紐づく候補タグ（キャラのカテゴリ + ソロアクション + 背景）。重複除去。
 * lighting / quality / style は対象外（全体に効くので素通り）。
 */
export function getVisibilityInput(
  sceneNode: GraphNode,
  nodes: GraphNode[],
  edges: GraphEdge[]
): { framing: string | null; tags: string[] } {
  const g = buildGraph(nodes, edges)
  const ups = (g.incomers.get(sceneNode.id) ?? []).map((id) => g.nodes.get(id)!).filter(Boolean)
  const tags: string[] = []
  let framing: string | null = null

  for (const up of ups) {
    if (up.data.kind === 'character') {
      tags.push(...characterTags(up.data))
    } else if (up.data.kind === 'soloAction') {
      const chUps = g.incomers.get(up.id) ?? []
      const charNode = chUps.map((id) => g.nodes.get(id)).find((n) => n?.data.kind === 'character')
      if (charNode?.data.kind === 'character') tags.push(...characterTags(charNode.data))
      tags.push(...splitTags(up.data.tags))
    } else if (up.data.kind === 'background') {
      tags.push(...splitTags(up.data.tags))
    } else if (up.data.kind === 'camera') {
      const lines = up.data.presets.split('\n').map((l) => l.trim()).filter(Boolean)
      framing = lines[up.data.selected] ?? lines[0] ?? null
    }
  }

  // 重複除去（小文字キーで判定し、最初の表記を残す）
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const t of tags) {
    const key = t.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(t.trim())
  }
  return { framing, tags: deduped }
}

/** 可視性フィルタの入力ハッシュ（再実行判定用）。 */
export function visibilityHash(framing: string | null, tags: string[]): string {
  return JSON.stringify({ f: framing ?? '', t: [...tags].map((t) => t.toLowerCase()).sort() })
}
