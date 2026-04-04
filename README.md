# Prompt Graph

Prompt Graph は、ローカル LLM ワークフローをグラフとして構築するためのデスクトップアプリです。  
UI には Electron + React + React Flow、プロジェクト保存には SQLite、生成実行にはローカルの `llama.cpp` OpenAI 互換サーバーを使っています。

## 現在の機能

- プロジェクト一覧と手動保存
- `text` / `context` / `instruction` ノードによるグラフ編集
- 左右サイドバーのリサイズ
- 上流ノードをたどるコンテキスト収集
- ローカル `llama.cpp` を使ったストリーミング生成
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

アプリ起動後、`models/` 配下の GGUF ファイルを自動スキャンし、ヘッダーのモデルセレクターから選択できます。

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
4. 対象の `text` ノードを選択して `Generate` を実行します。
5. 現在の状態を保存したいときは、左サイドバーの `Save` を押します。

## ノード種類

- `text`: 下書きや生成結果の本文
- `context`: 参考情報や背景情報
- `instruction`: 生成時の指示文

## 生成の挙動

- 生成対象は常に `text` ノードです。
- 上流の `text` ノードは、本文履歴や素材として扱われます。
- 上流の `context` ノードは、参照コンテキストとして扱われます。
- 上流の `instruction` ノードは、システム指示として扱われます。
- 未保存の編集内容も、`Save` 前であっても生成に反映されます。

## 保存

- グラフ編集内容は、`Save` を押すまでローカルの作業状態として保持されます。
- 未保存の変更がある場合は、ダーティーインジケーターが表示されます。
- 未保存のままプロジェクト切り替えやアプリ終了を行うと、警告が表示されます。
- サイドバー状態、ミニマップ表示、コンテキスト長などの UI 設定は、Electron の `userData` 配下の JSON ファイルに保存されます。

## キーボードショートカット

- `Delete`: 選択中のノードまたはエッジを削除
- `Ctrl + C` / `Cmd + C`: 選択中ノードをコピー
- `Ctrl + V` / `Cmd + V`: 現在のビューポート中央付近にノードを貼り付け

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

- `node_modules/`, `out/`, `bin/`, `models/` はローカル専用で、コミットしない想定です。
- SQLite データベースはリポジトリ内ではなく、Electron の `userData` 配下に保存されます。
- `better-sqlite3` は Electron ランタイム向けの再ビルドが必要なため、`npm run rebuild:electron` を含めています。
