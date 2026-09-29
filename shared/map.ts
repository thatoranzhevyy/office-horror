export const CELL = 2,
  CHUNK = 32,
  SIZE = CELL * CHUNK;
export interface Box {
  x: number;
  z: number;
  hx: number;
  hz: number;
}
export interface Prop extends Box {
  id: string;
  kind: string;
  angle: number;
  solid: boolean;
  opaque: boolean;
}
export interface Chunk {
  key: string;
  cx: number;
  cz: number;
  cells: number[];
  props: Prop[];
  rooms: { x: number; z: number; kind: string }[];
}
export const PRESETS = [
  "OFFICE_SMALL",
  "OFFICE_LARGE",
  "OPEN_SPACE",
  "MEETING_ROOM",
  "KITCHEN",
  "ARCHIVE",
  "SERVER_ROOM",
  "LOUNGE",
  "STORAGE",
  "RECEPTION",
  "COPY_ROOM",
  "ABANDONED_OFFICE",
];
export function hash(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
export function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function generateChunk(seed: number, cx: number, cz: number): Chunk {
  const random = rng(hash(seed, cx, cz)),
    cells = new Array<number>(CHUNK * CHUNK).fill(1),
    rooms: Chunk["rooms"] = [],
    props: Prop[] = [];
  const carve = (x: number, z: number) => {
    if (x > 0 && z > 0 && x < 31 && z < 31) cells[z * 32 + x] = 0;
  };
  const node = (x: number, z: number) => {
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) carve(2 + x * 4 + a, 2 + z * 4 + b);
  };
  const link = (x: number, z: number, nx: number, nz: number) => {
    for (let a = Math.min(x, nx) * 4 + 2; a <= Math.max(x, nx) * 4 + 3; a++)
      for (let b = Math.min(z, nz) * 4 + 2; b <= Math.max(z, nz) * 4 + 3; b++)
        carve(a, b);
  };
  const seen = new Set<number>([0]),
    stack = [[0, 0]];
  node(0, 0);
  while (stack.length) {
    const [x, z] = stack[stack.length - 1];
    const choices = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]
      .map(([dx, dz]) => [x + dx, z + dz])
      .filter(
        ([a, b]) => a >= 0 && a < 7 && b >= 0 && b < 7 && !seen.has(b * 7 + a),
      );
    if (!choices.length) {
      stack.pop();
      continue;
    }
    const [nx, nz] = choices[Math.floor(random() * choices.length)];
    link(x, z, nx, nz);
    node(nx, nz);
    seen.add(nz * 7 + nx);
    stack.push([nx, nz]);
  }
  for (let i = 0; i < 22; i++) {
    let x = Math.floor(random() * 6),
      z = Math.floor(random() * 6);
    random() < 0.5 ? link(x, z, x + 1, z) : link(x, z, x, z + 1);
  }
  // Portals are functions of the shared edge, never of visit order.
  const west = 2 + 4 * (hash(seed ^ 991, cx, cz) % 7),
    east = 2 + 4 * (hash(seed ^ 991, cx + 1, cz) % 7);
  const north = 2 + 4 * (hash(seed ^ 337, cx, cz) % 7),
    south = 2 + 4 * (hash(seed ^ 337, cx, cz + 1) % 7);
  for (let i = 0; i < 2; i++) {
    for (let a = 0; a <= 3; a++) cells[(west + i) * 32 + a] = 0;
    for (let a = 26; a < 32; a++) cells[(east + i) * 32 + a] = 0;
    for (let b = 0; b <= 3; b++) cells[b * 32 + north + i] = 0;
    for (let b = 26; b < 32; b++) cells[b * 32 + south + i] = 0;
  }
  for (let i = 0; i < 12; i++) {
    const x = 3 + Math.floor(random() * 6) * 4,
      z = 3 + Math.floor(random() * 6) * 4;
    const kind = PRESETS[Math.floor(random() * PRESETS.length)];
    rooms.push({ x: cx * SIZE + x * 2, z: cz * SIZE + z * 2, kind });
    for (let a = -1; a <= 2; a++)
      for (let b = -1; b <= 2; b++) carve(x + a, z + b);
  }
  const sets: Record<string, string[]> = {
    KITCHEN: ["fridge", "counter", "coffee", "water"],
    ARCHIVE: ["shelf", "cabinet", "boxes"],
    SERVER_ROOM: ["server", "server", "cabinet"],
    LOUNGE: ["sofa", "plant", "table"],
    STORAGE: ["boxes", "shelf", "cabinet"],
    RECEPTION: ["reception", "chair", "plant"],
    COPY_ROOM: ["printer", "cabinet", "paper"],
    MEETING_ROOM: ["meeting", "chair", "board"],
  };
  for (let z = 2; z < 30; z++)
    for (let x = 2; x < 30; x++) {
      if (cells[z * 32 + x] || random() > 0.18) continue;
      const walls = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dz]) => cells[(z + dz) * 32 + x + dx] === 1);
      if (!walls.length) continue;
      // Keep the center two-cell corridor and all chunk exits clear.
      if ((x % 4 === 2 || x % 4 === 3) && (z % 4 === 2 || z % 4 === 3))
        continue;
      const wx = cx * SIZE + x * 2 + 1,
        wz = cz * SIZE + z * 2 + 1;
      const room = rooms.reduce((a, b) =>
        Math.hypot(a.x - wx, a.z - wz) < Math.hypot(b.x - wx, b.z - wz) ? a : b,
      );
      const pool = sets[room.kind] ?? [
        "desk",
        "desk",
        "chair",
        "cabinet",
        "plant",
        "water",
        "paper",
        "warning",
      ];
      const kind = pool[Math.floor(random() * pool.length)],
        [dx, dz] = walls[0];
      const solid = !["paper", "warning"].includes(kind),
        opaque = ["cabinet", "shelf", "server", "fridge"].includes(kind);
      props.push({
        id: `${cx},${cz}:${x},${z}`,
        x: wx + dx * 0.36,
        z: wz + dz * 0.36,
        hx: 0.62,
        hz: 0.62,
        kind,
        angle: Math.atan2(dx, dz),
        solid,
        opaque,
      });
    }
  return { key: `${cx},${cz}`, cx, cz, cells, props, rooms };
}
export function chunkBoxes(c: Chunk, opaqueOnly = false): Box[] {
  const boxes: Box[] = [];
  for (let z = 0; z < CHUNK; z++)
    for (let x = 0; x < CHUNK; x++)
      if (c.cells[z * CHUNK + x])
        boxes.push({
          x: c.cx * SIZE + x * 2 + 1,
          z: c.cz * SIZE + z * 2 + 1,
          hx: 1,
          hz: 1,
        });
  for (const p of c.props) if (opaqueOnly ? p.opaque : p.solid) boxes.push(p);
  return boxes;
}
export class WorldMap {
  chunks = new Map<string, Chunk>();
  constructor(public seed: number) {}
  get(cx: number, cz: number) {
    const key = `${cx},${cz}`;
    let c = this.chunks.get(key);
    if (!c) {
      c = generateChunk(this.seed, cx, cz);
      this.chunks.set(key, c);
    }
    return c;
  }
  near(x: number, z: number, r = 1) {
    const a = Math.floor(x / SIZE),
      b = Math.floor(z / SIZE),
      out: Chunk[] = [];
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) out.push(this.get(a + dx, b + dz));
    return out;
  }
  boxes(x: number, z: number, r = 24, opaqueOnly = true) {
    const out: Box[] = [];
    for (
      let cz = Math.floor((z - r) / SIZE);
      cz <= Math.floor((z + r) / SIZE);
      cz++
    )
      for (
        let cx = Math.floor((x - r) / SIZE);
        cx <= Math.floor((x + r) / SIZE);
        cx++
      ) {
        for (const box of chunkBoxes(this.get(cx, cz), opaqueOnly))
          if (Math.abs(box.x - x) < r + 2 && Math.abs(box.z - z) < r + 2)
            out.push(box);
      }
    return out;
  }
}
