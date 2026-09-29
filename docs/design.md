# Multiplayer Office Horror — test build
The supplied 34-section brief and reference image define the target. Vue/Three perspective renderer; Node authoritative 30 Hz game; Rapier capsule controllers; shared deterministic seeded chunks. Local distributable, no hosted deployment requested.

Default 2v2 configurable lobby, all connected players ready before start, minimum one per team. Optional explicitly labelled training with a server bot. Round elimination, 100 HP, no in-round respawn; 5 minute timeout resolved by surviving players then total HP. Two character cosmetics. All three abilities in default loadout.

Security: server accepts sequenced intent only, bounded queue and payload, simulates one input per fixed step, clamps movement and aim, validates cooldowns, damage and ammo. Per-recipient visibility filters players/traps; sounds use quantized event positions, and visible flashlight surface patches do not transmit the hidden owner's identity/position. Map chunks delivered locally; explored minimap never reveals unseen actors.

Map: 32x32 2m cells, recursive-backtracking coarse corridors plus loops, room carving and preset-based decoration with clear paths. A square arena is fixed at round start: 1x1 chunks for 2-4 players, 2x2 for 5-10, and 3x3 for 11-16. Outer edges are walled; interior portals use coordinate hashes independent of generation order. Stream nearby render/physics chunks per player, unload static colliders and visuals at distance; preserve dynamic state until round ends.

Movement: WASD screen-relative, acceleration and braking, sprint; world aim from mouse ground intersection; camera smooth follow, delayed yaw driven by sustained movement to avoid mouse-camera feedback, look ahead, recoil spring and decaying shake. Walls collision and flashlight shadows; raycast visibility mask additionally gates geometry and players. The first ability throws a stationary glow stick up to 6m, stopped by walls, lighting an 8m radius for 18 seconds; visibility remains blocked by walls. Sounds convey direction across walls.

Validation: deterministic generation and portal/connectivity tests; occlusion/hitscan, authoritative input and round tests; live two-WebSocket client smoke tests; production build; browser render and interaction smoke tests. Known scope or verification limits recorded honestly in README.
