import { test } from "node:test";
import assert from "node:assert/strict";
import { FollowYaw } from "../src/camera.ts";
test("camera delays turns and latches a heading without cursor feedback", () => {
  const c = new FollowYaw();
  for (let i = 0; i < 6; i++) c.step(1, 4, 1, 1 / 30);
  assert.equal(c.yaw, 0);
  for (let i = 0; i < 30; i++) c.step(1, 4, 1, 1 / 30);
  const target = c.target;
  for (let i = 0; i < 100; i++) c.step(2 + i * 0.03, 4, 1, 1 / 30);
  assert.equal(c.target, target);
  assert.ok(Math.abs(c.yaw - target) < 0.05);
});
test("standing aim does not orbit the camera", () => {
  const c = new FollowYaw();
  for (let i = 0; i < 100; i++) c.step(2, 0, i, 1 / 30);
  assert.equal(c.yaw, 0);
});
