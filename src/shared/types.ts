// 共有ドメイン型: main / preload / renderer で共用する。

// ============================================================
// グラフ・ノード
// ============================================================

export type NodeKind =
  | 'character'
  | 'soloAction'
  | 'interaction'
  | 'background'
  | 'lighting'
  | 'camera'
  | 'style'
  | 'seed'
  | 'scene'

// 注意: 以下のノード data 型は React Flow の Node<T extends Record<string, unknown>>
// の制約を満たすため `type`（クローズドな型）で定義する。interface は宣言マージ可能
// なため Record<string, unknown> へ代入できず型エラーになる。

// spec §4.1: キャラのカテゴリ分け。各カテゴリは comma 区切りタグ文字列。
// （空間ゾーンタグ＝可視性フィルタ用は後段で追加する）
export type CharacterData = {
  label: string
  face: string
  hair: string
  upper: string
  lower: string
  fullbody: string
  accessory: string
  weight: number // ブロック全体の強調。1.0 で無効。
}

export type TagData = {
  label: string
  tags: string
  weight: number
}

// spec §4.6: 1行=1プリセット, 行内カンマ=束。MVP では選択プリセットを1つ使う。
export type CameraData = {
  label: string
  presets: string // 改行区切りのプリセット集合
  selected: number // 使用するプリセットの行インデックス
}

export type SeedData = {
  label: string
  value: string // 単一またはカンマ区切り（スイープは後段）
}

export type SceneData = {
  label: string
  peopleTagAuto: boolean // 人数タグ（2girls 等）を自動付与するか
  peopleTag: string // 手動指定（auto が false のとき使用）
  useBreak: boolean // 複数キャラブロックを BREAK で分割（spec §6）
  negative: string // negative プロンプト
}

export type NodeData =
  | ({ kind: 'character' } & CharacterData)
  | ({ kind: 'soloAction' } & TagData)
  | ({ kind: 'interaction' } & TagData)
  | ({ kind: 'background' } & TagData)
  | ({ kind: 'lighting' } & TagData)
  | ({ kind: 'style' } & TagData)
  | ({ kind: 'camera' } & CameraData)
  | ({ kind: 'seed' } & SeedData)
  | ({ kind: 'scene' } & SceneData)

export interface GraphNode {
  id: string
  kind: NodeKind
  position: { x: number; y: number }
  data: NodeData
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export interface ProjectSnapshot {
  version: 1
  name: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface AppSettings {
  selectedModelPath: string | null
  contextSize: number
}

// ============================================================
// Scene コンパイル結果
// ============================================================

export interface CompiledScene {
  sceneId: string
  positive: string
  negative: string
  seed: string | null
  warnings: string[]
}

// ============================================================
// llama.cpp（lm-graph から流用）
// ============================================================

export type LlamaBackendFamily = 'cuda' | 'cpu' | 'vulkan' | 'hip' | 'sycl' | 'other'

export interface LlamaReleaseVariant {
  key: string
  label: string
  family: LlamaBackendFamily
  assetName: string
  assetUrl: string
  sizeBytes: number
  cudartName: string | null
  cudartUrl: string | null
  cudartSizeBytes: number | null
}

export interface LlamaRelease {
  tag: string
  name: string
  publishedAt: string | null
  htmlUrl: string
  variants: LlamaReleaseVariant[]
}

export type LlamaInstallProgress =
  | { phase: 'download'; fileLabel: string; received: number; total: number | null; percent: number | null }
  | { phase: 'extract'; fileLabel: string }
  | { phase: 'done'; build: string | null; path: string }
  | { phase: 'error'; message: string }

export interface LlamaInstall {
  build: string | null
  path: string // llama-server.exe への絶対パス
  installedAt: string
}

export interface LlamaModel {
  fileName: string
  path: string
  sizeBytes: number
  quant: string | null
  params: string | null
  hasVision: boolean
  mmprojPath: string | null
}

export type LlamaServerState = 'stopped' | 'starting' | 'running' | 'error'

export interface LlamaServerStatus {
  state: LlamaServerState
  baseUrl: string | null
  modelPath: string | null
  message: string | null
}
