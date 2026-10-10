import { FlowField, visibleSegment } from './navigation.js';

const cross = (x, y, u, v) => x * v - y * u;
const point = (s, t) => ({ x: s.ax + (s.bx - s.ax) * t, y: s.ay + (s.by - s.ay) * t });

// Split at actual intersections, so trimming a T-junction or diagonal keeps the
// surviving wall on its original line rather than replacing it with grid steps.
function cuts(wall, solids) {
  const dx = wall.bx - wall.ax, dy = wall.by - wall.ay, length2 = dx * dx + dy * dy;
  const result = [0, 1];
  const add = t => { if (t > 1e-7 && t < 1 - 1e-7) result.push(t); };
  for (const s of solids) {
    const ex = s.bx - s.ax, ey = s.by - s.ay, px = s.ax - wall.ax, py = s.ay - wall.ay;
    const det = cross(dx, dy, ex, ey);
    if (Math.abs(det) > 1e-8) {
      const t = cross(px, py, ex, ey) / det, u = cross(px, py, dx, dy) / det;
      if (u >= -1e-7 && u <= 1 + 1e-7) add(t);
    } else if (Math.abs(cross(px, py, dx, dy)) < 1e-7 && length2 > 0) {
      add((px * dx + py * dy) / length2);
      add(((s.bx - wall.ax) * dx + (s.by - wall.ay) * dy) / length2);
    }
    // A gap narrower than body clearance is also sealed by the navigation grid.
    // Split nearby endpoint projections so old/imported unsnapped cuts still
    // trim the inaccessible part of the adjoining boundary.
    if (length2 > 0) for (const p of [{ x: s.ax, y: s.ay }, { x: s.bx, y: s.by }]) {
      const t = ((p.x - wall.ax) * dx + (p.y - wall.ay) * dy) / length2, q = point(wall, t);
      if (Math.hypot(p.x - q.x, p.y - q.y) < .62) add(t);
    }
  }
  return [...new Set(result.map(t => Math.round(t * 1e8) / 1e8))].sort((a, b) => a - b);
}

function reachableSide(field, solids, s, sign) {
  const length = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const nx = -(s.by - s.ay) / length * sign, ny = (s.bx - s.ax) / length * sign;
  for (const t of [.5, .2, .8]) {
    const p = point(s, t);
    for (const offset of [.4, .7]) {
      const x = p.x + nx * offset, y = p.y + ny * offset;
      if (x <= 0 || y <= 0 || x >= field.w || y >= field.h) continue;
      const cell = field.nearest(x, y);
      if (cell < 0) continue;
      const q = field.center(cell);
      if ((q.x - p.x) * nx + (q.y - p.y) * ny <= 0 || Math.hypot(q.x - p.x, q.y - p.y) > 1.1) continue;
      if (visibleSegment(p.x + nx * .01, p.y + ny * .01, q.x, q.y, solids, .001)) return true;
    }
  }
  return false;
}

// A static design pass only. Runtime casualties must never erase a room or
// teleport the crowd when they temporarily obstruct a route.
export function resolveVenue(w, h, boundary, walls, exits) {
  const source = [...boundary, ...walls], field = new FlowField(w, h, source, exits);
  const hasFloor = field.distance.some(Number.isFinite);
  const exposed = [], editable = [];
  if (hasFloor) source.forEach((wall, index) => {
    const points = cuts(wall, source);
    let last = null;
    for (let i = 1; i < points.length; i++) {
      const a = point(wall, points[i - 1]), b = point(wall, points[i]);
      const segment = { ax: a.x, ay: a.y, bx: b.x, by: b.y };
      if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue;
      const left = reachableSide(field, source, segment, 1), right = reachableSide(field, source, segment, -1);
      if (!left && !right) { last = null; continue; }
      segment.exterior = left !== right;
      if (last && last.exterior === segment.exterior && Math.hypot(last.bx - a.x, last.by - a.y) < 1e-6) {
        last.bx = b.x; last.by = b.y;
      } else {
        last = segment; exposed.push(segment);
        if (index >= boundary.length) editable.push(segment);
      }
    }
  });
  const geometry = { blocked: field.geometry.blocked.slice(), edges: field.geometry.edges.slice() };
  for (let i = 0; i < geometry.blocked.length; i++) if (!Number.isFinite(field.distance[i])) geometry.blocked[i] = 1;
  // Horizontal runs make filling the sealed areas cheap during animation.
  const voids = [];
  for (let y = 0; y < field.rows; y++) {
    let start = -1;
    for (let x = 0; x <= field.cols; x++) {
      const sealed = x < field.cols && field.nearest((x + .5) * field.cell, (y + .5) * field.cell) < 0;
      if (sealed && start < 0) start = x;
      if (!sealed && start >= 0) { voids.push({ x: start * field.cell, y: y * field.cell, w: (x - start) * field.cell, h: field.cell }); start = -1; }
    }
  }
  // Keep the empty draft editable when every exit is removed/blocked. Adding an
  // exit or undoing must recover the room, not silently discard the whole plan.
  return { field, geometry, solids: hasFloor ? exposed : source, walls: hasFloor ? editable : walls,
    displayWalls: hasFloor ? exposed : source, voids, hasFloor };
}
