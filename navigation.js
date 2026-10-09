const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
function pointDistance(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}
export function visibleSegment(ax, ay, bx, by, walls, clearance = .3) {
  for (const s of walls) {
    if (Math.max(ax, bx) + clearance < Math.min(s.ax, s.bx) || Math.min(ax, bx) - clearance > Math.max(s.ax, s.bx) || Math.max(ay, by) + clearance < Math.min(s.ay, s.by) || Math.min(ay, by) - clearance > Math.max(s.ay, s.by)) continue;
    const dx = bx - ax, dy = by - ay, ex = s.bx - s.ax, ey = s.by - s.ay, det = dx * ey - dy * ex;
    if (Math.abs(det) > 1e-9) {
      const t = ((s.ax - ax) * ey - (s.ay - ay) * ex) / det, u = ((s.ax - ax) * dy - (s.ay - ay) * dx) / det;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return false;
    }
    if (Math.min(pointDistance(ax, ay, s.ax, s.ay, s.bx, s.by), pointDistance(bx, by, s.ax, s.ay, s.bx, s.by), pointDistance(s.ax, s.ay, ax, ay, bx, by), pointDistance(s.bx, s.by, ax, ay, bx, by)) < clearance - 1e-6) return false;
  }
  return true;
}
class Heap {
  constructor() { this.a = []; }
  push(i, d) { let k = this.a.length; const item = { i, d }; this.a.push(item); while (k > 0) { const p = (k - 1) >> 1; if (this.a[p].d <= d) break; this.a[k] = this.a[p]; k = p; } this.a[k] = item; }
  pop() { const first = this.a[0], last = this.a.pop(); if (this.a.length) { let k = 0; while (k * 2 + 1 < this.a.length) { let c = k * 2 + 1; if (c + 1 < this.a.length && this.a[c + 1].d < this.a[c].d) c++; if (this.a[c].d >= last.d) break; this.a[k] = this.a[c]; k = c; } this.a[k] = last; } return first; }
}

export class FlowField {
  constructor(w, h, walls, exits, { geometry, costs, obstacles = [], goals } = {}) {
    this.cell = .5; this.cols = Math.ceil(w / this.cell); this.rows = Math.ceil(h / this.cell); this.w = w; this.h = h; this.walls = walls; this.obstacles = obstacles;
    const n = this.cols * this.rows;
    if (!geometry) {
      const blocked = new Uint8Array(n), near = new Uint8Array(n), edges = new Uint8Array(n);
      for (const s of walls) {
        const x0 = clamp(Math.floor((Math.min(s.ax, s.bx) - 1) / this.cell), 0, this.cols - 1), x1 = clamp(Math.ceil((Math.max(s.ax, s.bx) + 1) / this.cell), 0, this.cols - 1);
        const y0 = clamp(Math.floor((Math.min(s.ay, s.by) - 1) / this.cell), 0, this.rows - 1), y1 = clamp(Math.ceil((Math.max(s.ay, s.by) + 1) / this.cell), 0, this.rows - 1);
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const d = pointDistance((x + .5) * this.cell, (y + .5) * this.cell, s.ax, s.ay, s.bx, s.by), i = y * this.cols + x; if (d < .31) blocked[i] = 1; if (d < 1) near[i] = 1; }
      }
      for (let i = 0; i < n; i++) {
        if (blocked[i]) continue;
        const x = i % this.cols, y = Math.floor(i / this.cols);
        directions.forEach(([ox, oy], k) => {
          const nx = x + ox, ny = y + oy, ni = ny * this.cols + nx;
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || blocked[ni]) return;
          if (ox && oy && (blocked[y * this.cols + nx] || blocked[ny * this.cols + x])) return;
          if ((near[i] || near[ni]) && !visibleSegment((x + .5) * .5, (y + .5) * .5, (nx + .5) * .5, (ny + .5) * .5, walls)) return;
          edges[i] |= 1 << k;
        });
      }
      geometry = { blocked, edges };
    }
    this.geometry = geometry; this.blocked = geometry.blocked.slice(); this.distance = new Float32Array(n).fill(Infinity); this.next = new Int32Array(n).fill(-1); this.targets = new Map();
    for (const a of obstacles) {
      const radius = a.radius + .31;
      for (let y = Math.max(0, Math.floor((a.y - radius) / .5)); y <= Math.min(this.rows - 1, Math.ceil((a.y + radius) / .5)); y++) for (let x = Math.max(0, Math.floor((a.x - radius) / .5)); x <= Math.min(this.cols - 1, Math.ceil((a.x + radius) / .5)); x++) if (Math.hypot((x + .5) * .5 - a.x, (y + .5) * .5 - a.y) < radius) this.blocked[y * this.cols + x] = 1;
    }
    const heap = new Heap();
    const seed = (i, target) => { if (this.blocked[i]) return; this.distance[i] = 0; this.targets.set(i, target); heap.push(i, 0); };
    if (goals) {
      for (const goal of goals) { const i = this.nearest(goal.x, goal.y, false); if (i >= 0) seed(i, this.center(i)); }
    } else for (const e of exits) {
      const horizontal = e.side === 'top' || e.side === 'bottom';
      for (let p = 0; p < (horizontal ? this.cols : this.rows); p++) {
        const value = (p + .5) * .5;
        if (Math.abs(value - e.at) > e.width / 2 - .24) continue;
        const x = horizontal ? p : e.side === 'left' ? 0 : this.cols - 1, y = horizontal ? e.side === 'top' ? 0 : this.rows - 1 : p;
        const lateral = clamp(value, e.at - e.width / 2 + .4, e.at + e.width / 2 - .4);
        seed(y * this.cols + x, { x: horizontal ? lateral : e.side === 'left' ? -.6 : w + .6, y: horizontal ? e.side === 'top' ? -.6 : h + .6 : lateral });
      }
    }
    while (heap.a.length) {
      const { i, d } = heap.pop(); if (d > this.distance[i] + .001) continue;
      const x = i % this.cols, y = Math.floor(i / this.cols);
      for (let k = 0; k < directions.length; k++) {
        if (!(geometry.edges[i] & 1 << k)) continue;
        const [ox, oy] = directions[k], nx = x + ox, ny = y + oy, ni = ny * this.cols + nx;
        if (this.blocked[ni] || (ox && oy && (this.blocked[y * this.cols + nx] || this.blocked[ny * this.cols + x]))) continue;
        const nd = d + (ox && oy ? Math.SQRT2 : 1) * (costs ? (costs[i] + costs[ni]) / 2 : 1);
        if (nd < this.distance[ni] - .001) { this.distance[ni] = nd; this.next[ni] = i; heap.push(ni, nd); }
      }
    }
  }
  center(i) { return { x: (i % this.cols + .5) * .5, y: (Math.floor(i / this.cols) + .5) * .5 }; }
  index(x, y) { return clamp(Math.floor(y / .5), 0, this.rows - 1) * this.cols + clamp(Math.floor(x / .5), 0, this.cols - 1); }
  clear(x, y, tx, ty) {
    // Allow a person pushed into a clearance margin to move away, never through a wall.
    const clearance = Math.min(.3, ...this.walls.map(s => pointDistance(x, y, s.ax, s.ay, s.bx, s.by)));
    if (!visibleSegment(x, y, tx, ty, this.walls, Math.max(.08, clearance - .001))) return false;
    for (const a of this.obstacles) { const radius = Math.min(a.radius + .27, Math.hypot(x - a.x, y - a.y) - .005); if (pointDistance(a.x, a.y, x, y, tx, ty) < radius) return false; }
    return true;
  }
  nearest(x, y, reachable = true) {
    const cell = this.index(x, y);
    if (!this.blocked[cell] && (!reachable || Number.isFinite(this.distance[cell]))) return cell;
    let best = Infinity, result = -1;
    const cx = cell % this.cols, cy = Math.floor(cell / this.cols);
    for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
      const nx = cx + ox, ny = cy + oy, i = ny * this.cols + nx;
      if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || this.blocked[i] || (reachable && !Number.isFinite(this.distance[i]))) continue;
      const p = this.center(i), d = Math.hypot(p.x - x, p.y - y);
      if (d < best && this.clear(x, y, p.x, p.y)) { best = d; result = i; }
    }
    return result;
  }
  waypoint(x, y) {
    let i = this.nearest(x, y);
    if (i < 0) return null;
    let target = this.center(i);
    // Follow actual graph predecessors and shortcut only segments with line of sight.
    for (let steps = 0; steps < 12; steps++) {
      const goal = this.targets.get(i), candidate = goal || (this.next[i] >= 0 ? this.center(this.next[i]) : null);
      if (!candidate || !this.clear(x, y, candidate.x, candidate.y)) break;
      target = candidate;
      if (goal || Math.hypot(target.x - x, target.y - y) > 3.5) break;
      i = this.next[i];
    }
    return target;
  }
  direction(x, y) {
    const p = this.waypoint(x, y); if (!p) return { x: 0, y: 0, trapped: true };
    const dx = p.x - x, dy = p.y - y, length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, trapped: false };
  }
}

// 85% follow a sign on each encounter. Equal densities imply equal choice odds;
// density changes the odds, rather than a fixed preference for the first arrow.
export function chooseArrow(candidates, rng, panic = 35) {
  if (!candidates.length || rng() >= .85) return null;
  const exponent = 2.6 - 2.3 * clamp(panic / 100, 0, 1);
  const weights = candidates.map(c => 1 / (1 + Math.max(0, c.density)) ** exponent);
  let draw = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) { draw -= weights[i]; if (draw <= 0) return candidates[i]; }
  return candidates.at(-1);
}
