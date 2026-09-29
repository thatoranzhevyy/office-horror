import * as T from "three";
import {
  WorldMap,
  SIZE,
  chunkBoxes,
  type Box,
  type Chunk,
} from "../shared/map.ts";
import { Physics, initPhysics, integrate } from "../shared/physics.ts";
import {
  angleDelta,
  visibilityPolygon,
  castRay,
  visible,
} from "../shared/visibility.ts";
import {
  DT,
  type Actor,
  type Input,
  type Snapshot,
  type GameEvent,
} from "../shared/protocol.ts";
import { FireLatch } from "./input.ts";
import { FollowYaw } from "./camera.ts";
import { Models } from "./models.ts";
import { Sound } from "./audio.ts";
interface Remote {
  mesh: T.Group;
  from: Actor;
  to: Actor;
  at: number;
  light: T.SpotLight;
  target: T.Object3D;
}
export class Engine {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(48, 1, 0.1, 110);
  renderer: T.WebGLRenderer;
  models: Models;
  physics?: Physics;
  map?: WorldMap;
  snapshot?: Snapshot;
  self?: Actor;
  audio = new Sound();
  private chunks = new Map<string, T.Group>();
  private remotes = new Map<string, Remote>();
  private traps = new Map<string, T.Mesh>();
  private emergency = new Map<string, T.PointLight>();
  private local?: T.Group;
  private flashlight: T.SpotLight;
  private flashTarget = new T.Object3D();
  private muzzle = new T.PointLight(0xffce7d, 0, 5);
  private fill = new T.PointLight(0xc9c1a8, 9, 5, 1.4);
  private patches: T.PointLight[] = [];
  private keys = new Set<string>();
  private mouse = new T.Vector2(0, 0.25);
  private fireButton = new FireLatch();
  private action: Input["action"] = 0;
  private seq = 0;
  private pending: Input[] = [];
  private accumulator = 0;
  private previous = 0;
  private raf = 0;
  private disposed = false;
  private yaw = Math.PI;
  private follow = new FollowYaw();
  private aimRevision = 0;
  private camCenter = new T.Vector3();
  private visual = new T.Vector3();
  private kick = 0;
  private kickVelocity = 0;
  private shake = 0;
  private lastShot = -100;
  private boxes: Box[] = [];
  private boxesAt = 0;
  private maskAt = 0;
  private frame = 0;
  private pointer = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private aimPoint = new T.Vector3();
  private effects: { mesh: T.Object3D; ttl: number }[] = [];
  private maskCanvas = document.createElement("canvas");
  private maskContext: CanvasRenderingContext2D;
  private texture: T.CanvasTexture;
  private origin = new T.Vector2();
  private explored = new Map<string, Set<number>>();
  private resizeObserver: ResizeObserver;
  constructor(
    private host: HTMLElement,
    private minimap: HTMLCanvasElement,
    private send: (i: Input) => void,
  ) {
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.32;
    host.append(this.renderer.domElement);
    this.scene.background = new T.Color("#020407");
    this.scene.fog = new T.FogExp2("#03060a", 0.018);
    this.maskCanvas.width = this.maskCanvas.height = 512;
    this.maskContext = this.maskCanvas.getContext("2d")!;
    this.texture = new T.CanvasTexture(this.maskCanvas);
    this.texture.minFilter = T.LinearFilter;
    this.texture.magFilter = T.LinearFilter;
    this.texture.flipY = false;
    this.models = new Models(this.texture, this.origin);
    this.scene.add(new T.HemisphereLight(0x91a2bd, 0x574b37, 0.32));
    this.flashlight = new T.SpotLight(0xffdda0, 100, 29, 0.72, 0.55, 1.2);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.bias = -0.001;
    this.flashlight.shadow.normalBias = 0.035;
    this.flashlight.target = this.flashTarget;
    this.scene.add(this.flashlight, this.flashTarget, this.muzzle, this.fill);
    this.camera.position.set(6, 22, -10);
    this.camera.lookAt(5, 0, 5);
    for (let i = 0; i < 8; i++) {
      const light = new T.PointLight(0xffd397, 0, 3.8, 1.2);
      this.patches.push(light);
      this.scene.add(light);
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    window.addEventListener("keydown", this.keydown);
    window.addEventListener("keyup", this.keyup);
    window.addEventListener("blur", this.release);
    document.addEventListener("visibilitychange", this.visibility);
    host.addEventListener("pointermove", this.pointermove);
    host.addEventListener("pointerdown", this.pointerdown);
    window.addEventListener("pointerup", this.pointerup);
    host.addEventListener("contextmenu", this.contextmenu);
    this.raf = requestAnimationFrame(this.animate);
  }
  async init() {
    await initPhysics();
    if (!this.disposed) this.physics = new Physics();
  }
  private resize = () => {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };
  private keydown = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement)?.matches(
        "input,select,textarea,[contenteditable=true]",
      )
    )
      return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ShiftLeft",
        "ShiftRight",
        "Digit1",
        "Digit2",
        "Digit3",
        "KeyR",
        "Space",
      ].includes(e.code)
    ) {
      e.preventDefault();
      this.keys.add(e.code);
    }
    if (!e.repeat) {
      if (e.code === "Digit1") this.action = 1;
      if (e.code === "Digit2") this.action = 2;
      if (e.code === "Digit3") this.action = 3;
      if (e.code === "KeyR") this.action = 4;
      if (e.code === "KeyM") this.audio.toggle();
    }
    this.audio.start();
  };
  private keyup = (e: KeyboardEvent) => this.keys.delete(e.code);
  private release = () => {
    this.keys.clear();
    this.fireButton.clear();
    this.action = 0;
  };
  private visibility = () => {
    if (document.hidden) this.release();
  };
  private contextmenu = (e: Event) => e.preventDefault();
  private pointermove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.aimRevision++;
    this.mouse.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    );
  };
  private pointerdown = (e: PointerEvent) => {
    if (e.button === 0) this.fireButton.press();
    this.audio.start();
  };
  private pointerup = () => this.fireButton.release();
  trigger(action: Input["action"]) {
    this.action = action;
    this.audio.start();
  }
  accept(s: Snapshot) {
    if (!this.physics) return;
    const newRound =
      this.snapshot?.phase !== "playing" && s.phase === "playing";
    this.snapshot = s;
    if (!this.map || this.map.seed !== s.seed) {
      this.map = new WorldMap(s.seed);
    }
    for (const c of s.chunks) {
      this.map.chunks.set(c.key, c);
      if (!this.chunks.has(c.key)) {
        const group = this.models.chunk(c);
        this.chunks.set(c.key, group);
        this.scene.add(group);
        this.physics.addStatic(c.key, chunkBoxes(c));
      }
    }
    const cx = Math.floor(s.self.x / SIZE),
      cz = Math.floor(s.self.z / SIZE);
    for (const [key, g] of this.chunks) {
      const [x, z] = key.split(",").map(Number);
      if (Math.abs(x - cx) > 1 || Math.abs(z - cz) > 1) {
        this.scene.remove(g);
        for (const child of g.children)
          if (child instanceof T.InstancedMesh) child.dispose();
        this.chunks.delete(key);
        this.physics.removeStatic(key);
        this.map.chunks.delete(key);
      }
    }
    if (!this.self) {
      this.physics.addPlayer(s.self.id, s.self.x, s.self.z);
      this.local = this.models.character(s.self.team, s.self.skin);
      this.scene.add(this.local);
      this.visual.set(s.self.x, 0, s.self.z);
      this.camCenter.copy(this.visual);
      this.yaw = s.self.angle;
      this.follow.yaw = this.follow.target = this.yaw;
    }
    if (newRound) {
      this.seq = 0;
      this.pending = [];
      this.explored.clear();
      this.visual.set(s.self.x, 0, s.self.z);
      this.camCenter.copy(this.visual);
      this.lastShot = -100;
      this.release();
    }
    this.self = { ...s.self };
    this.physics.teleport(s.self.id, s.self.x, s.self.z);
    this.pending = this.pending.filter((i) => i.seq > s.self.ack);
    if (s.phase === "playing" && s.self.hp > 0)
      for (const i of this.pending) integrate(this.self, i, this.physics);
    const wanted = new Set(s.players.map((p) => p.id));
    for (const [id, r] of this.remotes)
      if (!wanted.has(id)) {
        this.scene.remove(r.mesh, r.light, r.target);
        r.light.dispose();
        this.remotes.delete(id);
      }
    for (const p of s.players) {
      let r = this.remotes.get(p.id);
      if (!r) {
        const mesh = this.models.character(p.team, p.skin),
          light = new T.SpotLight(0xffd99c, 70, 24, 0.7, 0.65, 1.2),
          target = new T.Object3D();
        light.target = target;
        this.scene.add(mesh, light, target);
        r = {
          mesh,
          light,
          target,
          from: { ...p },
          to: { ...p },
          at: performance.now(),
        };
        this.remotes.set(p.id, r);
      }
      r.from = {
        ...r.to,
        x: r.mesh.position.x || p.x,
        z: r.mesh.position.z || p.z,
        angle: r.mesh.rotation.y,
      };
      r.to = { ...p };
      r.at = performance.now();
    }
    const trapIds = new Set(s.traps.map((t) => t.id));
    for (const [id, m] of this.traps)
      if (!trapIds.has(id)) {
        this.scene.remove(m);
        m.geometry.dispose();
        this.traps.delete(id);
      }
    for (const t of s.traps)
      if (!this.traps.has(t.id)) {
        const mesh = new T.Mesh(
          new T.TorusGeometry(0.19, 0.055, 4, 9, Math.PI * 1.5),
          this.models.material("#d2ae32"),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(t.x, 0.05, t.z);
        this.traps.set(t.id, mesh);
        this.scene.add(mesh);
      }
    const lightKeys = new Set(s.lights.map((l) => l.key));
    for (const [key, l] of this.emergency)
      if (!lightKeys.has(key)) {
        this.scene.remove(l);
        l.dispose();
        this.emergency.delete(key);
      }
    for (const l of s.lights) {
      if (!this.emergency.has(l.key)) {
        const [x, z] = l.key.split(",").map(Number),
          light = new T.PointLight(0xacc7d4, 140, 22, 1.4);
        light.position.set(x * 16 + 8, 3.8, z * 16 + 8);
        this.scene.add(light);
        this.emergency.set(l.key, light);
      }
      const left = l.until - s.tick * DT;
      this.emergency.get(l.key)!.intensity =
        left > 1.2 || Math.floor(left * 9) % 2 === 0 ? 140 : 0;
    }
    this.patches.forEach((l, i) => {
      const p = s.patches[i];
      l.intensity = p ? 7 * p.strength : 0;
      if (p) l.position.set(p.x, 0.6, p.z);
    });
    for (const e of s.events) {
      if (e.kind === "shot" && e.shooter === s.self.id) {
        this.effect(e);
        continue;
      }
      this.audio.play(e);
      if (e.kind === "shot") this.effect(e);
      if (e.kind === "hit" && e.target === s.self.id) this.shake = 0.25;
    }
  }
  private effect(e: GameEvent) {
    if (e.ex === undefined || e.ez === undefined) return;
    const g = new T.BufferGeometry().setFromPoints([
      new T.Vector3(e.x, 1.15, e.z),
      new T.Vector3(e.ex, 1.15, e.ez),
    ]);
    const m = new T.Line(
      g,
      new T.LineBasicMaterial({
        color: 0xffd190,
        transparent: true,
        opacity: 0.65,
      }),
    );
    this.scene.add(m);
    this.effects.push({ mesh: m, ttl: 0.065 });
    const spark = new T.Mesh(
      new T.IcosahedronGeometry(0.075, 0),
      new T.MeshBasicMaterial({ color: 0xffcf7b }),
    );
    spark.position.set(e.ex, 1.1, e.ez);
    this.scene.add(spark);
    this.effects.push({ mesh: spark, ttl: 0.12 });
  }
  private lit(x: number, z: number) {
    const key = `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
    return (this.emergency.get(key)?.intensity ?? 0) > 0;
  }
  private fixed() {
    const p = this.self;
    if (
      !p ||
      !this.physics ||
      !this.snapshot ||
      this.snapshot.phase !== "playing" ||
      p.hp <= 0
    )
      return;
    this.pointer.setFromCamera(this.mouse, this.camera);
    this.pointer.ray.intersectPlane(this.plane, this.aimPoint);
    const angle = Math.atan2(this.aimPoint.x - p.x, this.aimPoint.z - p.z);
    const f = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
      right = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    let mx = Math.sin(this.yaw) * f - Math.cos(this.yaw) * right,
      mz = Math.cos(this.yaw) * f + Math.sin(this.yaw) * right;
    const len = Math.max(1, Math.hypot(mx, mz));
    mx /= len;
    mz /= len;
    const i: Input = {
      seq: ++this.seq,
      mx,
      mz,
      angle,
      run: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      fire: this.fireButton.sample(),
      action: this.action,
    };
    this.action = 0;
    this.send(i);
    this.pending.push(i);
    if (this.pending.length > 90) this.pending.shift();
    integrate(p, i, this.physics);
    if (
      i.fire &&
      p.ammo > 0 &&
      p.reload <= 0 &&
      p.slip <= 0 &&
      performance.now() - this.lastShot > 267
    ) {
      this.lastShot = performance.now();
      this.kickVelocity -= 2.6;
      this.shake = 0.055;
      this.muzzle.intensity = 22;
      this.audio.play({ kind: "shot", x: p.x, z: p.z });
    }
  }
  private updateMask() {
    const p = this.self;
    if (!p) return;
    const ctx = this.maskContext;
    this.origin.set(p.x, p.z);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 512, 512);
    const px = (x: number) => (x - p.x + 32) * 8,
      pz = (z: number) => (z - p.z + 32) * 8;
    const fan = (lit: boolean) => {
      const pts = visibilityPolygon(p.x, p.z, p.angle, this.boxes, lit);
      ctx.beginPath();
      ctx.moveTo(256, 256);
      for (const v of pts) ctx.lineTo(px(v.x), pz(v.z));
      ctx.closePath();
      ctx.fill();
    };
    ctx.fillStyle = "#fff";
    fan(false);
    ctx.save();
    ctx.beginPath();
    for (const [key, l] of this.emergency)
      if (l.intensity > 0) {
        const [x, z] = key.split(",").map(Number);
        ctx.rect(px(x * 16), pz(z * 16), 128, 128);
      }
    ctx.clip();
    fan(true);
    ctx.restore();
    // A close radial visibility fan gives feet and immediately adjacent walls a soft readable halo.
    ctx.fillStyle = "#888";
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2,
        dx = Math.sin(a),
        dz = Math.cos(a),
        d = castRay(p.x, p.z, dx, dz, 1.7, this.boxes);
      i
        ? ctx.lineTo(px(p.x + dx * d), pz(p.z + dz * d))
        : ctx.moveTo(px(p.x + dx * d), pz(p.z + dz * d));
    }
    ctx.closePath();
    ctx.fill();
    for (const patch of this.snapshot?.patches ?? []) {
      ctx.save();
      ctx.beginPath();
      const pts = visibilityPolygon(p.x, p.z, 0, this.boxes, true);
      ctx.moveTo(256, 256);
      for (const v of pts) ctx.lineTo(px(v.x), pz(v.z));
      ctx.closePath();
      ctx.clip();
      const grad = ctx.createRadialGradient(
        px(patch.x),
        pz(patch.z),
        0,
        px(patch.x),
        pz(patch.z),
        14,
      );
      grad.addColorStop(0, "rgba(255,255,255,.8)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(px(patch.x) - 14, pz(patch.z) - 14, 28, 28);
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }
  private mini() {
    if (!this.self || !this.map) return;
    const p = this.self,
      c = this.minimap.getContext("2d")!,
      w = this.minimap.width;
    const scale = 3.6;
    c.clearRect(0, 0, w, w);
    c.fillStyle = "#080d13";
    c.fillRect(0, 0, w, w);
    c.save();
    c.translate(w / 2, w / 2);
    c.rotate(this.yaw - Math.PI);
    for (const chunk of this.map.chunks.values()) {
      let seen = this.explored.get(chunk.key);
      if (!seen) {
        seen = new Set();
        this.explored.set(chunk.key, seen);
      }
      for (let z = 0; z < 32; z++)
        for (let x = 0; x < 32; x++) {
          const wx = chunk.cx * SIZE + x * 2 + 1,
            wz = chunk.cz * SIZE + z * 2 + 1,
            index = z * 32 + x;
          if (
            Math.hypot(wx - p.x, wz - p.z) < 23 &&
            visible(p, { x: wx, z: wz }, this.boxes, this.lit(wx, wz))
          )
            seen.add(index);
          if (!seen.has(index)) continue;
          c.fillStyle = chunk.cells[index] ? "#464941" : "#242c2d";
          c.fillRect(
            (wx - p.x - 1) * scale,
            (wz - p.z - 1) * scale,
            2 * scale - 0.4,
            2 * scale - 0.4,
          );
        }
    }
    for (const r of this.remotes.values()) {
      c.fillStyle = r.to.team === "ALPHA" ? "#659bde" : "#ce595b";
      c.beginPath();
      c.arc((r.to.x - p.x) * scale, (r.to.z - p.z) * scale, 3, 0, Math.PI * 2);
      c.fill();
    }
    c.rotate(-this.yaw + Math.PI);
    c.rotate(-p.angle + this.yaw);
    c.fillStyle = "#8cbcff";
    c.beginPath();
    c.moveTo(0, -6);
    c.lineTo(-4, 4);
    c.lineTo(4, 4);
    c.fill();
    c.restore();
  }
  private animate = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    const dt = Math.min(0.08, (now - (this.previous || now)) / 1000);
    this.previous = now;
    this.accumulator = Math.min(this.accumulator + dt, 0.15);
    while (this.accumulator >= DT) {
      this.fixed();
      this.accumulator -= DT;
    }
    const p = this.self;
    if (p && this.local) {
      this.visual.lerp(new T.Vector3(p.x, 0, p.z), 1 - Math.exp(-22 * dt));
      this.local.position.copy(this.visual);
      this.local.rotation.y = p.angle;
      this.local.rotation.z =
        p.slip > 0 ? 0.9 * Math.sin((Math.min(p.slip, 1) * Math.PI) / 2) : 0;
      this.local.visible = p.hp > 0;
      const speed = Math.hypot(p.vx, p.vz);
      for (let j = 0; j < 2; j++)
        this.local.userData.legs[j].rotation.x =
          Math.sin(now * 0.011 + j * Math.PI) * Math.min(0.55, speed * 0.1);
      // Sustained motion permits a delayed turn; stationary aiming never spins the camera.
      this.yaw = this.follow.step(p.angle, speed, this.aimRevision, dt);
      const target = new T.Vector3(
        p.x + Math.sin(p.angle) * 1.8,
        0,
        p.z + Math.cos(p.angle) * 1.8,
      );
      this.camCenter.lerp(target, 1 - Math.exp(-4.7 * dt));
      this.kickVelocity += (-75 * this.kick - 13 * this.kickVelocity) * dt;
      this.kick += this.kickVelocity * dt;
      this.shake *= Math.exp(-13 * dt);
      const shakeX = Math.sin(now * 0.17) * this.shake,
        shakeY = Math.sin(now * 0.23) * this.shake;
      this.camera.position.set(
        this.camCenter.x - Math.sin(this.yaw) * (11.8 + this.kick) + shakeX,
        18.5 + Math.abs(this.kick) * 1.6 + shakeY,
        this.camCenter.z - Math.cos(this.yaw) * (11.8 + this.kick),
      );
      this.camera.lookAt(
        this.camCenter.x + shakeX,
        0,
        this.camCenter.z + shakeY,
      );
      this.camera.rotateZ(Math.sin(now * 0.13) * this.shake * 0.035);
      this.flashlight.position.set(
        p.x + Math.sin(p.angle) * 0.8 - Math.cos(p.angle) * 0.28,
        1.25,
        p.z + Math.cos(p.angle) * 0.8 + Math.sin(p.angle) * 0.28,
      );
      this.flashTarget.position.set(
        p.x + Math.sin(p.angle) * 12,
        0.4,
        p.z + Math.cos(p.angle) * 12,
      );
      this.muzzle.position.set(
        p.x + Math.sin(p.angle) * 0.7,
        1.3,
        p.z + Math.cos(p.angle) * 0.7,
      );
      this.muzzle.intensity *= Math.exp(-30 * dt);
      this.fill.position.set(p.x, 2.7, p.z);
      this.audio.listen(p.x, p.z, this.yaw);
      if (now - this.boxesAt > 100 && this.map) {
        this.boxes = this.map.boxes(p.x, p.z, 26);
        this.boxesAt = now;
      }
      if (now - this.maskAt > 45) {
        this.updateMask();
        this.maskAt = now;
      }
      if (++this.frame % 12 === 0) this.mini();
    }
    for (const r of this.remotes.values()) {
      const t = Math.min(1, (now - r.at) / 80);
      r.mesh.position.set(
        T.MathUtils.lerp(r.from.x, r.to.x, t),
        0,
        T.MathUtils.lerp(r.from.z, r.to.z, t),
      );
      r.mesh.rotation.y =
        r.from.angle + angleDelta(r.to.angle, r.from.angle) * t;
      r.mesh.rotation.z = r.to.slip > 0 ? 0.9 : 0;
      const pos = r.mesh.position,
        a = r.mesh.rotation.y;
      r.light.position.set(pos.x, 1.25, pos.z);
      r.target.position.set(
        pos.x + Math.sin(a) * 12,
        0.4,
        pos.z + Math.cos(a) * 12,
      );
      for (let j = 0; j < 2; j++)
        r.mesh.userData.legs[j].rotation.x =
          Math.sin(now * 0.011 + j * Math.PI) *
          Math.min(0.55, Math.hypot(r.to.vx, r.to.vz) * 0.1);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.ttl -= dt;
      if (e.ttl <= 0) {
        this.scene.remove(e.mesh);
        const m = e.mesh as T.Mesh;
        m.geometry?.dispose();
        if (m.material && !Array.isArray(m.material)) m.material.dispose();
        this.effects.splice(i, 1);
      }
    }
    this.renderer.render(this.scene, this.camera);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener("keydown", this.keydown);
    window.removeEventListener("keyup", this.keyup);
    window.removeEventListener("blur", this.release);
    document.removeEventListener("visibilitychange", this.visibility);
    this.host.removeEventListener("pointermove", this.pointermove);
    this.host.removeEventListener("pointerdown", this.pointerdown);
    window.removeEventListener("pointerup", this.pointerup);
    this.host.removeEventListener("contextmenu", this.contextmenu);
    this.audio.dispose();
    for (const g of this.chunks.values())
      g.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
      });
    for (const r of this.remotes.values()) r.light.dispose();
    this.flashlight.dispose();
    this.muzzle.dispose();
    this.fill.dispose();
    for (const l of [...this.emergency.values(), ...this.patches]) l.dispose();
    for (const t of this.traps.values()) t.geometry.dispose();
    for (const e of this.effects) {
      const m = e.mesh as T.Mesh;
      m.geometry?.dispose();
      if (m.material && !Array.isArray(m.material)) m.material.dispose();
    }
    this.physics?.dispose();
    this.models.dispose();
    this.texture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
