# Prompt Graph

Prompt Graph は、ローカル LLM ワークフローをグラフとして構築するためのデスクトップアプリです。  
UI には Electron + React + React Flow、プロジェクト保存には SQLite、生成実行にはローカルの `llama.cpp` OpenAI 互換サーバーを使っています。

## 現在の機能

- プロジェクト一覧・インライン名前変更・プロジェクト単位の保存
- `text` / `context` / `instruction` ノードによるグラフ編集
- 左サイドバーと右パネルのリサイズ
- 右側を `Details` と `Settings` に分けた 2 ペイン UI
- 上流ノードをたどるコンテキスト収集
- ローカル `llama.cpp` を使ったストリーミング生成
- **生成キュー** — 生成中に別ノードの Generate を押すと順番待ちに入り、完了後に自動実行
- **Details 主体の閲覧・編集** — 長文は右の `Details` パネルで読む / 編集する構成
- **ノード本文の抜粋表示** — グラフ上の `text` ノードは全文ではなくプレビュー表示
- **生成中の軽量表示** — 生成ストリーミングは `Details` に表示し、グラフ上のノード本文は完了時にだけ更新
- **選択テキスト校正** — ノード編集時と `Details` 編集時の選択範囲に対して、自動で校正案を提示
- **校正プリセット** — `Light / Standard / Aggressive / Custom` の切り替え
- エッジスタイル切り替え（Bezier / Smooth Step / Step）
- SQLite によるプロジェクト永続化
- JSON による UI 設定の保存

## 動作要件

- Windows
- Node.js 24.x
- npm 11.x
- `models/` 配下に配置した GGUF モデル
- `bin/llama-server/` 配下に配置した `llama.cpp` サーバーファイル

## ローカルモデルの配置

このプロジェクトでは、以下のランタイム資産はリポジトリに含めず、ローカルに配置する前提です。

- `models/`
  - 例: `models/Qwen3.5-27B-GGUF/Qwen3.5-27B-Q6_K.gguf`
- `bin/llama-server/llama-b8648-bin-win-cuda-13.1-x64/`
  - `llama-server.exe` と関連 DLL を含めてください

アプリ起動後、`models/` 配下の GGUF ファイルを自動スキャンし、上部のモデルセレクターから選択できます。

## インストール

```powershell
npm install
npm run rebuild:electron
```

## 起動

推奨:

```powershell
.\start.bat
```

手動で開発起動する場合:

```powershell
npm run rebuild:electron
npm run dev
```

本番ビルド:

```powershell
npm run build
```

## 使い方

1. アプリを起動します。
2. キャンバスのコンテキストメニューからノードを追加します。
3. 上流ノードを、対象となる `text` ノードへ接続します。
4. `text` ノードを選択し、右の `Details` パネルから `Generate` を実行します。
5. 長文の確認や編集は `Details` パネルで行います。
6. 現在の状態を保存したいときは、左サイドバーの保存ボタンを押します。

## 右パネル構成

### Details

`Details` は、選択中ノードの閲覧・編集・生成を行う場所です。

- 長文の本文はここで全文表示します。
- タイトル行の右端に `Generate` と `Edit / Done` ボタンがあります。
- タイトルや本文をダブルクリックすると編集モードに入れます。
- 生成中のストリーミング本文はここに表示されます。
- `text` ノードでは、編集中に選択した範囲へ校正ポップアップを左側表示で出せます。

### Settings

`Settings` では、アプリ全体の表示と生成補助の設定を行います。

- Context Length
- Temperature
- MiniMap 表示
- Snap to Grid
- Edge Style
- Text Style
- Proofread on Select
- Proofread Preset / Custom System Prompt

## ノード種類

### text ノード

**本文の生成・編集を行うノードです。** グラフの中心的な存在で、`Generate` を実行できるのは `text` ノードだけです。

- 書きかけの原稿、章の下書き、アイデアメモなど、生成結果そのものを格納します。
- グラフ上では全文ではなく抜粋を表示します。
- 詳細な閲覧・編集・生成は右の `Details` パネルで行います。
- T ハンドルで上流の `text` ノードと繋ぐと、その内容を「素材」として参照しながら生成できます。
- C / I ハンドルで `context` / `instruction` ノードを受け取り、生成の参照情報や指示を注入できます。
- 出力ハンドルを下流の `text` ノードの T ハンドルへ繋ぐと、自身の内容が下流の生成素材になります。

左辺に 3 種類の入力ハンドルがあります：

| ハンドル | ラベル | 接続できるノード |
|----------|--------|-----------------|
| T        | Text   | text ノード |
| C        | Context | context ノード |
| I        | Instruction | instruction ノード |

右辺には 1 つの出力ハンドルがあり、下流の `text` ノードへ接続できます。

### context ノード

**生成時に参照させる背景情報や資料を保持するノードです。** LLM へのユーザーメッセージ（コンテキスト部分）として渡されます。

- 設定資料、キャラクター説明、過去のやり取りの要約、参考文など、生成の材料を入れます。
- `text` ノードの C ハンドルへ接続することで、その `text` の生成時に参照されます。
- **Global / Local** の 2 つのスコープがあります。

### instruction ノード

**生成時の振る舞いをモデルに指示するノードです。** LLM のシステムプロンプトとして渡されます。

- 文体・トーン・出力形式・禁止事項など、「どう書くか」を制御したいときに使います。
- `context` が「何を書くか」の材料であるのに対し、`instruction` は「どのように書くか」のルールです。
- `text` ノードの I ハンドルへ接続することで、その `text` の生成時にシステムプロンプトへ組み込まれます。
- **Global / Local** の 2 つのスコープがあります。

## 上流ノードのたどり方

`text` ノードで生成を実行すると、アプリは以下の順序でコンテキストを収集します。

```text
生成対象 (target)
  ├── T ハンドル: 直接の親 text ノード群 (directTextParents)
  │     └── T ハンドル: さらに上流の text ノード群 (upstreamTexts, 再帰的)
  ├── C ハンドル: 直接の context ノード群 (directContextParents)
  └── I ハンドル: 直接の instruction ノード群 (directInstructionParents)
```

さらに、**upstreamTexts に含まれる各 text ノード**に対しても、そのノードに接続されている `context` / `instruction` ノードを遡って収集します。ただし、収集対象は **Global スコープのノードのみ**です（Local スコープは伝播しません）。

### プロンプトの組み立て順序

| 役割 | 収集元 |
|------|--------|
| システムプロンプト | Global instruction（直接 + 上流） → Local instruction（直接のみ） |
| ユーザーコンテキスト | 直接の親 text → 上流 text → context（直接 + 上流 Global） → ターゲット情報 |

## Global / Local スコープ

`context` ノードと `instruction` ノードには **Global**（デフォルト）と **Local** の 2 種類のスコープがあります。`Details` パネルの `Scope` ドロップダウンで切り替えられます。

### Global（デフォルト）

グラフ全体を通じて伝播するスコープです。

- 直接接続された `text` ノードだけでなく、その下流にある `text` ノードが生成を実行した場合も参照されます。
- 例：`intro (text)` → `body (text)` という構成で `intro` に Global instruction を接続すると、`body` を生成するときにもその instruction が使われます。

### Local

直接接続した `text` ノードの生成にのみ適用されるスコープです。

- 下流の `text` ノードへは伝播しません。
- 「このノードだけ特別な指示で生成したい」「下流に漏らしたくない参照情報がある」といった用途に使います。

## 生成の挙動まとめ

- 生成対象は常に `text` ノードです。
- 上流の `text` ノードは T ハンドル経由で再帰的にたどられ、本文素材として使われます。
- 上流の `context` ノード（Global）は上流 text チェーン全体から収集されます。
- 上流の `context` ノード（Local）は直接接続された text のみに適用されます。
- 上流の `instruction` ノード（Global）はシステムプロンプトに集約されます。
- 上流の `instruction` ノード（Local）は直接接続された text の生成時のみシステムプロンプトに含まれます。
- 生成中のストリーミング本文は `Details` に表示され、グラフ上のノード本文は完了時にだけ更新されます。
- 未保存の編集内容も、`Save` 前であっても生成に反映されます。

## 保存

- グラフ編集内容は、プロジェクト項目の保存ボタンを押すまでローカルの作業状態として保持されます。
- 未保存の変更がある場合は、アクティブなプロジェクト項目に紫のドットと保存ボタンが表示されます。
- 未保存のままプロジェクト切り替えやアプリ終了を行うと、警告が表示されます。
- サイドバー状態、ミニマップ表示、エッジスタイル、文字設定、校正設定、**プロジェクトごとのカメラ位置・ズーム**などの UI 設定は、`data/preferences.json` に保存されます。
- プロジェクトを開くと、前回閉じたときのカメラ位置とズームから再開します。

## 校正機能

テキストを編集モードで選択すると、600ms 後に自動でロードされているモデルへ校正リクエストが送られます。

- ノード上のインライン編集と `Details` パネル編集の両方で使えます。
- `Details` 側では校正ポップアップを編集欄の左側に表示します。
- 校正結果はポップアップにストリーミング表示されます。
- `Tab` または「適用」ボタンで選択範囲を校正後テキストに置換します。
- `Escape` または「キャンセル」で閉じます。
- `Settings > Editing` から `Proofread on Select` をオン / オフできます。
- `Preset` で校正の積極度を切り替えられます。
- `Custom` を選ぶと、独自の system prompt を入力して保存できます。

## キーボードショートカット

- `Delete`: 選択中のノードまたはエッジを削除
- `Ctrl + C` / `Cmd + C`: 選択中ノードをコピー
- `Ctrl + V` / `Cmd + V`: 現在のビューポート中央付近にノードを貼り付け
- `Ctrl + S` / `Cmd + S`: 現在のプロジェクトを保存
- `Tab`: 校正ポップアップが表示中のとき、校正案を適用して確定
- `Escape`: 校正ポップアップを閉じる

貼り付けられた `text` ノードは、再利用しやすいように内容を空にした状態で作成されます。

## 重要なファイル

- `docs/GRAPH_CHAT_SPEC.md`: 機能仕様メモ
- `src/main/index.ts`: Electron メインプロセスと IPC
- `src/main/database.ts`: SQLite リポジトリ
- `src/main/llamaServer.ts`: ローカル `llama.cpp` サーバー管理
- `src/preload/index.ts`: renderer ブリッジ
- `src/renderer/src/App.tsx`: メイン UI
- `src/renderer/src/index.css`: renderer 共通スタイル
- `start.bat`: Windows 用起動ヘルパー

## 補足

- `node_modules/`, `out/`, `bin/`, `models/`, `data/` はローカル専用で、コミットしない想定です。
- SQLite データベース（`data/graph-chat.db`）と UI 設定（`data/preferences.json`）はプロジェクトルートの `data/` フォルダに保存されます。
- `better-sqlite3` は Electron ランタイム向けの再ビルドが必要なため、`npm run rebuild:electron` を含めています。
