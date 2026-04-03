# Graph Chat

Graph Chat is a desktop app for building LLM workflows as a directed acyclic graph.
It uses Electron + React + React Flow for the UI, SQLite for persistence, and a local `llama.cpp` OpenAI-compatible server for generation.

## Current Scope

This repository currently targets the Phase 1 minimum usable version described in `GRAPH_CHAT_SPEC.md`:

- Project list and switching
- Graph canvas with `text`, `context`, and `instruction` nodes
- Node editing panel
- Edge creation and deletion
- Upstream context collection
- Streaming text generation through `llama.cpp`
- SQLite persistence

## Requirements

- Windows
- Node.js 24.x
- npm 11.x
- Local GGUF model files under `models/`
- `llama.cpp` server files under `bin/llama-server/`

## Local Model Setup

This project expects local runtime assets that are intentionally not committed:

- `models/`
  - example: `models/Qwen3.5-27B-GGUF/Qwen3.5-27B-Q6_K.gguf`
- `bin/llama-server/llama-b8466-bin-win-cuda-13.1-x64/`
  - must contain `llama-server.exe` and related DLLs

The app automatically prefers a `Qwen3.5-27B-Q6_K.gguf` file when present and otherwise falls back to the first non-`mmproj` GGUF it finds.

## Install

```powershell
npm install
npm run rebuild:electron
```

## Start

Recommended:

```powershell
.\start.bat
```

Manual development start:

```powershell
npm run rebuild:electron
npm run dev
```

Production build:

```powershell
npm run build
```

## Usage

1. Launch the app.
2. Create a `text`, `context`, or `instruction` node from the top toolbar.
3. Connect upstream nodes into a `text` node.
4. Select the `text` node and press `生成 ->`.
5. The app gathers upstream context, starts the local `llama.cpp` server if needed, and streams the response into a new node.

## Keyboard Shortcuts

- `Delete`: delete selected node
- `Ctrl + D` / `Cmd + D`: duplicate selected node

## Important Files

- `GRAPH_CHAT_SPEC.md`: feature spec
- `src/main/index.ts`: Electron main process and IPC
- `src/main/database.ts`: SQLite repository
- `src/main/llamaServer.ts`: local `llama.cpp` server management
- `src/renderer/src/App.tsx`: main UI
- `start.bat`: Windows startup helper

## Notes

- `node_modules/`, `out/`, `bin/`, and `models/` are local-only and should not be committed.
- The SQLite database is stored under Electron `userData`, not in the repository.
- `better-sqlite3` must be rebuilt for the Electron runtime, so `npm run rebuild:electron` is included.
