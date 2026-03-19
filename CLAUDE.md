# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **dependency graph builder** for AI tool orchestration. It fetches tool schemas from the Composio API, detects which tools depend on other tools (e.g., `GMAIL_REPLY_TO_THREAD` requires `thread_id` from `GMAIL_LIST_THREADS`), and generates an interactive visualization.

## Commands

```sh
# Initial setup (generates .env with API keys)
COMPOSIO_API_KEY=<key> sh scaffold.sh

# Run the full pipeline
bun src/index.ts      # Stage 1: Fetch raw tool schemas from Composio API
bun src/analyze.ts    # Stage 2: Detect tool dependencies
bun src/visualize.ts  # Stage 3: Generate graph.html visualization

# Submit
sh upload.sh <email>
```

No build step needed — Bun runs TypeScript directly.

## Architecture

Three-stage pipeline with file-based data passing:

```
src/index.ts → googlesuper_tools.json / github_tools.json
src/analyze.ts → dependency_graph.json
src/visualize.ts → graph.html
```

**Stage 1 (`src/index.ts`)**: Calls the Composio API via `@composio/core` to fetch raw tool schemas for Google Super (429 tools) and GitHub (866 tools). Outputs JSON files.

**Stage 2 (`src/analyze.ts`)**: Two dependency detection strategies:
- **Explicit**: Searches input parameter descriptions for tool slug mentions
- **Implicit**: Matches required input parameters to other tools' output parameters — only for identifiers ending in `_id`, `_key`, `_token`, `_number`, `_sha` to avoid false positives on generic names like `id`, `type`, `name`

**Stage 3 (`src/visualize.ts`)**: Generates a standalone HTML file using `vis-network` with force-directed layout, toolkit filtering (Google Super: blue, GitHub: green), search, and click-to-inspect showing both dependencies and dependents.

## Code style

- Use comments sparingly — only for complex logic that isn't self-evident

## Key conventions

- Each stage is idempotent — rerun any stage independently without side effects
- Generated files (`*.json`, `graph.html`) are large and not meant to be edited manually
- `.env` is auto-loaded by Bun (no dotenv needed); contains `COMPOSIO_API_KEY` and `OPENROUTER_API_KEY`

## Bun APIs

Default to using Bun instead of Node.js:

- `bun <file>` instead of `node <file>` or `ts-node <file>`
- `bun install` instead of npm/yarn/pnpm
- `Bun.file` over `node:fs` readFile/writeFile
- `bun:sqlite` for SQLite, `Bun.sql` for Postgres, `Bun.redis` for Redis
- `Bun.serve()` for HTTP servers (no express), WebSocket is built-in
- `Bun.$\`cmd\`` instead of execa
- Bun automatically loads `.env`
