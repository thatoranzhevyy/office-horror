import { randomUUID } from "node:crypto";
import { WorldMap, chunkBoxes, SIZE, hash, rng } from "../shared/map.ts";
import { Physics, integrate } from "../shared/physics.ts";
import {
  castRay,
  visible,
  segmentCircle,
  VIEW_RANGE,
} from "../shared/visibility.ts";
import {
  DT,
  type Actor,
  type Input,
  type Team,
  type Trap,
  type Light,
  type GameEvent,
  type Snapshot,
  type Patch,
} from "../shared/protocol.ts";
export function validInput(v: unknown): Input | null {
  if (!v || typeof v !== "object") return null;
  const i = v as Input;
  if (
    !Number.isSafeInteger(i.seq) ||
    i.seq < 0 ||
    ![i.mx, i.mz, i.angle].every(Number.isFinite) ||
    !Number.isInteger(i.action) ||
    i.action < 0 ||
    i.action > 4 ||
    typeof i.run !== "boolean" ||
    typeof i.fire !== "boolean"
  )
    return null;
  const d = Math.max(1, Math.hypot(i.mx, i.mz));
  return {
    seq: i.seq,
    mx: i.mx / d,
    mz: i.mz / d,
    angle: Math.atan2(Math.sin(i.angle), Math.cos(i.angle)),
    run: i.run,
    fire: i.fire,
    action: i.action,
  };
}
const idle = (p: Actor): Input => ({
  seq: p.ack,
  mx: 0,
  mz: 0,
  angle: p.angle,
  run: false,
  fire: false,
  action: 0,
});
export class Game {
  map: WorldMap;
  physics = new Physics();
  players = new Map<string, Actor>();
  queues = new Map<string, Input[]>();
  lastSeq = new Map<string, number>();
  lastShot = new Map<string, number>();
  traps = new Map<string, Trap>();
  lights = new Map<string, Light>();
  events: GameEvent[] = [];
  phase: Snapshot["phase"] = "lobby";
  winner = "";
  tick = 0;
  remaining = 300;
  random: () => number;
  private nextTrap = 0;
  private botGoal = new Map<string, { x: number; z: number }>();
  spawn(team: Team, index: number) {
    const lane =
      (hash(this.seed, team === "ALPHA" ? 11 : 29, 0) + Math.floor(index / 4)) %
      7;
    return {
      x: 6 + lane * 8 + (index % 2 ? 0.55 : -0.55),
      z:
        (team === "ALPHA" ? 6 : 54) +
        (Math.floor((index % 4) / 2) ? 0.55 : -0.55),
    };
  }
  constructor(
    public seed: number,
    public teamSize = 2,
  ) {
    this.map = new WorldMap(seed);
    this.random = rng(seed ^ 771);
  }
  join(name: string, team: Team, skin: number, bot = false) {
    if (this.phase === "playing")
      throw new Error("Матч уже идёт. Дождитесь следующего раунда.");
    if (
      [...this.players.values()].filter((p) => p.team === team).length >=
      this.teamSize
    )
      throw new Error("Команда заполнена");
    const n = [...this.players.values()].filter((p) => p.team === team).length;
    const p: Actor = {
      id: randomUUID(),
      name: name.trim().slice(0, 18) || "Сотрудник",
      team,
      skin: skin === 1 ? 1 : 0,
      ...this.spawn(team, n),
      vx: 0,
      vz: 0,
      angle: team === "ALPHA" ? 0 : Math.PI,
      hp: 100,
      ammo: 12,
      slip: 0,
      lightCd: 0,
      bananaCd: 0,
      reload: 0,
      ack: 0,
      ready: bot,
      bot,
    };
    this.players.set(p.id, p);
    this.queues.set(p.id, []);
    this.physics.addPlayer(p.id, p.x, p.z);
    return p;
  }
  leave(id: string) {
    this.players.delete(id);
    this.queues.delete(id);
    this.lastSeq.delete(id);
    this.lastShot.delete(id);
    this.botGoal.delete(id);
    this.physics.removePlayer(id);
    for (const [key, t] of this.traps)
      if (t.owner === id) this.traps.delete(key);
    if (this.phase === "playing") this.checkEnd();
  }
  ready(id: string) {
    const p = this.players.get(id);
    if (!p || this.phase === "playing") return;
    p.ready = !p.ready;
    if (
      [...this.players.values()].every((p) => p.ready) &&
      ["ALPHA", "BRAVO"].every((t) =>
        [...this.players.values()].some((p) => p.team === t),
      )
    )
      this.start();
  }
  start() {
    this.phase = "playing";
    this.winner = "";
    this.remaining = 300;
    this.tick = 0;
    this.events = [];
    this.traps.clear();
    this.lights.clear();
    this.lastShot.clear();
    this.botGoal.clear();
    for (const p of this.players.values()) {
      const index = [...this.players.values()]
        .filter((q) => q.team === p.team)
        .indexOf(p);
      Object.assign(p, {
        ...this.spawn(p.team, index),
        vx: 0,
        vz: 0,
        hp: 100,
        ammo: 12,
        slip: 0,
        lightCd: 0,
        bananaCd: 0,
        reload: 0,
        ack: 0,
      });
      this.queues.set(p.id, []);
      this.lastSeq.delete(p.id);
      this.physics.teleport(p.id, p.x, p.z);
    }
    this.stream();
  }
  input(id: string, v: unknown) {
    const p = this.players.get(id),
      i = validInput(v);
    if (
      !p ||
      !i ||
      p.bot ||
      this.phase !== "playing" ||
      i.seq <= (this.lastSeq.get(id) ?? -1)
    )
      return;
    this.lastSeq.set(id, i.seq);
    const q = this.queues.get(id)!;
    if (q.length >= 8) q.shift();
    q.push(i);
  }
  stream() {
    const active = new Set<string>();
    for (const p of this.players.values())
      if (p.hp > 0)
        for (const c of this.map.near(p.x, p.z)) {
          active.add(c.key);
          if (!this.physics.statics.has(c.key)) {
            // Merge contiguous wall cells horizontally before creating colliders.
            const boxes = chunkBoxes(c);
            const merged = [];
            for (const b of boxes) {
              const last = merged[merged.length - 1];
              if (
                last &&
                b.hx === 1 &&
                b.hz === 1 &&
                last.z === b.z &&
                Math.abs(last.x + last.hx - (b.x - 1)) < 0.001
              ) {
                last.hx += 1;
                last.x += 1;
              } else merged.push({ ...b });
            }
            this.physics.addStatic(c.key, merged);
          }
        }
    for (const k of this.physics.statics.keys())
      if (!active.has(k)) this.physics.removeStatic(k);
    for (const k of this.map.chunks.keys())
      if (!active.has(k)) this.map.chunks.delete(k);
  }
  lit(x: number, z: number) {
    const l = this.lights.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
    if (!l) return false;
    const left = l.until - this.tick * DT;
    return left > 1.2 || (left > 0 && Math.floor(left * 9) % 2 === 0);
  }
  ability(p: Actor, action: number) {
    if (this.phase !== "playing" || p.hp <= 0 || p.slip > 0) return;
    if (action === 1 && p.lightCd <= 0) {
      p.lightCd = 24;
      const key = `${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}`;
      this.lights.set(key, { key, until: this.tick * DT + 7 });
      this.events.push({ kind: "power", x: p.x, z: p.z });
    }
    if (action === 2 && p.bananaCd <= 0) {
      p.bananaCd = 12;
      const id = `t${++this.nextTrap}`;
      this.traps.set(id, {
        id,
        x: p.x,
        z: p.z,
        owner: p.id,
        arm: this.tick * DT + 0.8,
      });
    }
    if (action === 4 && p.ammo < 12 && p.reload <= 0) p.reload = 1.7;
  }
  shoot(p: Actor) {
    if (
      this.phase !== "playing" ||
      p.hp <= 0 ||
      p.slip > 0 ||
      p.reload > 0 ||
      p.ammo <= 0 ||
      this.tick - (this.lastShot.get(p.id) ?? -100) < 8
    )
      return;
    p.ammo--;
    this.lastShot.set(p.id, this.tick);
    const speed = Math.hypot(p.vx, p.vz),
      spread = 0.008 + speed * 0.008,
      a = p.angle + (this.random() - 0.5) * spread * 2,
      dx = Math.sin(a),
      dz = Math.cos(a);
    const boxes = this.map.boxes(p.x, p.z, 35, false);
    let dist = castRay(p.x, p.z, dx, dz, 35, boxes),
      target: Actor | undefined;
    for (const other of this.players.values())
      if (other.id !== p.id && other.hp > 0) {
        const d = segmentCircle(p.x, p.z, dx, dz, other.x, other.z, 0.4);
        if (d < dist) {
          dist = d;
          target = other;
        }
      }
    const e: GameEvent = {
      kind: "shot",
      x: p.x,
      z: p.z,
      ex: p.x + dx * dist,
      ez: p.z + dz * dist,
      shooter: p.id,
    };
    this.events.push(e);
    if (target && target.team !== p.team) {
      target.hp = Math.max(0, target.hp - 25);
      this.events.push({
        kind: "hit",
        x: target.x,
        z: target.z,
        target: target.id,
        shooter: p.id,
      });
    }
  }
  botInput(p: Actor): Input {
    const boxes = this.map.boxes(p.x, p.z),
      enemy = [...this.players.values()].find(
        (q) =>
          q.team !== p.team &&
          q.hp > 0 &&
          visible(p, q, boxes, this.lit(q.x, q.z)),
      );
    if (enemy)
      return {
        ...idle(p),
        angle: Math.atan2(enemy.x - p.x, enemy.z - p.z),
        fire: true,
      };
    let goal = this.botGoal.get(p.id);
    if (
      !goal ||
      Math.hypot(goal.x - p.x, goal.z - p.z) < 0.6 ||
      this.tick % 120 === 0
    ) {
      const angles = [
        p.angle,
        p.angle + Math.PI / 2,
        p.angle - Math.PI / 2,
        p.angle + Math.PI,
      ];
      const opts = angles.filter(
        (a) => castRay(p.x, p.z, Math.sin(a), Math.cos(a), 4, boxes) > 3.5,
      );
      const a =
        opts[Math.floor(this.random() * opts.length)] ?? p.angle + Math.PI;
      goal = { x: p.x + Math.sin(a) * 3, z: p.z + Math.cos(a) * 3 };
      this.botGoal.set(p.id, goal);
    }
    const dx = goal.x - p.x,
      dz = goal.z - p.z,
      d = Math.max(0.01, Math.hypot(dx, dz));
    return { ...idle(p), mx: dx / d, mz: dz / d, angle: Math.atan2(dx, dz) };
  }
  step() {
    if (this.phase !== "playing") return;
    this.tick++;
    this.remaining = Math.max(0, 300 - this.tick * DT);
    if (this.tick % 30 === 1) this.stream();
    for (const p of this.players.values()) {
      if (p.hp <= 0) continue;
      for (const key of ["slip", "lightCd", "bananaCd"] as const)
        p[key] = Math.max(0, p[key] - DT);
      if (p.reload > 0) {
        p.reload = Math.max(0, p.reload - DT);
        if (p.reload === 0) p.ammo = 12;
      }
      const i = p.bot
        ? this.botInput(p)
        : (this.queues.get(p.id)!.shift() ?? idle(p));
      integrate(p, i, this.physics);
      p.ack = i.seq;
      this.ability(p, i.action);
      if (i.fire) this.shoot(p);
      if (this.tick % (i.run ? 9 : 15) === 0 && Math.hypot(p.vx, p.vz) > 1)
        this.events.push({ kind: "step", x: p.x, z: p.z, shooter: p.id });
      for (const [id, t] of this.traps)
        if (this.tick * DT >= t.arm && Math.hypot(p.x - t.x, p.z - t.z) < 0.7) {
          p.slip = 1.5;
          p.vx = Math.sin(p.angle) * 7;
          p.vz = Math.cos(p.angle) * 7;
          this.traps.delete(id);
          this.events.push({ kind: "slip", x: p.x, z: p.z, target: p.id });
          break;
        }
    }
    for (const [key, l] of this.lights)
      if (l.until < this.tick * DT) this.lights.delete(key);
    this.checkEnd();
  }
  checkEnd() {
    const alive = [...this.players.values()].filter((p) => p.hp > 0);
    const a = alive.filter((p) => p.team === "ALPHA"),
      b = alive.filter((p) => p.team === "BRAVO");
    if (!a.length || !b.length || !this.remaining) {
      this.phase = "ended";
      const score = (ps: Actor[]) =>
        ps.length * 1000 + ps.reduce((s, p) => s + p.hp, 0);
      this.winner =
        score(a) === score(b)
          ? "НИЧЬЯ"
          : score(a) > score(b)
            ? "ALPHA"
            : "BRAVO";
      for (const p of this.players.values()) p.ready = !!p.bot;
    }
  }
  snapshot(id: string, known: Set<string>): Snapshot {
    const self = this.players.get(id)!;
    const boxes = this.map.boxes(self.x, self.z);
    const canSee = (p: { x: number; z: number }) =>
      visible(self, p, boxes, this.lit(p.x, p.z));
    const players = [...this.players.values()]
      .filter((p) => p.id !== id && p.hp > 0 && canSee(p))
      .map((p) => ({ ...p }));
    const ids = new Set(players.map((p) => p.id));
    ids.add(id);
    const patches: Patch[] = [];
    for (const p of this.players.values())
      if (
        p.id !== id &&
        p.hp > 0 &&
        Math.hypot(p.x - self.x, p.z - self.z) < 40
      ) {
        const obstacles = this.map.boxes(p.x, p.z);
        for (const da of [-0.4, 0, 0.4]) {
          const dx = Math.sin(p.angle + da),
            dz = Math.cos(p.angle + da),
            d = castRay(p.x, p.z, dx, dz, 18, obstacles);
          const hit = {
            x: p.x + dx * Math.max(0, d - 0.2),
            z: p.z + dz * Math.max(0, d - 0.2),
          };
          if (d < 18 && visible(self, hit, boxes, true))
            patches.push({
              x: Math.round(hit.x * 2) / 2,
              z: Math.round(hit.z * 2) / 2,
              strength: 0.65,
            });
        }
      }
    const chunks = this.map.near(self.x, self.z),
      active = new Set(chunks.map((c) => c.key));
    for (const k of known) if (!active.has(k)) known.delete(k);
    const send = chunks.filter((c) => !known.has(c.key));
    for (const c of send) known.add(c.key);
    const events: GameEvent[] = [];
    for (const e of this.events) {
      const d = Math.hypot(e.x - self.x, e.z - self.z);
      if (d > (e.kind === "shot" ? 40 : 20)) continue;
      if (
        (e.kind !== "hit" && e.shooter && ids.has(e.shooter)) ||
        canSee(e) ||
        e.target === id
      )
        events.push({
          ...e,
          shooter: e.shooter && ids.has(e.shooter) ? e.shooter : undefined,
          target: e.target && ids.has(e.target) ? e.target : undefined,
        });
      else
        events.push({
          kind: e.kind,
          x: Math.round(e.x / 4) * 4,
          z: Math.round(e.z / 4) * 4,
        });
    }
    return {
      type: "state",
      tick: this.tick,
      phase: this.phase,
      remaining: this.remaining,
      winner: this.winner,
      self: { ...self },
      players,
      roster: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        ready: p.ready,
        alive: p.hp > 0,
        bot: p.bot,
      })),
      counts: {
        ALPHA: [...this.players.values()].filter(
          (p) => p.team === "ALPHA" && p.hp > 0,
        ).length,
        BRAVO: [...this.players.values()].filter(
          (p) => p.team === "BRAVO" && p.hp > 0,
        ).length,
      },
      traps: [...this.traps.values()]
        .filter(canSee)
        .map((t) => ({ ...t, owner: t.owner === id ? id : "" })),
      lights: [...this.lights.values()].filter((l) => {
        const [x, z] = l.key.split(",").map(Number);
        return Math.hypot(x * 16 + 8 - self.x, z * 16 + 8 - self.z) < 48;
      }),
      patches,
      events,
      chunks: send,
      seed: this.seed,
      teamSize: this.teamSize,
    };
  }
  dispose() {
    this.physics.dispose();
  }
}
