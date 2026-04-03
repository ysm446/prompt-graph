# Graph Chat — 仕様書

## 概要

Graph Chatは、ノードグラフ形式でLLMとのやり取りを構築・管理するデスクトップアプリケーションです。ノードを辿ることで文脈が形成され、分岐・派生バージョンの生成・保持を自然に行えます。ストーリー執筆、論文構成、シナリオ分岐、比較検討など汎用的な用途に対応します。

---

## 技術スタック

| 要素 | 採用技術 |
|------|----------|
| フレームワーク | Electron + React (TypeScript) |
| ノードグラフUI | React Flow |
| ローカルLLM | llama.cpp (OpenAI互換APIサーバー) |
| モデル | Qwen3.5 27B |
| ストレージ | SQLite (better-sqlite3) |
| スタイリング | Tailwind CSS |
| ストリーミング | llama.cpp SSE / OpenAI互換 `stream: true` |

---

## ノードの種類

### ノードタイプ一覧

| タイプ | 役割 | 生成ボタン | コンテキスト収集時の扱い |
|--------|------|-----------|--------------------------|
| `text` | 本文・生成コンテンツ | あり | userメッセージとして含める |
| `context` | 資料・世界観・キャラクター設定 | なし | userメッセージとして含める |
| `instruction` | 指示・スタイル・制約 | なし | systemプロンプトとして含める |

### 各ノードの構造

```typescript
type NodeType = 'text' | 'context' | 'instruction'

interface GraphNode {
  id: string
  type: NodeType
  title: string           // ノードの短いタイトル（キャンバス表示用）
  content: string         // 本文（ユーザーも編集可能）
  instruction?: string    // text/contextノードに内包できるローカル指示
  parentIds: string[]     // 複数親を許容
  metadata: {
    model: string
    createdAt: string
    updatedAt: string
    isGenerated: boolean  // LLM生成か手書きかのフラグ
  }
}

interface GraphEdge {
  id: string
  sourceId: string
  targetId: string
}
```

---

## ノード接続ルール

- ノードの入力ハンドルは**1つ**（左側）、複数エッジの接続を許可
- ノードの出力ハンドルは**1つ**（右側）、複数エッジの接続を許可
- `context`ノードや`instruction`ノードは複数を一つの`text`ノードに接続できる
- ループ（循環）は禁止（有向非巡回グラフ = DAG）

```
[context: 世界観] ──┐
[context: キャラA] ─┼→ [text: 第1章] → [text: 第2章-A]
[instruction: 文体] ─┘                → [text: 第2章-B]
```

---

## コンテキスト収集ロジック

生成ボタンを押したノードから**上流方向に再帰的に辿り**、文脈を収集します。

```typescript
function collectContext(nodeId: string): {
  systemPrompt: string
  userContext: string
} {
  const ancestors = traverseUpstream(nodeId)  // 重複除去・順序保持

  // instructionノード → systemプロンプト側に集約
  const systemParts = ancestors
    .filter(n => n.type === 'instruction')
    .map(n => n.content)

  // text/contextノード → userコンテキスト側に順番通りに並べる
  const userParts = ancestors
    .filter(n => n.type === 'text' || n.type === 'context')
    .map(n => n.content)

  // ノード内包のローカル指示もsystemに追加
  const localInstructions = ancestors
    .filter(n => n.instruction)
    .map(n => n.instruction!)

  return {
    systemPrompt: [...systemParts, ...localInstructions].join('\n'),
    userContext: userParts.join('\n\n')
  }
}
```

### 上流トラバース関数

```typescript
function traverseUpstream(nodeId: string, visited = new Set<string>()): GraphNode[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)

  const node = getNode(nodeId)
  const parents = node.parentIds.flatMap(pid => traverseUpstream(pid, visited))

  return [...parents, node]  // 祖先 → 自身の順
}
```

---

## 生成フロー（ストリーミング）

1. ユーザーが`text`ノードの「生成→」ボタンを押す
2. `collectContext(nodeId)`でsystemPromptとuserContextを収集
3. 新しい空の`text`ノードを即座に生成し、元ノードの右側に接続・配置
4. llama.cpp APIにストリーミングリクエストを送信

```typescript
// APIリクエスト構造
{
  model: "qwen3.5-27b",
  stream: true,
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContext + "\n\n---\n以上の文脈に続けて書いてください。" }
  ]
}
```

5. SSEで受信したチャンクを新ノードのcontentにリアルタイム追記・表示
6. 生成完了後、DBに保存
7. 生成中は「停止」ボタンを表示、押した時点の内容で確定

---

## UI構成

### メイン画面（3ペイン）

```
┌────────────┬──────────────────────────┬──────────────────────┐
│            │                          │                      │
│ プロジェクト │    React Flow キャンバス  │   編集パネル          │
│ サイドバー  │                          │   （選択ノードの詳細） │
│            │    [node] → [node]       │                      │
│ > Project A│              ↓           │   タイトル: ________  │
│   Project B│           [node]         │   内容:               │
│   Project C│                          │   [textarea]          │
│            │                          │                      │
│ [+ 新規]   │                          │   指示:               │
│            │                          │   [textarea]          │
│            │                          │                      │
└────────────┴──────────────────────────┴──────────────────────┘
```

### プロジェクトサイドバー

- プロジェクト一覧（クリックで切り替え）
- プロジェクトの新規作成・リネーム・削除
- 現在のプロジェクト名をヘッダーに表示

### ノードの表示（キャンバス上）

- タイトルを表示（内容は折りたたんで省略表示）
- タイプ別に色分け（text: 白、context: 青系、instruction: 橙系）
- `text`ノードのみ「生成→」ボタンを表示
- クリックで右の編集パネルに詳細を表示・編集

### 編集パネル

- タイトル入力
- 内容の`textarea`（自由編集可）
- ローカル指示の`textarea`（`text`/`context`ノードのみ）
- 生成中はローディング表示

---

## ノード操作

| 操作 | 方法 |
|------|------|
| ノード追加 | キャンバス右クリック → タイプ選択 |
| ノード削除 | 選択 → Deleteキー |
| ノード複製 | 選択 → Cmd/Ctrl+D（エッジは複製しない） |
| 接続 | ハンドルをドラッグして別ノードへ |
| 接続削除 | エッジを選択 → Deleteキー |
| パン・ズーム | マウスホイール / ドラッグ |

---

## 閲覧ページ（Reader View）

### 目的

特定のノードまでのパスを一本の文書として読むためのビュー。

### 動作

1. `text`ノードを右クリック →「ここまでの流れを閲覧」
2. そのノードまでの上流を辿り、`text`ノードの内容のみを順番に抽出
3. `context`と`instruction`は除外
4. マークダウンレンダリングで表示

### 機能

- コピー（クリップボードへ）
- エクスポート（`.txt` / `.md`）
- 印刷プレビュー

---

## データベース設計（SQLite）

```sql
-- プロジェクトテーブル
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- ノードテーブル
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('text', 'context', 'instruction')),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  instruction TEXT,
  model TEXT,
  is_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- エッジテーブル
CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  UNIQUE(source_id, target_id)
);

-- キャンバスレイアウト（React Flowの座標）
CREATE TABLE node_positions (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL
);
```

---

## 将来の拡張候補

| 機能 | 概要 |
|------|------|
| 指示テンプレート | よく使う`instruction`を保存・呼び出し |
| 要約ノード (`summary`) | 長い上流を要約してトークン節約 |
| モデル切り替え | ノードごとに使用モデルを指定 |
| 画像ノード | 画像を資料として接続 |
| グローバルcontext | 接続なしで全生成に含まれる設定 |

---

## 開発フェーズ案

### Phase 1 — 最小動作版
- プロジェクト管理サイドバー（作成・切り替え・削除）
- React Flow キャンバス（ノードの追加・接続・削除）
- 3タイプのノード（text / context / instruction）
- 編集パネル
- llama.cpp APIへのストリーミング生成
- SQLiteへの保存・読み込み

### Phase 2 — 使いやすさの向上
- ノード複製
- 閲覧ページ（Reader View）
- エクスポート（.txt / .md）
- 生成の停止ボタン

### Phase 3 — 拡張
- 指示テンプレート
- 要約ノード
- モデル切り替え
