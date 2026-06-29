# 進捗

> 新しい記録を各セクションの上に追記する。日付は `YYYY-MM-DD`。

## 2026-06-29

- 方針確定: TypeScript 一本（Electron main で完結、lm-graph 踏襲）。可視性フィルタは後回し、まず素のプロンプト合成。
- 計画ドキュメント（goal/plan/progress）と CLAUDE.md を整備。
- **マイルストーン1（プロンプト合成）+ llama.cpp インストーラの土台を実装・動作確認まで完了。**
  - スキャフォールド: Electron + electron-vite + React 19 + @xyflow/react + TS + Tailwind。
  - main: `llamaInstaller.ts`（lm-graph 流用、GitHub Releases→DL→tar 展開）、`llamaServer.ts`（モデル列挙/起動/ヘルスチェック）、`store.ts`（JSON 永続化）、IPC。
  - renderer: 9 ノード型（Character/SoloAction/Interaction/Background/Lighting/Camera/Style/Seed/Scene）、zustand ストア、Scene コンパイル（収集→人数タグ→順序→weight→BREAK→positive/negative）、合成結果パネル、llama.cpp 管理パネル。
  - 共有: `shared/types.ts`・`shared/compile.ts`・`shared/api.ts`・`shared/ipc.ts`。
  - 検証: `npm run typecheck` / `npm run build` / `npm run dev`（GUI 起動）すべて通過。

### 次にやること（未着手）

- 可視性フィルタ（カメラ→LLM、ハッシュキャッシュ＋手修正）。
- WebUI Forge 連携（txt2img / png-info / sd-models）と Reference ノード。
- Batch ノード（直積・ドライラン・系譜）。Dynamic Prompt。
- ハンドル型の厳密化（Act/Int ピン分離。現状 Scene は単一入力ハンドルで node kind により判別）。
- SQLite 移行（現状は単一 project.json）。

### 注意点

- 文字コードは UTF-8 (BOM なし) を厳守（日本語多用）。
- bin/ と data/ は git 管理外（.gitignore）。models/ の *.gguf も管理外。
- models/ に gemma-4-E4B-it-GGUF（Q4_K_M ＋ mmproj、vision対応）が既配置。
- main/preload は CJS 出力（`"type":"module"` 不使用）。config 類は `module.exports`。
- 統合ターミナルでは `ELECTRON_RUN_AS_NODE` を解除してから `npm run dev`。
