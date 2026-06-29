import { nanoid } from 'nanoid'
import type { GraphNode, NodeData, NodeKind } from '@shared/types'

export const NODE_LABELS: Record<NodeKind, string> = {
  character: 'Character',
  soloAction: 'Solo Action',
  interaction: 'Interaction',
  background: 'Background',
  lighting: 'Lighting',
  camera: 'Camera',
  style: 'Style',
  seed: 'Seed',
  scene: 'Scene'
}

export function defaultData(kind: NodeKind): NodeData {
  switch (kind) {
    case 'character':
      return {
        kind,
        label: 'Character',
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
    case 'style':
      return { kind, label: 'Style', tags: 'masterpiece, best quality', weight: 1 }
    case 'camera':
      return {
        kind,
        label: 'Camera',
        presets: 'head focus, from above\nfull body, from below\ncowboy shot, from side',
        selected: 0
      }
    case 'seed':
      return { kind, label: 'Seed', value: '-1' }
    case 'scene':
      return {
        kind,
        label: 'Scene',
        peopleTagAuto: true,
        peopleTag: '',
        useBreak: true
      }
  }
}

export function createNode(kind: NodeKind, position: { x: number; y: number }): GraphNode {
  return { id: nanoid(8), kind, position, data: defaultData(kind) }
}
