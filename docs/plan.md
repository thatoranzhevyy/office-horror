# Office Horror Implementation Plan

> Execution: native, user asked to start and delegated small decisions without further explanations.

**Goal:** deliver a runnable multiplayer test archive matching the dark office reference.
**Architecture:** shared generator/visibility/physics, authoritative Node server, Vue HUD and Three renderer.
**Tech Stack:** TypeScript, Vue 3, Three.js, Rapier, WebSocket.
**Spec:** design.md

## Global constraints
30 Hz authority; perspective camera; wall-blocked visibility and bullets; seeded streamable chunks; no gore; local launch plus LAN instructions.

## Review focus
Malformed/flooded commands cannot accelerate or corrupt simulation. Unseen players never leak in snapshots. Chunk portals stay connected in negative coordinates. Disconnect/restart frees state. Focus loss releases inputs.

## Tasks
1. Shared map and visibility: write deterministic/connectivity/occlusion tests, run red, implement generator and spatial queries, run green.
2. Server and physics: tests for input validation, shots/cooldowns/health/banana/light/rounds; implement Rapier controller and fixed-tick room simulation, WebSocket lifecycle; run tests.
3. Client: build lobby, render stylized offices/characters, mask/flashlights, prediction/interpolation, camera/audio/HUD/minimap. Check types, build and browser interactions.
4. Verify two-client network lifecycle, review code, fix concrete failures, document actual scope and controls, archive and save.
