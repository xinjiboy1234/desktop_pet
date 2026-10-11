# Desktop Pet Implementation Plan

> **For agentic workers:** Use subagent-driven-development for focused implementation and review. User explicitly excludes unit tests; use builds and runtime smoke checks.

**Goal:** 交付 Web 可嵌入组件、局域本机事件桥接及轻量桌面宠物。

**Architecture:** DOM-free scheduler → Canvas Custom Element → shared HTTP/WebSocket bridge; Tauri wraps the same component.

**Tech Stack:** TypeScript, Vite, Canvas 2D, Node.js, ws, Tauri 2.

## Chunk 1: shared component
- [ ] Create package.json, tsconfig.json, vite configs, src/core/types.ts and scheduler.ts.
- [ ] Implement validated task lifecycle, priority arbitration, debounce, feedback, leases and deduplication.
- [ ] Create src/component/renderer.ts, transport.ts, pet-element.ts, src/index.ts.
- [ ] Implement bounded lazy page cache, timed redraw, visibility pause, animation switching, errors and cleanup.
- [ ] Build ESM package with declaration files. Verify using npm run check and npm run build:lib, no unit tests.

## Chunk 2: bridge and product surfaces
- [ ] Create bridge/server.mjs with validated event relay, bounded snapshot, origin/token checks, request limits and health.
- [ ] Create src/demo/main.ts, style.css, index.html and desktop.html; display a single pet with action/task controls and resource diagnostics.
- [ ] Create src-tauri Cargo/config/capability/main files for transparent always-on-top draggable host.
- [ ] Add npm scripts for local server, demo, bridge, combined desktop launch and package build.
- [ ] Publish only referenced sprite pages and metadata; exclude raw frames from git and production.

## Chunk 3: validation and delivery
- [ ] Write Chinese README with framework integration, Agent curl/Python examples and performance/security caveats.
- [ ] Run typecheck and production builds; exercise real HTTP/WebSocket + snapshot reconnect, invalid input and expiry.
- [ ] Inspect browser visuals and runtime errors; build/run desktop when toolchain is available.
- [ ] Review implementation against design, address defects, document actual verification results.
- [ ] Commit and push to https://github.com/xinjiboy1234/desktop_pet.git; verify remote commit.
