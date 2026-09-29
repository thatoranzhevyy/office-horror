import { test } from "node:test";
import assert from "node:assert/strict";
import { generateChunk, WorldMap, CHUNK, CELL } from "../shared/map.ts";
import { castRay, visible, segmentCircle } from "../shared/visibility.ts";
test("same seed and coordinates reproduce full geometry and different seeds differ", () => {
  assert.deepEqual(generateChunk(71, -1, 2), generateChunk(71, -1, 2));
  assert.notDeepEqual(
    generateChunk(71, 0, 0).cells,
    generateChunk(72, 0, 0).cells,
  );
});
test("all walkable cells are connected including boundary portals", () => {
  for (let seed = 0; seed < 15; seed++) {
    const c = generateChunk(seed, -1, 0),
      q: number[] = [c.cells.indexOf(0)],
      seen = new Set(q);
    for (let i = 0; i < q.length; i++) {
      const k = q[i],
        x = k % CHUNK,
        z = Math.floor(k / CHUNK);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          nz = z + dz,
          n = nz * CHUNK + nx;
        if (
          nx >= 0 &&
          nx < CHUNK &&
          nz >= 0 &&
          nz < CHUNK &&
          c.cells[n] === 0 &&
          !seen.has(n)
        ) {
          seen.add(n);
          q.push(n);
        }
      }
    }
    assert.equal(seen.size, c.cells.filter((x) => x === 0).length);
  }
});
test("neighbor portals match across both axes and negative coordinates", () => {
  for (let x = -2; x < 2; x++) {
    const a = generateChunk(11, x, -1),
      b = generateChunk(11, x + 1, -1),
      c = generateChunk(11, x, 0);
    for (let i = 0; i < CHUNK; i++) {
      assert.equal(a.cells[i * CHUNK + CHUNK - 1], b.cells[i * CHUNK]);
      assert.equal(a.cells[(CHUNK - 1) * CHUNK + i], c.cells[i]);
    }
  }
});
test("wall stops ray before target and blocks sight", () => {
  const boxes = [{ x: 3, z: 0, hx: 0.5, hz: 2 }];
  assert.equal(castRay(0, 0, 1, 0, 10, boxes), 2.5);
  assert.equal(
    visible({ x: 0, z: 0, angle: Math.PI / 2 }, { x: 6, z: 0 }, boxes),
    false,
  );
  assert.equal(
    visible({ x: 0, z: 0, angle: Math.PI / 2 }, { x: 2, z: 0 }, boxes),
    true,
  );
  assert.equal(
    visible({ x: 0, z: 0, angle: Math.PI / 2 }, { x: -2, z: 0 }, []),
    false,
  );
  assert.equal(segmentCircle(0, 0, 1, 0, 5, 0, 0.4), 4.6);
});
test("world resolves negative cells and generates bounded local neighborhoods", () => {
  const w = new WorldMap(9);
  w.near(-1, -1, 1);
  assert.equal(w.chunks.size, 9);
  assert.equal(CELL, 2);
  assert.ok(w.get(-1, -1));
});
