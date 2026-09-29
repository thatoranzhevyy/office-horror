import RAPIER from "@dimforge/rapier3d-compat";
import type { Box } from "./map.ts";
import type { Actor, Input } from "./protocol.ts";
import { DT } from "./protocol.ts";
let initialized: Promise<void> | undefined;
export function initPhysics() {
  return (initialized ??= RAPIER.init());
}
export class Physics {
  world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  controller = this.world.createCharacterController(0.02);
  bodies = new Map<string, RAPIER.RigidBody>();
  colliders = new Map<string, RAPIER.Collider>();
  statics = new Map<string, RAPIER.Collider[]>();
  constructor() {
    this.world.timestep = DT;
    this.controller.setSlideEnabled(true);
  }
  addStatic(key: string, boxes: Box[]) {
    if (this.statics.has(key)) return;
    const all = boxes.map((b) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(b.hx, 1.5, b.hz).setTranslation(
          b.x,
          1.5,
          b.z,
        ),
      ),
    );
    this.statics.set(key, all);
    this.world.step();
  }
  removeStatic(key: string) {
    for (const c of this.statics.get(key) ?? [])
      this.world.removeCollider(c, false);
    this.statics.delete(key);
  }
  addPlayer(id: string, x: number, z: number) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, 0.95, z),
    );
    const c = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(0.5, 0.4),
      body,
    );
    this.bodies.set(id, body);
    this.colliders.set(id, c);
    this.world.step();
    return body;
  }
  removePlayer(id: string) {
    const b = this.bodies.get(id);
    if (b) this.world.removeRigidBody(b);
    this.bodies.delete(id);
    this.colliders.delete(id);
  }
  teleport(id: string, x: number, z: number) {
    const b = this.bodies.get(id);
    if (b) {
      b.setTranslation({ x, y: 0.95, z }, true);
      b.setNextKinematicTranslation({ x, y: 0.95, z });
      this.world.step();
    }
  }
  move(id: string, dx: number, dz: number) {
    const b = this.bodies.get(id)!,
      c = this.colliders.get(id)!;
    this.controller.computeColliderMovement(
      c,
      { x: dx, y: 0, z: dz },
      RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,
    );
    const v = this.controller.computedMovement(),
      p = b.translation();
    b.setNextKinematicTranslation({ x: p.x + v.x, y: 0.95, z: p.z + v.z });
    this.world.step();
    return b.translation();
  }
  dispose() {
    this.world.free();
  }
}
export function integrate(p: Actor, i: Input, physics: Physics) {
  const speed = i.run ? 6.4 : 3.8;
  if (p.slip > 0) {
    p.vx *= 0.986;
    p.vz *= 0.986;
  } else {
    const k = 1 - Math.exp(-(Math.hypot(i.mx, i.mz) > 0.01 ? 11 : 16) * DT);
    p.vx += (i.mx * speed - p.vx) * k;
    p.vz += (i.mz * speed - p.vz) * k;
  }
  const pos = physics.move(p.id, p.vx * DT, p.vz * DT);
  p.x = pos.x;
  p.z = pos.z;
  if (!p.slip) p.angle = i.angle;
}
