import { test } from "node:test";
import assert from "node:assert/strict";
import { Game, validInput } from "../server/game.ts";
import { Physics, initPhysics } from "../shared/physics.ts";
await initPhysics();
const cmd = (seq: number, extra: object = {}) => ({
  seq,
  mx: 0,
  mz: 0,
  angle: 0,
  run: false,
  fire: false,
  action: 0,
  ...extra,
});
test("invalid and forged inputs rejected; diagonal intent normalized", () => {
  assert.equal(validInput({ mx: Infinity }), null);
  assert.equal(validInput(cmd(1, { angle: NaN })), null);
  assert.equal(validInput(cmd(-1)), null);
  let i = validInput(cmd(1, { mx: 8, mz: 8 }));
  assert.ok(i);
  assert.ok(Math.hypot(i.mx, i.mz) <= 1.001);
});
test("Rapier capsule slides on wall without crossing it", () => {
  const p = new Physics();
  p.addStatic("wall", [{ x: 2, z: 0, hx: 0.5, hz: 10 }]);
  const body = p.addPlayer("a", 0, 0);
  for (let i = 0; i < 60; i++) p.move("a", 0.12, 0.08);
  const pos = body.translation();
  assert.ok(pos.x < 1.1);
  assert.ok(pos.z > 3);
  p.dispose();
});
test("flood and repeated sequences do not advance movement faster than server ticks", () => {
  const g = new Game(12, 2);
  const a = g.join("a", "ALPHA", 0),
    b = g.join("b", "BRAVO", 0);
  g.ready(a.id);
  g.ready(b.id);
  const x = a.x;
  for (let i = 0; i < 1000; i++) g.input(a.id, cmd(i + 1, { mx: 1 }));
  g.step();
  assert.ok(a.x - x < 0.3);
  assert.ok(g.queues.get(a.id)!.length <= 8);
  g.dispose();
});
test("hidden opponent absent from snapshot, bullet blocked by wall", () => {
  const g = new Game(1, 2);
  const a = g.join("a", "ALPHA", 0),
    b = g.join("b", "BRAVO", 0);
  g.ready(a.id);
  g.ready(b.id);
  a.x = 5;
  a.z = 5;
  a.angle = Math.PI / 2;
  b.x = 11;
  b.z = 5;
  g.map.boxes = () => [{ x: 8, z: 5, hx: 1, hz: 4 }];
  assert.equal(
    g.snapshot(a.id, new Set()).players.some((p) => p.id === b.id),
    false,
  );
  g.shoot(a);
  assert.equal(b.hp, 100);
  assert.equal(a.ammo, 11);
  g.shoot(a);
  assert.equal(a.ammo, 11);
  g.dispose();
});
test("confirmed hits apply damage, reload restores ammo and light has cooldown", () => {
  const g = new Game(1, 2);
  const a = g.join("a", "ALPHA", 0),
    b = g.join("b", "BRAVO", 0);
  g.ready(a.id);
  g.ready(b.id);
  a.x = 5;
  a.z = 5;
  a.angle = Math.PI / 2;
  b.x = 9;
  b.z = 5;
  g.map.boxes = () => [];
  g.shoot(a);
  assert.equal(b.hp, 75);
  g.ability(a, 1);
  assert.equal(g.lights.size, 1);
  assert.ok(a.lightCd > 0);
  g.ability(a, 4);
  assert.ok(a.reload > 0);
  for (let i = 0; i < 65; i++) g.step();
  assert.equal(a.ammo, 12);
  g.dispose();
});
test("banana triggers once, disables shooting and elimination ends round", () => {
  const g = new Game(1, 2);
  const a = g.join("a", "ALPHA", 0),
    b = g.join("b", "BRAVO", 0);
  g.ready(a.id);
  g.ready(b.id);
  g.ability(a, 2);
  assert.equal(g.traps.size, 1);
  const t = [...g.traps.values()][0];
  t.arm = 0;
  t.x = b.x;
  t.z = b.z;
  g.step();
  assert.ok(b.slip > 0);
  assert.equal(g.traps.size, 0);
  const ammo = b.ammo;
  g.shoot(b);
  assert.equal(b.ammo, ammo);
  b.hp = 0;
  g.step();
  assert.equal(g.phase, "ended");
  assert.equal(g.winner, "ALPHA");
  g.dispose();
});
test("all configured spawns have capsule clearance and do not overlap", () => {
  for (let seed = 1; seed < 8; seed++) {
    const g = new Game(seed, 8);
    for (let i = 0; i < 8; i++) g.join("a" + i, "ALPHA", 0);
    for (const a of g.players.values()) {
      for (const b of g.map.boxes(a.x, a.z, 3, false)) {
        const dx = Math.max(0, Math.abs(a.x - b.x) - b.hx),
          dz = Math.max(0, Math.abs(a.z - b.z) - b.hz);
        assert.ok(
          Math.hypot(dx, dz) >= 0.41,
          `seed ${seed}, spawn ${a.x},${a.z}`,
        );
      }
      for (const b of g.players.values())
        if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 0.85);
    }
    g.dispose();
  }
});
test("visible shooter does not disclose an occluded hit location", () => {
  const g = new Game(1, 2);
  const a = g.join("a", "ALPHA", 0),
    b = g.join("b", "ALPHA", 0),
    c = g.join("c", "BRAVO", 0);
  a.x = 5;
  a.z = 5;
  a.angle = Math.PI / 2;
  b.x = 6;
  b.z = 5;
  c.x = 11.123;
  c.z = 5.456;
  g.map.boxes = () => [{ x: 8, z: 5, hx: 1, hz: 4 }];
  g.events = [{ kind: "hit", x: c.x, z: c.z, shooter: b.id, target: c.id }];
  const e = g.snapshot(a.id, new Set()).events[0];
  assert.notEqual(e.x, c.x);
  assert.equal(e.target, undefined);
  assert.equal(e.shooter, undefined);
  g.dispose();
});
