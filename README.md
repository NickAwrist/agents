# Orbis Agents

A local-first agent runtime with a chat UI, powered by [Ollama](https://ollama.com/).

Build custom agents directly from the UI. Each agent can have its own system prompt and a configurable set of tools, letting you tailor behavior to specific tasks without touching code.

## Requirements

- [Bun](https://bun.sh/)
- [Ollama](https://ollama.com/) running locally

## Setup

```bash
bun install
```

## Development

Runs the backend server and UI together.

```bash
bun run dev
```

Individual processes:

```bash
bun run dev:server
bun run dev:ui
```

## Project Structure

- `src/` — backend server, agent loop, tools, and session storage
- `ui/` — React frontend
- `data/` — local persisted data
