import type { Chunk } from "./map.ts";
export type Team = "ALPHA" | "BRAVO";
export interface Input {
  seq: number;
  mx: number;
  mz: number;
  angle: number;
  run: boolean;
  fire: boolean;
  action: 0 | 1 | 2 | 3 | 4;
}
export interface Actor {
  id: string;
  name: string;
  team: Team;
  skin: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  hp: number;
  ammo: number;
  slip: number;
  lightCd: number;
  bananaCd: number;
  reload: number;
  ack: number;
  ready: boolean;
  bot?: boolean;
}
export interface Trap {
  id: string;
  x: number;
  z: number;
  owner: string;
  arm: number;
}
export interface Light {
  key: string;
  until: number;
}
export interface GameEvent {
  kind: "shot" | "hit" | "slip" | "power" | "step";
  x: number;
  z: number;
  ex?: number;
  ez?: number;
  shooter?: string;
  target?: string;
}
export interface Patch {
  x: number;
  z: number;
  strength: number;
}
export interface Snapshot {
  type: "state";
  tick: number;
  phase: "lobby" | "playing" | "ended";
  remaining: number;
  winner: string;
  self: Actor;
  players: Actor[];
  roster: {
    id: string;
    name: string;
    team: Team;
    ready: boolean;
    alive: boolean;
    bot?: boolean;
  }[];
  counts: Record<Team, number>;
  traps: Trap[];
  lights: Light[];
  patches: Patch[];
  events: GameEvent[];
  chunks: Chunk[];
  seed: number;
  teamSize: number;
}
export const DT = 1 / 30;
