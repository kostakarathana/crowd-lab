export const SIGN_RADIUS = 4.5;
const TAU = Math.PI * 2;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

// Match the visible wall thickness, including its ends. Cache with the layout.
export function sightWalls(walls) {
  return walls.map(s => {
    const length = Math.hypot(s.bx - s.ax, s.by - s.ay);
    const ux = length ? (s.bx - s.ax) / length : 1, uy = length ? (s.by - s.ay) / length : 0, r = .16;
    const ax = s.ax - ux * r, ay = s.ay - uy * r, bx = s.bx + ux * r, by = s.by + uy * r;
    return [{ x: ax - uy * r, y: ay + ux * r }, { x: ax + uy * r, y: ay - ux * r }, { x: bx + uy * r, y: by - ux * r }, { x: bx - uy * r, y: by + ux * r }];
  });
}
function inside(x, y, polygon) {
  return polygon.every((a, i) => { const b = polygon[(i + 1) % 4]; return cross(b.x - a.x, b.y - a.y, x - a.x, y - a.y) >= -1e-9; });
}
function rayDistance(x, y, angle, walls) {
  const dx = Math.cos(angle), dy = Math.sin(angle); let distance = SIGN_RADIUS;
  for (const polygon of walls) {
    if (inside(x, y, polygon)) return 0;
    for (let i = 0; i < 4; i++) {
      const a = polygon[i], b = polygon[(i + 1) % 4], ex = b.x - a.x, ey = b.y - a.y;
      const det = cross(dx, dy, ex, ey);
      if (Math.abs(det) < 1e-10) continue;
      const t = cross(a.x - x, a.y - y, ex, ey) / det, u = cross(a.x - x, a.y - y, dx, dy) / det;
      if (t >= 0 && u >= -1e-9 && u <= 1 + 1e-9) distance = Math.min(distance, t);
    }
  }
  return distance;
}
export function canSeeSign(x, y, sign, walls) {
  const distance = Math.hypot(x - sign.ax, y - sign.ay);
  if (distance > SIGN_RADIUS) return false;
  return distance < rayDistance(sign.ax, sign.ay, Math.atan2(y - sign.ay, x - sign.ax), walls) - 1e-7;
}
export function visibilityPolygon(sign, walls) {
  const angles = Array.from({ length: 160 }, (_, i) => i * TAU / 160);
  // Rays beside every corner preserve sharp shadows and narrow door openings.
  for (const polygon of walls) for (const p of polygon) {
    const angle = Math.atan2(p.y - sign.ay, p.x - sign.ax);
    for (const offset of [-1e-7, 0, 1e-7]) angles.push((angle + offset + TAU) % TAU);
  }
  return angles.sort((a, b) => a - b).map(angle => {
    const distance = rayDistance(sign.ax, sign.ay, angle, walls);
    return { x: sign.ax + Math.cos(angle) * distance, y: sign.ay + Math.sin(angle) * distance };
  });
}
