# Angry Duck Implementation Plan

**Goal:** Add the existing angry_duck sprites as the independent pet action `angry`.

**Architecture:** Extend the existing action protocol and animation catalog. Reuse the renderer, scheduler timing, bridge validation, and asset packaging.

**Tech Stack:** TypeScript, Vite, Canvas, Tauri.

- [x] Add `angry` to src/core/protocol.ts and map it to angry_duck in src/core/animation-catalog.ts.
- [x] Register 124 frames at 24 FPS in desktop_pet_resources/video_sprites/animations.json.
- [x] Add action labels to src/demo/main.ts and src/demo/desktop.ts; document invocation in README.md.
- [x] Run npm run build; validate event parsing, scheduler duration and recovery, and packaged sprite pages. Build and runtime assertions passed; default duration is 5167 ms and playback returns to idle after expiry.
