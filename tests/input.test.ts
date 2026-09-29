import { test } from "node:test";
import assert from "node:assert/strict";
import { FireLatch } from "../src/input.ts";
test("a click shorter than one tick still fires once; blur clears pending fire", () => {
  const b = new FireLatch();
  b.press();
  b.release();
  assert.equal(b.sample(), true);
  assert.equal(b.sample(), false);
  b.press();
  assert.equal(b.sample(), true);
  assert.equal(b.sample(), true);
  b.clear();
  assert.equal(b.sample(), false);
});
