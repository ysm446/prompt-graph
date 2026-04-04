# Prompt Graph Spec

## Summary

Prompt Graph is a desktop app for building local LLM workflows as a directed graph.
Users compose `text`, `context`, and `instruction` nodes on a canvas, connect them, and run generation against a local `llama.cpp` OpenAI-compatible server.

## Stack

- Electron + React + TypeScript
- React Flow for the graph UI
- SQLite via `better-sqlite3`
- Tailwind CSS for renderer styling
- Local `llama.cpp` server for inference

## Core Model

### Node types

- `text`: editable text or generation target
- `context`: reference material passed as user context
- `instruction`: prompt guidance passed as system instruction

### Project shape

Each project stores:

- project metadata
- graph nodes
- graph edges
- node positions and sizes

## Generation Flow

1. The user selects a target `text` node.
2. The app walks upstream through connected nodes.
3. Upstream `instruction` content is assembled into the system prompt.
4. Upstream `text` and `context` content are assembled into the user prompt.
5. The request is sent to the local `llama.cpp` server with streaming enabled.
6. Streamed tokens are appended to the target node in real time.
7. Final generation metadata is stored on the node.

## UI Areas

- Left sidebar: project list and save actions
- Center canvas: node graph editor
- Right inspector: selected node fields and app settings
- Reader panel: consolidated text view for a selected node lineage

## Persistence

- Project data is stored in SQLite under Electron `userData`
- UI preferences are stored in a JSON file under Electron `userData`
- Local runtime assets such as models and `llama.cpp` binaries stay outside versioned source

## Current Scope

- Project create, rename, delete, open, and save
- Node create, edit, resize, duplicate, delete, and connect
- Cycle prevention for edges
- Streaming generation into `text` nodes
- Reader export
- Basic UI preferences for sidebars, minimap, snap-to-grid, temperature, and context length

## Non-goals

- Cloud model providers
- Multi-user sync
- Remote project storage
- Complex workflow orchestration beyond the local graph editor
