import { nanoid } from 'nanoid'
import type { GraphNode, NodeData, NodeKind } from '@shared/types'

export const NODE_LABELS: Record<NodeKind, string> = {
  character: 'Character',
  soloAction: 'Solo Action',
  interaction: 'Interaction',
  background: 'Background',
  lighting: 'Lighting',
  camera: 'Camera',
  quality: 'Quality',
  style: 'Style',
  seed: 'Seed',
  reference: 'Reference',
  scene: 'Scene',
  batch: 'Batch',
  render: 'Render'
}

// Scene のカテゴリ別入力ピン。id はエッジの targetHandle に対応。
// kinds = そのピンに接続できるノード種別（誤接続防止に使う）。
export interface ScenePin {
  id: string
  label: string
  kinds: NodeKind[]
}

export const SCENE_INPUTS: ScenePin[] = [
  { id: 'chars', label: 'Character / Action', kinds: ['character', 'soloAction'] },
  { id: 'interaction', label: 'Interaction', kinds: ['interaction'] },
  { id: 'background', label: 'Background', kinds: ['background'] },
  { id: 'lighting', label: 'Lighting', kinds: ['lighting'] },
  { id: 'quality', label: 'Quality', kinds: ['quality'] },
  { id: 'style', label: 'Style', kinds: ['style'] },
  { id: 'camera', label: 'Camera', kinds: ['camera'] },
  { id: 'seed', label: 'Seed', kinds: ['seed'] }
]

/** ノード種別から対応する Scene 入力ピン id を返す。 */
export function scenePinForKind(kind: NodeKind): string | null {
  return SCENE_INPUTS.find((p) => p.kinds.includes(kind))?.id ?? null
}

// ノード種別ごとの既定の横幅（px）。リサイズで変更でき、保存される。
export const DEFAULT_NODE_WIDTH: Record<NodeKind, number> = {
  character: 240,
  soloAction: 240,
  interaction: 240,
  background: 240,
  lighting: 240,
  camera: 240,
  quality: 240,
  style: 240,
  seed: 240,
  reference: 340,
  scene: 270,
  batch: 320,
  render: 300
}

export function defaultData(kind: NodeKind): NodeData {
  switch (kind) {
    case 'character':
      return {
        kind,
        label: 'Character',
        person: 'girl',
        face: '',
        hair: '',
        upper: '',
        lower: '',
        fullbody: '',
        accessory: '',
        weight: 1
      }
    case 'soloAction':
      return { kind, label: 'Solo Action', tags: '', weight: 1 }
    case 'interaction':
      return { kind, label: 'Interaction', tags: '', weight: 1 }
    case 'background':
      return { kind, label: 'Background', tags: '', weight: 1 }
    case 'lighting':
      return { kind, label: 'Lighting', tags: '', weight: 1 }
    case 'quality':
      return { kind, label: 'Quality', tags: 'masterpiece, best quality', weight: 1 }
    case 'style':
      return { kind, label: 'Style', tags: '', weight: 1 }
    case 'camera':
      return {
        kind,
        label: 'Camera',
        presets: 'head focus, from above\nfull body, from below\ncowboy shot, from side',
        selected: 0
      }
    case 'seed':
      return { kind, label: 'Seed', mode: 'fixed', value: '-1', start: 0, step: 1, count: 4 }
    case 'reference':
      return {
        kind,
        label: 'Reference',
        imagePath: '',
        positive: '',
        negative: '',
        settings: '',
        buckets: {
          character: '',
          action: '',
          interaction: '',
          background: '',
          lighting: '',
          camera: '',
          quality: '',
          style: ''
        }
      }
    case 'batch':
      return { kind, label: 'Batch', mode: 'all', randomCount: 8, sampleCount: 5 }
    case 'render':
      return {
        kind,
        label: 'Render',
        model: null,
        sampler: 'Euler a',
        steps: 30,
        cfg: 7,
        width: 1280,
        height: 960
      }
    case 'scene':
      return {
        kind,
        label: 'Scene',
        peopleTagAuto: true,
        peoplePerCharacter: true,
        peopleTag: '',
        useBreak: true,
        visibilityEnabled: false,
        visibilityRemoved: [],
        visibilityKey: ''
      }
  }
}

export function createNode(kind: NodeKind, position: { x: number; y: number }): GraphNode {
  return { id: nanoid(8), kind, position, data: defaultData(kind), width: DEFAULT_NODE_WIDTH[kind] }
}
