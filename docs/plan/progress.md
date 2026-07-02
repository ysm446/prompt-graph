# 進捗

> 新しい記録を各セクションの上に追記する。日付は `YYYY-MM-DD`。

## 2026-07-02 (ノードグラフのデザインを lm-graph に統一)

- lm-graph のデザイン言語（CSS 変数トークン / カード型ノード / 種別色エッジ）を移植。
  - `styles.css`: `:root` に lm-graph と同じトークン（`--bg-card` `#1c1f2b`, `--border-strong`, `--accent` `#7c5af7` 等）を定義。MiniMap / Controls / 選択矩形 / ハンドル / リサイズコーナーの React Flow 上書きも lm-graph 準拠に。フォントに Inter / Noto Sans JP を追加。
  - `graph/nodes.tsx` の `Shell`: べた塗りヘッダー → 「カード背景 + 種別色の 2px 枠（`color-mix` で 60% ミュート）+ `rounded-2xl` + アクセント色アイコン + uppercase 種別ラベル」。選択時は紫 `ring-4`（lm-graph と同じ）。本文は `node-scrollbar` 付きスクロール。Scene の入力ピン列は `beforeBody`（スクロール外）に移し 13px ハンドルの見切れを防止。
  - ハンドル: 7px → 13px の縁取りドット（塗り=種別アクセント、縁=キャンバス色）。::before の当たり判定拡張は維持。
  - `graph/edges.tsx`（新規）: 接続元ノードの種別色で着色する角丸 smoothstep エッジ（`borderRadius:40`, 太さ 2.6 / 選択時 3.5）。`edgeTypes.default` を上書きするので保存済みエッジにもそのまま適用。
  - `App.tsx`: キャンバス `--bg-canvas` `#181b23` + ドットグリッド `#394154`、MiniMap を種別色ノード表示に、ノード追加パネル / 右クリックメニュー / アプリ外枠をトークンベースに更新。
  - ACCENT（種別 12 色）はそのまま維持（枠・ハンドル・エッジ・MiniMap の一貫した色分けの単一ソース）。
- 検証: typecheck / build 通過。Playwright(_electron) で実起動し、実ワークスペース（12 ノード・9 エッジ）で新デザイン（カード / 種別色エッジ / 選択リング / リサイズ）をスクリーンショット確認。

## 2026-06-29 (Batch / Reference / Seed モード)

- **Batch ノード**（spec §4.12）: Scene→Batch 接続。多値軸（Camera プリセット>1, Seed 値>1）の直積を計算し、**ドライラン**（総数・展開数・軸一覧・サンプルプロンプト）を表示。展開モード（全列挙/ランダム抽出/固定）。`shared/batch.ts`、`compileScene` に overrides 引数。実生成（Forge ジョブ発行）は後段。
- **Seed ノードのモード**: fixed / increment（+step ずつ）/ random（-1×個数）/ list。`seedValues()` で値リスト化し、Batch の軸にもなる。
- **Reference ノード**（spec §4.9, 一部）: 画像読込→**ローカルで A1111 メタデータ抽出**（`main/pngMeta.ts`、tEXt/iTXt、Forge 不要）→ positive 表示 → **LLM 分解**で 5 バケツ（character/background/action/camera/style、編集可）。`runDecompose`（llamaClient）。
  - 当面スタンドアロン。**Scene スロットへの上書き接続（spec §8）は未対応**＝次段。
- 追加 IPC: `llama:decompose` / `dialog:open-image` / `image:metadata`。Scene に出力ハンドル追加。Batch 入力は Scene のみ（誤接続防止）。
- 検証: typecheck / build / 起動 OK。Batch ドライランは純ロジックで動作。LLM 分解は要モデルロード。

## 2026-06-29 (Forge 連携は保留)

- WebUI Forge 連携（接続/txt2img/png-info/ダウンローダ UI）は**保留**と決定。理由: 現在の開発機がノート PC で SD 生成を実行・デバッグできないため、作っても動作確認できない。Forge 未導入。
- 参考にと言われた `ysm446/image-assistant` は非公開（404）で内容未確認。再開時に概要共有が必要。
- 再開条件: SD を動かせる環境が用意できたら、まず「接続＋txt2img 生成」から着手予定。

## 2026-06-29 (可視性フィルタ)

- 可視性フィルタ（spec §4.11）を実装。Scene ノード内に「実行」ボタンを配置。
  - 方式: LLM 判断型。カメラのフレーミング＋空間タグ（キャラ/ソロアクション/背景）を llama-server（OpenAI 互換 `/v1/chat/completions`, temperature 0）に渡し、画面外タグを除去候補として取得。
  - 結果は Scene データに保存（再現性）。チップ表示でクリック取り消し＋手動追加（手修正）。
  - compile が `visibilityEnabled` 時に該当タグをキャラ/背景から除去。lighting/quality/style は素通り。
  - 関連: `shared/compile.ts`（getVisibilityInput / visibilityHash / filterRemoved）、`main/llamaClient.ts`、IPC `llama:visibility`。
- 未対応（今後）: ゾーンタグ方式（spec の head/upper/floor 等の構造的判定）への精緻化、ハッシュキャッシュの main 側共有。現状は Scene 保存による再現性で代替。
- 注意: 実行には llama.cpp ランタイム導入＋モデルのロードが必要（上部バーから）。

## 2026-06-29 (UI 再構成)

- lm-graph に倣いレイアウトを再構成。
  - 上部バー = モデルのロード（ModelBar: モデル選択 / Load・Eject / 状態表示 / ランタイム導入ポップオーバー）。
  - 左サイドバー = ワークスペース一覧（作成 / 切替 / ダブルクリックでリネーム / 削除 / 各行に保存ボタン）。
  - 中央 = キャンバス（左上に「＋ノード追加」パネル、右クリックメニューも維持）、右 = 合成結果。
- 単一 project.json から**複数ワークスペース**へ移行。`data/workspaces/<id>.json` に保存。旧 project.json は初回に自動移行。
- store/IPC/preload/api をワークスペース CRUD（list/load/save/create/rename/delete）に刷新。
- 終了時の `webContents.send`（破棄済みウィンドウ）を `isDestroyed()` ガードで修正。
- 検証: typecheck / build / dev 起動（ワークスペース自動生成・移行）を確認。

## 2026-06-29

- 方針確定: TypeScript 一本（Electron main で完結、lm-graph 踏襲）。可視性フィルタは後回し、まず素のプロンプト合成。
- 計画ドキュメント（goal/plan/progress）と CLAUDE.md を整備。
- **マイルストーン1（プロンプト合成）+ llama.cpp インストーラの土台を実装・動作確認まで完了。**
  - スキャフォールド: Electron + electron-vite + React 19 + @xyflow/react + TS + Tailwind。
  - main: `llamaInstaller.ts`（lm-graph 流用、GitHub Releases→DL→tar 展開）、`llamaServer.ts`（モデル列挙/起動/ヘルスチェック）、`store.ts`（JSON 永続化）、IPC。
  - renderer: 9 ノード型（Character/SoloAction/Interaction/Background/Lighting/Camera/Style/Seed/Scene）、zustand ストア、Scene コンパイル（収集→人数タグ→順序→weight→BREAK→positive）、合成結果パネル、llama.cpp 管理パネル。
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
