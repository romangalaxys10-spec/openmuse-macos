# Changelog

All notable changes and custom optimizations made to OpenMuse in this native macOS edition.

## [0.2.0-native-macos] - 2026-09-28

### Added
* Native macOS AppKit wrapper (`native/OpenMuseApp.swift`):
  * Standalone macOS application running directly on Apple Silicon without an external browser window.
  * Standard AppKit menu bar with Edit shortcuts (Cut, Copy, Paste, Select All, Undo, Redo) and View controls (Reload, Full Screen).
  * Auto-reconnecting startup screen that monitors local backend readiness on port 8787 before loading the workspace.
  * Multi-resolution macOS application icon (`OpenMuse.icns`) built from native assets.
  * Installation script (`scripts/build-app.sh`) targeting `/Applications/OpenMuse.app` and `~/Desktop/OpenMuse.app`.
  * Single command launcher (`start-all.sh`) and npm convenience tasks (`pnpm build:mac`, `pnpm app`).

### Changed
* Model streaming gateway adapter (`apps/server/src/engine/tanstack-agent.ts`):
  * Added detection for Agnes AI and OpenAI Chat Completions gateway providers.
  * Routed streaming completions through `openaiChatCompletions` rather than the Responses API, resolving the Pydantic boolean validation error (`stream Input should be a valid boolean`).
  * Maintained backward compatibility with standard OpenAI models and test mocks.

* Thread and runtime resilience (`apps/server/src/engine/local-intelligence.ts`, `apps/server/src/agent.ts`, `apps/server/src/app.ts`):
  * Created `LocalIntelligence` class extending `CopilotKitIntelligence` to intercept 401 unauthenticated responses from CopilotKit Cloud.
  * Stored thread settings and metadata directly in OpenMuse local PostgreSQL and PGlite database store.
  * Added fallback implementations for thread locking primitives (`ɵacquireThreadLock`, `ɵrenewThreadLock`, `ɵcleanupThreadLock`, `ɵconnectThread`).
  * Added `RICH_THREADS=false` configuration to enable direct Server-Sent Events (SSE) streaming via `InMemoryAgentRunner` without external Phoenix WebSocket infrastructure.
  * Fixed `/api/main-thread` to return a stable local thread identifier immediately when rich threads are in local mode, eliminating the error "Main conversation is unavailable. Check the Rich Threads connection and try again."

* CORS and networking policy (`apps/server/src/app.ts`):
  * Allowed requests originating from `null`, `file://`, and local webview protocols so native desktop wrappers can authenticate and fetch sessions without network errors.

### Security
* Kept all API keys, access keys, and model tokens out of version control via `.env` exclusion in `.gitignore`.
* Added parameter documentation and clean templates in `.env.example`.
