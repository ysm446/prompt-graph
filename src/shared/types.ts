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
  | 'quality'
  | 'style'
  | 'seed'
  | 'reference'
  | 'scene'
  | 'batch'
  | 'render'

// 注意: 以下のノード data 型は React Flow の Node<T extends Record<string, unknown>>
// の制約を満たすため `type`（クローズドな型）で定義する。interface は宣言マージ可能
// なため Record<string, unknown> へ代入できず型エラーになる。

// spec §4.1: キャラのカテゴリ分け。各カテゴリは comma 区切りタグ文字列。
// （空間ゾーンタグ＝可視性フィルタ用は後段で追加する）
export type CharacterData = {
  label: string
  // 人物/被写体の数え名詞（例: girl, boy, guy, dog）。Scene が数えて人数タグ
  // （2girls / 1girl, 1dog 等）を生成する。タグ欄には出さない。空なら数えない。
  person: string
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

// seed の生成モード。Batch のスイープ軸にもなる。
export type SeedMode = 'fixed' | 'increment' | 'random' | 'list'

export type SeedData = {
  label: string
  mode: SeedMode
  value: string // fixed: 単一値 / list: カンマ区切り（-1 でランダム）
  start: number // increment: 開始値
  step: number // increment: 加算幅
  count: number // increment / random: 個数
}

// Reference: 既存画像のメタデータ(プロンプト)を読み込み、バケツに分解する。
// バケツは現状のノードカテゴリに対応させる。
export type ReferenceBuckets = {
  character: string
  action: string
  interaction: string
  background: string
  lighting: string
  camera: string
  quality: string
  style: string
}

export type ReferenceData = {
  label: string
  imagePath: string
  positive: string
  negative: string
  settings: string
  buckets: ReferenceBuckets
}

// Batch: スイープ軸の直積・ドライラン。
export type BatchMode = 'all' | 'random' | 'fixed'

export type BatchData = {
  label: string
  mode: BatchMode
  randomCount: number
  sampleCount: number
}

// Render: 接続した Scene のプロンプトを Forge (txt2img) で生成する。
// 生成画像は永続化しない（ワークスペース JSON が肥大化するため）。
export type RenderData = {
  label: string
  model: string | null // checkpoint title。null なら現在ロード中のモデル
  sampler: string
  steps: number
  cfg: number
  width: number
  height: number
  lastImagePath: string // 直近生成画像の保存先（次回起動時の再表示用。画像本体は保存しない）
  lastSeed: number | null // 直近生成の実 seed
}

export type SceneData = {
  label: string
  peopleTagAuto: boolean // 人数タグ（2girls 等）を自動付与するか
  // 自動付与時の置き方:
  //   true  = 各キャラ直前（1girl, 特徴, 1boy, 特徴 …）
  //   false = 先頭にまとめる（2girls, 1boy, 特徴 …）
  peoplePerCharacter: boolean
  peopleTag: string // 手動指定（auto が false のとき使用、常に先頭）
  useBreak: boolean // 複数キャラブロックを BREAK で分割（spec §6）
  // 可視性フィルタ（spec §4.11）: カメラのフレーミングから画面外の空間タグを除去
  visibilityEnabled: boolean
  visibilityRemoved: string[] // 除去するタグ（LLM が提案、ユーザー手修正可）
  visibilityKey: string // 最後に実行したときの入力ハッシュ（再実行判定用）
}

export type NodeData =
  | ({ kind: 'character' } & CharacterData)
  | ({ kind: 'soloAction' } & TagData)
  | ({ kind: 'interaction' } & TagData)
  | ({ kind: 'background' } & TagData)
  | ({ kind: 'lighting' } & TagData)
  | ({ kind: 'quality' } & TagData)
  | ({ kind: 'style' } & TagData)
  | ({ kind: 'camera' } & CameraData)
  | ({ kind: 'seed' } & SeedData)
  | ({ kind: 'reference' } & ReferenceData)
  | ({ kind: 'scene' } & SceneData)
  | ({ kind: 'batch' } & BatchData)
  | ({ kind: 'render' } & RenderData)

export interface GraphNode {
  id: string
  kind: NodeKind
  position: { x: number; y: number }
  data: NodeData
  width?: number // ノードの横幅（リサイズで変更・永続化）。高さは内容に追従。
  height?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

// ワークスペース = 1 つのグラフ（プロジェクト）。複数を保持・切替できる。
export interface ProjectSnapshot {
  version: 1
  id: string
  name: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// 左サイドバー一覧用のメタ情報。
export interface WorkspaceMeta {
  id: string
  name: string
  updatedAt: string
}

export interface AppSettings {
  selectedModelPath: string | null
  contextSize: number
  visibilityPrompt: string // 可視性フィルタのシステムプロンプト（編集可）
  showResources: boolean // システムリソース表示のオンオフ
  showMinimap: boolean // ミニマップ表示のオンオフ
  snapToGrid: boolean // ノードの移動・リサイズをグリッドにスナップ
  forgeHost: string // WebUI Forge のホスト
  forgePort: number // WebUI Forge のポート
  forgePython: string // Forge 用 Python 3.10 の実行パス/コマンド（空なら自動検出）
}

export interface SystemResources {
  cpu: number // 使用率 %
  memUsed: number // bytes
  memTotal: number // bytes
  gpu: { util: number; memUsed: number; memTotal: number } | null // util %, VRAM MB
}

// ============================================================
// Scene コンパイル結果
// ============================================================

export interface CompiledScene {
  sceneId: string
  positive: string // コピー用（1 行）
  positivePretty: string // 表示用（パートごとに空行区切り）
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

// ============================================================
// WebUI Forge（stable-diffusion-webui-forge）
// image-assistant の sd_process.py 相当を TS へ移植。
// ============================================================

// git clone の進捗。git の stderr（"Receiving objects: 42%"）をパースして通知。
export type ForgeInstallProgress =
  | { phase: 'clone'; label: string; percent: number | null }
  | { phase: 'done'; path: string }
  | { phase: 'error'; message: string }

export interface ForgeInstall {
  path: string // stable-diffusion-webui-forge ディレクトリの絶対パス
  clonedAt: string
}

export type ForgeServerState = 'stopped' | 'starting' | 'running' | 'error'

export interface ForgeServerStatus {
  state: ForgeServerState
  url: string | null
  message: string | null
}

// txt2img（/sdapi/v1/txt2img）。本アプリは negative を使わない仕様。
export interface ForgeSdModel {
  title: string // override_settings.sd_model_checkpoint に渡す値
  modelName: string
}

export interface ForgeTxt2ImgParams {
  prompt: string
  steps: number
  cfgScale: number
  sampler: string
  width: number
  height: number
  seed: number // -1 でランダム
  model: string | null // checkpoint title。null なら現在ロード中のモデル
}

export interface ForgeTxt2ImgResult {
  imageDataUrl: string // data:image/png;base64,...
  seed: number | null
  savedPath: string // 保存された PNG の絶対パス
}
