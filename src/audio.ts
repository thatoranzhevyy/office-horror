import type { GameEvent } from "../shared/protocol.ts";
export class Sound {
  ctx?: AudioContext;
  master?: GainNode;
  muted = false;
  private noise?: AudioBuffer;
  private hum?: OscillatorNode;
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    this.ctx = new AudioContext();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(c.destination);
    this.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.hum = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.025;
    this.hum.frequency.value = 58;
    this.hum.connect(g).connect(this.master);
    this.hum.start();
  }
  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.42;
  }
  listen(x: number, z: number, yaw: number) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    l.positionX.value = x;
    l.positionY.value = 1;
    l.positionZ.value = z;
    l.forwardX.value = Math.sin(yaw);
    l.forwardY.value = 0;
    l.forwardZ.value = Math.cos(yaw);
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }
  play(e: GameEvent) {
    if (!this.ctx || !this.master || !this.noise) return;
    const c = this.ctx,
      t = c.currentTime,
      g = c.createGain(),
      pan = c.createPanner();
    pan.panningModel = "HRTF";
    pan.distanceModel = "inverse";
    pan.refDistance = 3;
    pan.maxDistance = 45;
    pan.rolloffFactor = 1.4;
    pan.positionX.value = e.x;
    pan.positionY.value = 1;
    pan.positionZ.value = e.z;
    g.connect(pan).connect(this.master);
    const shot = e.kind === "shot",
      duration = shot ? 0.18 : e.kind === "step" ? 0.07 : 0.35;
    g.gain.setValueAtTime(shot ? 0.65 : e.kind === "step" ? 0.14 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const source = c.createBufferSource();
    source.buffer = this.noise;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = shot ? 1800 : e.kind === "step" ? 180 : 650;
    source.connect(filter).connect(g);
    source.start(t);
    source.stop(t + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      g.disconnect();
      pan.disconnect();
    };
  }
  dispose() {
    this.hum?.stop();
    void this.ctx?.close();
  }
}
