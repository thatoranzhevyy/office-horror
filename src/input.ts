/** Preserve a tap even when pointer-up arrives before the next 30 Hz input sample. */
export class FireLatch {
  held = false;
  private pending = false;
  press() {
    this.held = true;
    this.pending = true;
  }
  release() {
    this.held = false;
  }
  sample() {
    const fire = this.held || this.pending;
    this.pending = false;
    return fire;
  }
  clear() {
    this.held = false;
    this.pending = false;
  }
}
