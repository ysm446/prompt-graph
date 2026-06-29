# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際の指針。AGENTS.md（READ/WRITE の低レベル規約）と併用する。

## プロジェクト概要

ノードグラフ上で Stable Diffusion 用プロンプトを意味単位で組み立て、**組み合わせ（直積）で複数枚を一括生成**するデスクトップアプリ。詳細仕様は [docs/spec.md](docs/spec.md)。

- 二層構成: 「意味グラフ（本アプリ）」→ プロンプトにコンパイル → 「WebUI Forge API で実行」。
- 本アプリは意味ノードの編集・プロンプトへのコンパイル・ジョブ発行を担当。サンプラ等の低レベルは Forge に任せる。
- 参照実装: [ysm446/lm-graph](https://github.com/ysm446/lm-graph)（Electron + React Flow + TS のローカル LLM ノードアプリ）。**使える部分のみ流用**する。

## 技術スタック（確定事項）

- **TypeScript 一本**。spec.md は Python/FastAPI を想定していたが、lm-graph を踏襲し **Electron の main プロセス（TS）で完結**させる。Python ランタイムは使わない。
- フロント: Electron + React 19 + `@xyflow/react`（React Flow）+ Vite（electron-vite）
- スタイル: Tailwind CSS
- ローカル LLM: llama.cpp（`llama-server.exe`）。GitHub Releases から自動ダウンロード・展開する仕組みを lm-graph から流用（[src/main/llamaInstaller.ts](src/main/llamaInstaller.ts)）。
- 永続化: 当面はプロジェクト JSON ファイル。将来 SQLite（better-sqlite3）に拡張余地を残す。

## 現在のマイルストーン

1. **（進行中）プロンプト合成まで**: ノードグラフ編集 → Scene で素のプロンプト合成（収集 → 順序 → weight → positive）。negative プロンプトは使わない仕様。
2. llama.cpp インストーラ/サーバ管理（可視性フィルタ・参照分解の土台。今はインストールできることが目標）。
3. （後回し）可視性フィルタ（カメラ → LLM で画面外要素を除去）。
4. （後回し）WebUI Forge 連携（txt2img / png-info）。
5. （後回し）Dynamic Prompt。

進捗・方針は [docs/plan/](docs/plan/) の goal.md / plan.md / progress.md を参照・更新する。

## ディレクトリ構成

```
src/
  main/      Electron メインプロセス（ウィンドウ, IPC, llama.cpp 管理, 永続化）
  preload/   contextBridge による IPC 公開
  renderer/  React + React Flow の UI（ノード, Scene コンパイル）
models/      ユーザ配置の GGUF（例: gemma-4-E4B-it-GGUF, mmproj 同梱でvision対応）
bin/         自動DLした llama.cpp ランタイム（git 管理外）
data/        プロジェクト保存・設定（git 管理外）
docs/        spec.md, plan/, changelog.md
```

## コマンド

```powershell
npm install              # 依存導入
npm run dev              # 開発起動（electron-vite）
npm run build            # 型チェック + ビルド
```

better-sqlite3 を導入した場合は `npm run rebuild:electron` が必要（Electron 用ネイティブ再ビルド）。

> 開発メモ: VS Code / Claude Code の統合ターミナルでは環境変数 `ELECTRON_RUN_AS_NODE=1` が設定されていることがあり、その場合 `npm run dev` で Electron が GUI ではなく素の Node として起動して失敗する（`electron.app` が undefined になる）。通常のターミナルでは問題ない。統合ターミナルで起動する場合は事前に解除する: PowerShell `Remove-Item Env:ELECTRON_RUN_AS_NODE` / bash `unset ELECTRON_RUN_AS_NODE`。
>
> main / preload は CJS 出力（package.json に `"type":"module"` は付けない）。ESM 出力だと Electron の `electron` モジュールから名前付き import を解決できず起動に失敗する。それに伴い `tailwind.config.js` / `postcss.config.js` は CommonJS（`module.exports`）で記述する。

## 規約

- **文字コードは UTF-8 (BOM なし)**。日本語を多用するため重要。ファイル読み書きの低レベル手順は AGENTS.md を参照。
- ノード設計の中核原則（spec.md §3）を崩さない:
  - 要素を2階層に分類（空間に紐づく / 全体に効く）= 可視性フィルタの対象か否か。
  - ノード境界 = 直積の軸（束ねる=連動、分ける=直積）。
  - 鎖で束縛を明示（`character → solo action → scene`）。
- ソロアクション（`Act` ピン）と interaction（`Int` ピン）はハンドル型を分け、挿し間違いを構造的に防ぐ。
- 領域分割系（Forge Couple / Regional Prompter）は使わない。複数キャラは単一プロンプト合成（最大2人）。

## 作業開始時

AGENTS.md の手順に従い、docs/plan/ の goal.md・plan.md・progress.md を確認してから着手する。方針と矛盾しそうなら実装前に確認する。
