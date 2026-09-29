import type { Box } from "./map.ts";
export const VIEW_RANGE = 23,
  VIEW_HALF = 1.04;
export const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export function castRay(
  x: number,
  z: number,
  dx: number,
  dz: number,
  max: number,
  boxes: Box[],
): number {
  let nearest = max;
  for (const b of boxes) {
    let lo = 0,
      hi = nearest;
    for (const [o, d, min, maxB] of [
      [x, dx, b.x - b.hx, b.x + b.hx],
      [z, dz, b.z - b.hz, b.z + b.hz],
    ]) {
      if (Math.abs(d) < 1e-8) {
        if (o < min || o > maxB) {
          hi = -1;
          break;
        }
      } else {
        let a = (min - o) / d,
          c = (maxB - o) / d;
        if (a > c) [a, c] = [c, a];
        lo = Math.max(lo, a);
        hi = Math.min(hi, c);
      }
    }
    if (hi >= lo && lo < nearest) nearest = lo;
  }
  return nearest;
}
export function visible(
  a: { x: number; z: number; angle: number },
  b: { x: number; z: number },
  boxes: Box[],
  lit = false,
) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz);
  if (d > VIEW_RANGE) return false;
  if (
    d > 1.5 &&
    !lit &&
    Math.abs(angleDelta(Math.atan2(dx, dz), a.angle)) > VIEW_HALF
  )
    return false;
  return d < 0.001 || castRay(a.x, a.z, dx / d, dz / d, d, boxes) >= d - 0.12;
}
export function segmentCircle(
  x: number,
  z: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  r: number,
) {
  const ox = x - cx,
    oz = z - cz,
    b = ox * dx + oz * dz,
    c = ox * ox + oz * oz - r * r,
    disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : Infinity;
}
export function visibilityPolygon(
  x: number,
  z: number,
  angle: number,
  boxes: Box[],
  lit = false,
) {
  const points: { x: number; z: number }[] = [];
  const half = lit ? Math.PI : VIEW_HALF;
  for (let i = 0; i <= 100; i++) {
    const a = angle - half + (i / 100) * half * 2,
      dx = Math.sin(a),
      dz = Math.cos(a),
      d = castRay(x, z, dx, dz, VIEW_RANGE, boxes);
    points.push({ x: x + dx * d, z: z + dz * d });
  }
  return points;
}
