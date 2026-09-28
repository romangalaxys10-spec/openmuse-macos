# Native macOS Setup and Architecture

This guide covers building, running, and configuring the native macOS edition of OpenMuse.

## Architecture

The native macOS edition pairs an AppKit application with the OpenMuse local server:

1. **Native Client**: Compiled Swift AppKit binary (`native/OpenMuseApp.swift`) using `WKWebView`. It provides standard macOS windowing, menu shortcuts, Dock icon integration, and automatic backend polling during startup.
2. **Local Server**: Hono API on Node.js port 8787. It serves the exported React Native Web bundle (`apps/mobile/dist/web`) and handles agent tool calls, document operations, and model streaming.
3. **Model Integration**: Uses TanStack AI with `@tanstack/ai-openai` configured for standard Chat Completions. When pointed at Agnes AI (`https://apihub.agnes-ai.com/v1`) or any OpenAI-compatible gateway, it streams tokens over HTTP Server-Sent Events (SSE).
4. **Local Database**: Backed by PGlite (WASM Postgres) or an external PostgreSQL instance. Conversations, actions, and files persist locally on disk in `.openmuse/`.

## Prerequisites

* macOS 13.0 Ventura or later (Apple Silicon recommended)
* Xcode Command Line Tools (`xcode-select --install`)
* Node.js 22 or later
* pnpm 10 or later

## Configuration

1. Copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

2. Configure your model settings in `.env`:

```sh
WORKSPACE_MODE=sample
AGENT_BACKEND=model
PORT=8787
HOST=127.0.0.1
PUBLIC_API_URL=http://localhost:8787
DATA_DIR=.openmuse
TASK_WORKER_ENABLED=true
RICH_THREADS=false

# Model Configuration
MODEL=openai/agnes-3.0-flash
OPENAI_BASE_URL=https://apihub.agnes-ai.com/v1
OPENAI_API_KEY=your_api_key_here

# Intelligence Key (can be any placeholder when RICH_THREADS=false)
CPK_INTELLIGENCE_API_KEY=local-dev-key
```

When `RICH_THREADS=false` is set, OpenMuse streams directly via Server-Sent Events and saves conversations to your local database without requiring external cloud accounts or Phoenix WebSockets.

## Building the App

Run the build script:

```sh
pnpm build:mac
```

This performs three steps:
1. Exports the mobile web bundle (`pnpm build:web`) to `apps/mobile/dist/web`.
2. Compiles TypeScript server packages (`pnpm build:server`).
3. Compiles `OpenMuseApp.swift` with `swiftc -O` and packages `/Applications/OpenMuse.app` and `~/Desktop/OpenMuse.app`.

## Running the App

### Option A: Automatic startup script
Start both the backend server and open the desktop app with one command:

```sh
./start-all.sh
```

### Option B: Separate services
Start the server in one terminal:

```sh
pnpm start
```

Then open the macOS app:

```sh
open /Applications/OpenMuse.app
```
