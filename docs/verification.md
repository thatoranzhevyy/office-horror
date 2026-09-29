# Verification — 2026-09-29

- `npm run build`: TypeScript/Vue type checking and Vite production build passed.
- `NETWORK_TEST=1 npm test`: 17 passed, 0 failed, 0 skipped with a real local server.
- Chromium headless with software WebGL: no page or console errors. Menu, join, training and 3D scene rendered. A short mouse click consumed one round (12 → 11); moving after clicking a HUD ability changed the authoritative position; emergency-light cooldown was active. Screenshots in `docs/screenshots`.
- Independent focused code review completed. Corrected camera aim feedback, occluded hit-event coordinate disclosure, exact distance encoded in light patches, unsafe larger-team spawns, premature chunk acknowledgement under backpressure and character marker resource allocation.
- Browser binary and software GPU were test-environment tools; they are not runtime dependencies of this project.
- Local network transport checked with two actual WebSocket clients. Two separate physical computers, public Internet latency, Docker daemon launch, mobile play and sustained maximum-capacity matches were not tested here.
- Non-blocking messages: Rapier 0.19.3 emits an upstream initialization deprecation warning; Vite reports a large combined WASM/3D bundle. Neither prevented the checks above.

This is a test build. The scope differences from the full brief are listed in README.md.
