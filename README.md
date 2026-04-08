# Prompt Graph

Prompt Graph は、ローカル LLM ワークフローをノードグラフで構築する Windows 向けデスクトップアプリです。
Electron + React + React Flow を使い、プロジェクト保存には SQLite、生成実行にはローカルの `llama.cpp` OpenAI 互換サーバーを使います。

## 主な機能

- `text` / `context` / `instruction` / `image` ノードによるグラフ編集
- `text` ノード起点のストリーミング生成
- 上流ノードをたどるコンテキスト収集
- `context` / `instruction` の Global / Local スコープ
- 画像ノードのサムネール表示
- `text` ノードへの画像入力
- Vision 対応モデルでの画像付き生成
- 選択範囲の校正
- プロジェクト単位の保存、複製、削除
- UI 設定とプロジェクトごとのビューポート保存

## 動作要件

- Windows
- Node.js 24.x
- npm 11.x
- `models/` 配下に配置した GGUF モデル
- `bin/llama-server/` 配下に配置した `llama-server.exe`

## セットアップ

```powershell
npm install
npm run rebuild:electron
```

## 起動

開発起動:

```powershell
npm run dev
```

ビルド:

```powershell
npm run build
```

## モデル配置

このリポジトリにはモデル本体を含めません。ローカルに以下を配置してください。

- `models/<model-folder>/<model>.gguf`
- 必要なら `models/<model-folder>/mmproj-*.gguf`
- `bin/llama-server/.../llama-server.exe`

例:

```text
models/
  Qwen3.5-27B-GGUF/
    Qwen3.5-27B-Q6_K.gguf
    mmproj-Qwen3.5-27B-BF16.gguf
```

`mmproj` が同じモデルフォルダ内に見つかると、画像入力を Vision モデルとして扱います。

## 基本的な使い方

1. アプリを起動します。
2. キャンバス上でノードを追加します。
3. `text` ノードへ上流ノードを接続します。
4. `text` ノードの `Generate` で生成します。
5. 必要ならプロジェクトを保存します。

## ノードの役割

### text

生成対象の本文ノードです。`Generate` を実行できるのは `text` ノードだけです。

入力ハンドル:

- `T`: 上流 `text`
- `C`: `context`
- `I`: `instruction`
- `Img`: `image`

### context

生成時に参照させる背景情報です。`text` ノードの `C` に接続します。

### instruction

生成時の振る舞いを指示するノードです。`text` ノードの `I` に接続します。

### image

画像入力ノードです。`text` ノードの `Img` に接続します。

現在の仕様:

- `Add Image` では空の `image` ノードを作成します
- ノード中央のエリアをクリックすると画像を読み込みます
- 読み込み済みノードはクリックまたは `Replace image` で差し替えできます
- 画像は横幅に合わせて、縦も切れずに全体表示されます
- `image` ノードは Global / Local を持たず、接続先の `text` ノードにだけ作用します

## 画像入力の挙動

`text` ノードに複数の `image` ノードがつながっている場合、接続されている画像をすべて入力へ含めます。

- Vision 対応モデル: 実画像を `image_url` として送信
- Vision 非対応モデル: 画像のファイル名やサイズなどのメタ情報だけを送信

## Vision 対応について

画像を本当に読ませるには、以下の両方が必要です。

- Vision 対応 GGUF モデル
- 対応する `mmproj-*.gguf`

`mmproj` が見つからない場合、画像ノードは UI 上は使えますが、生成時には画像そのものは送られません。

## 保存先

アプリデータはリポジトリ直下の `data/` に保存されます。

- SQLite DB: `data/graph-chat.db`
- UI 設定: `data/preferences.json`
- 画像アセット: `data/assets/images/...`

画像本体は DB BLOB ではなくファイルとして保存され、DB にはメタデータを持たせています。

## 保存の挙動

- ノード編集はまず作業状態として保持されます
- 明示的に保存すると、プロジェクトのスナップショットが DB に保存されます
- 未保存のままプロジェクトを切り替えると確認ダイアログが出ます
- `保存しない` を選ぶと、最後に保存された状態へ巻き戻してから切り替えます

## 校正機能

テキスト編集中に選択した範囲を、ロード済みモデルに校正させられます。

- `Light / Standard / Aggressive / Custom`
- `Custom` では system prompt を保存可能
- `Tab` で適用、`Escape` で閉じる

## キーボードショートカット

- `Ctrl + S`: プロジェクト保存
- `Ctrl + C`: 選択ノードをコピー
- `Ctrl + V`: 貼り付け
- `Delete`: ノードまたはエッジ削除
- `Tab`: 校正案を適用
- `Escape`: 校正ポップアップを閉じる

## 主要ファイル

- `src/main/index.ts`: Electron メインプロセスと IPC
- `src/main/database.ts`: SQLite リポジトリ
- `src/main/llamaServer.ts`: `llama.cpp` サーバー管理
- `src/preload/index.ts`: preload ブリッジ
- `src/renderer/src/App.tsx`: メイン UI

## 備考

- `better-sqlite3` を使っているため、Electron 向けの再ビルドが必要です
- `node_modules/`, `out/`, `models/`, `bin/`, `data/` はローカル運用前提です
