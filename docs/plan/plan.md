# 実装方針・計画

## スタック（確定）

- Electron + electron-vite + React 19 + `@xyflow/react`（React Flow）+ TypeScript + Tailwind CSS。
- ローカル LLM は llama.cpp（`llama-server.exe`）。GitHub Releases から自動DL・展開（lm-graph の `llamaInstaller.ts` を流用）。
- 永続化は当面プロジェクト JSON ファイル。将来 better-sqlite3 へ拡張余地を残す。

## 優先順位（マイルストーン）

1. **プロンプト合成まで（最優先）**
   - ノードグラフ編集 UI（React Flow）。
   - ノード型: Character / Solo Action / Interaction / Background / Lighting / Camera / Style / Seed / Scene。
   - Scene コンパイル = 素の合成（収集 → 順序 → weight → positive/negative）。可視性フィルタ・Forge・Dynamic Prompt は含めない。
   - プロジェクトの保存/読み込み（JSON）。
2. **llama.cpp インストーラ/サーバ管理**
   - リリース取得・バリアント選択（CUDA/CPU/Vulkan…）・DL・展開・起動・ヘルスチェック。
   - 今段階のゴールは「インストールできること」。OpenAI 互換クライアントの土台も用意。
3. 可視性フィルタ（カメラ → LLM で画面外要素を除去、ハッシュキャッシュ＋手修正）。
4. WebUI Forge 連携（txt2img / png-info / sd-models）。Reference ノードの分解。
5. Batch ノード（直積・展開モード・ドライラン・系譜記録）。
6. Dynamic Prompt。

## 流用方針（lm-graph）

- `src/main/llamaInstaller.ts`: ほぼそのまま流用（GitHub Releases → DL → tar 展開）。
- `src/main/llamaServer.ts`: 簡素化して流用（spawn / ポート確保 / ヘルスチェック / モデル列挙）。
- Electron + electron-vite + React Flow のスキャフォールド構成を踏襲。
- ノード型・Scene コンパイルは本アプリ独自（spec.md 準拠）に新規実装。

## 非対象（現時点）

- 領域分割系（Forge Couple / Regional Prompter）。
- 3人以上のキャラ。
- ピクセル単位の背景維持（inpaint/img2img）。
