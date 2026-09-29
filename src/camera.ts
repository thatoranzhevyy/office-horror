import { angleDelta } from "../shared/visibility.ts";
/** Capture a world heading only after deliberate pointer input or a new movement bout.
 * Camera motion alone must never create another aim revision. */
export class FollowYaw {
  yaw = 0;
  target = 0;
  private consumed = -1;
  private delay = 0;
  private wasMoving = false;
  step(angle: number, speed: number, revision: number, dt: number) {
    const moving = speed > 1.2;
    if (moving && !this.wasMoving) this.consumed = -1;
    this.wasMoving = moving;
    if (
      moving &&
      revision !== this.consumed &&
      Math.abs(angleDelta(angle, this.yaw)) > 0.35
    ) {
      this.delay += dt;
      if (this.delay > 0.28) {
        this.target = angle;
        this.consumed = revision;
        this.delay = 0;
      }
    } else this.delay = 0;
    this.yaw += angleDelta(this.target, this.yaw) * (1 - Math.exp(-1.8 * dt));
    return this.yaw;
  }
}
