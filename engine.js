// A qualitative social-force-inspired model, not a calibrated life-safety solver.
export const DT = 1 / 40;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const defaults = { count: 1000, panic: 35, width: 2.6, release: 0, friction: 55, variation: 25, casualties: true, seed: 42 };
export const scenarios = {
  hall: { name: 'Exhibition hall', tag: 'OPEN FLOOR', description: 'Two exits. A thousand different paths. Start with an open floor and shape the flow.', w: 48, h: 30, count: 1000, panic: 35, exits: [{ side: 'right', at: 10, width: 2.6 }, { side: 'right', at: 20, width: 2.6 }], walls: [] },
  concert: { name: 'Concert rush', tag: 'BOTTLENECK', description: 'A dense audience converges on one narrow door. Test the tradeoff between pressure and throughput.', w: 40, h: 28, count: 1400, panic: 78, exits: [{ side: 'right', at: 14, width: 1.6 }], walls: [] },
  stadium: { name: 'Stadium dispersal', tag: 'LARGE SCALE', description: 'A full concourse around a closed playing field. Balance four exits and keep the corners moving.', w: 80, h: 48, count: 3000, panic: 45, exits: [12, 30, 50, 68].map(at => ({ side: 'bottom', at, width: 3 })), walls: [{ ax: 25, ay: 14, bx: 55, by: 14 }, { ax: 55, ay: 14, bx: 55, by: 32 }, { ax: 55, ay: 32, bx: 25, by: 32 }, { ax: 25, ay: 32, bx: 25, by: 14 }], excluded: { x: 25, y: 14, w: 30, h: 18 } },
  concourse: { name: 'Concourse squeeze', tag: 'MERGING FLOWS', description: 'A wide gathering space feeds a narrow passage. Can you reduce the pileup before the pinch point?', w: 60, h: 24, count: 1200, panic: 55, exits: [{ side: 'right', at: 12, width: 3 }], walls: [{ ax: 42, ay: 0, bx: 42, by: 9 }, { ax: 42, ay: 15, bx: 42, by: 24 }, { ax: 42, ay: 9, bx: 60, by: 9 }, { ax: 42, ay: 15, bx: 60, by: 15 }] }
};
export function random(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function closest(x, y, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay;
  const t = clamp(((x - s.ax) * dx + (y - s.ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return { x: s.ax + dx * t, y: s.ay + dy * t };
}
export function distanceToWall(x, y, s) { const p = closest(x, y, s); return Math.hypot(x - p.x, y - p.y); }
export function boundaryWalls(w, h, exits) {
  const walls = [];
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const length = side === 'top' || side === 'bottom' ? w : h;
    const intervals = exits.filter(e => e.side === side).map(e => [clamp(e.at - e.width / 2, 0, length), clamp(e.at + e.width / 2, 0, length)]).sort((a, b) => a[0] - b[0]);
    let start = 0;
    const segment = (a, b) => { if (b <= a) return; walls.push(side === 'top' || side === 'bottom' ? { ax: a, ay: side === 'top' ? 0 : h, bx: b, by: side === 'top' ? 0 : h } : { ax: side === 'left' ? 0 : w, ay: a, bx: side === 'left' ? 0 : w, by: b }); };
    for (const [a, b] of intervals) { segment(start, a); start = Math.max(start, b); }
    segment(start, length);
  }
  return walls;
}
class Heap {
  constructor() { this.a = []; }
  push(i, d) { let k = this.a.length; const item = { i, d }; this.a.push(item); while (k > 0) { const p = (k - 1) >> 1; if (this.a[p].d <= d) break; this.a[k] = this.a[p]; k = p; } this.a[k] = item; }
  pop() { const first = this.a[0], last = this.a.pop(); if (this.a.length) { let k = 0; while (k * 2 + 1 < this.a.length) { let c = k * 2 + 1; if (c + 1 < this.a.length && this.a[c + 1].d < this.a[c].d) c++; if (this.a[c].d >= last.d) break; this.a[k] = this.a[c]; k = c; } this.a[k] = last; } return first; }
}
export class FlowField {
  constructor(w, h, walls, exits) {
    this.cell = 0.5; this.cols = Math.ceil(w / this.cell); this.rows = Math.ceil(h / this.cell); this.w = w; this.h = h;
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n); this.distance = new Float32Array(n).fill(Infinity); this.dx = new Float32Array(n); this.dy = new Float32Array(n);
    // Rasterize segments conservatively, including clearance for a person's center.
    for (const wall of walls) {
      const x0 = clamp(Math.floor((Math.min(wall.ax, wall.bx) - .5) / this.cell), 0, this.cols - 1), x1 = clamp(Math.ceil((Math.max(wall.ax, wall.bx) + .5) / this.cell), 0, this.cols - 1);
      const y0 = clamp(Math.floor((Math.min(wall.ay, wall.by) - .5) / this.cell), 0, this.rows - 1), y1 = clamp(Math.ceil((Math.max(wall.ay, wall.by) + .5) / this.cell), 0, this.rows - 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (distanceToWall((x + .5) * this.cell, (y + .5) * this.cell, wall) < .31) this.blocked[y * this.cols + x] = 1;
    }
    const heap = new Heap();
    for (const e of exits) {
      const horizontal = e.side === 'top' || e.side === 'bottom';
      for (let p = 0; p < (horizontal ? this.cols : this.rows); p++) {
        const value = (p + .5) * this.cell;
        if (Math.abs(value - e.at) > e.width / 2 - .24) continue;
        const x = horizontal ? p : e.side === 'left' ? 0 : this.cols - 1;
        const y = horizontal ? e.side === 'top' ? 0 : this.rows - 1 : p;
        const i = y * this.cols + x;
        if (this.blocked[i]) continue;
        this.distance[i] = 0; heap.push(i, 0);
        this.dx[i] = e.side === 'left' ? -1 : e.side === 'right' ? 1 : 0;
        this.dy[i] = e.side === 'top' ? -1 : e.side === 'bottom' ? 1 : 0;
      }
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
    while (heap.a.length) {
      const { i, d } = heap.pop(); if (d > this.distance[i] + .001) continue;
      const x = i % this.cols, y = Math.floor(i / this.cols);
      for (const [ox, oy] of dirs) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const ni = ny * this.cols + nx;
        if (this.blocked[ni] || (ox && oy && (this.blocked[y * this.cols + nx] || this.blocked[ny * this.cols + x]))) continue;
        const nd = d + (ox && oy ? Math.SQRT2 : 1);
        if (nd < this.distance[ni] - .001) { this.distance[ni] = nd; heap.push(ni, nd); }
      }
    }
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) {
      const i = y * this.cols + x, d = this.distance[i]; if (!Number.isFinite(d) || d === 0) continue;
      // Central distance gradients reduce grid-aligned walking and preserve broad door use.
      const value = (nx, ny) => nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows || !Number.isFinite(this.distance[ny * this.cols + nx]) ? d + 1 : this.distance[ny * this.cols + nx];
      let dx = value(x - 1, y) - value(x + 1, y), dy = value(x, y - 1) - value(x, y + 1);
      let len = Math.hypot(dx, dy);
      if (len < .01) { let best = d; for (const [ox, oy] of dirs) { const nx = x + ox, ny = y + oy; if (value(nx, ny) < best) { best = value(nx, ny); dx = ox; dy = oy; } } len = Math.hypot(dx, dy); }
      if (len) { this.dx[i] = dx / len; this.dy[i] = dy / len; }
    }
  }
  index(x, y) { return clamp(Math.floor(y / this.cell), 0, this.rows - 1) * this.cols + clamp(Math.floor(x / this.cell), 0, this.cols - 1); }
  direction(x, y) {
    const i = this.index(x, y);
    if (!Number.isFinite(this.distance[i])) {
      // A center can occupy a conservative raster margin; find a nearby reachable cell.
      let best = Infinity, target = -1;
      const cx = i % this.cols, cy = Math.floor(i / this.cols);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const ni = ny * this.cols + nx;
        if (this.distance[ni] < best) { best = this.distance[ni]; target = ni; }
      }
      if (target < 0) return { x: 0, y: 0, trapped: true };
      const dx = (target % this.cols + .5) * this.cell - x, dy = (Math.floor(target / this.cols) + .5) * this.cell - y, l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l, trapped: false };
    }
    return { x: this.dx[i], y: this.dy[i], trapped: false };
  }
}
export class Simulation {
  constructor(scenario = 'hall', settings = {}, layout = null) {
    this.scenario = scenario; this.venue = scenarios[scenario]; this.settings = { ...defaults, count: this.venue.count, panic: this.venue.panic, width: this.venue.exits[0].width, ...settings };
    this.w = this.venue.w; this.h = this.venue.h;
    this.walls = structuredClone(layout?.walls ?? this.venue.walls); this.exits = structuredClone(layout?.exits ?? this.venue.exits);
    this.time = 0; this.tick = 0; this.evacuated = 0; this.fallen = 0; this.dead = 0; this.trapped = 0; this.peakContact = 0; this.peakDensity = 0; this.exposure = 0;
    this.history = []; this.exitTimes = []; this.exitCounts = this.exits.map(() => 0); this.agents = []; this.hash = new Map(); this.bucketSize = 1.2;
    this.rebuild(); this.populate(); this.measure();
  }
  rebuild() { this.solids = [...boundaryWalls(this.w, this.h, this.exits), ...this.walls]; this.field = new FlowField(this.w, this.h, this.solids, this.exits); }
  populate() {
    const rng = random(this.settings.seed), cells = [], step = .57;
    for (let y = .7; y < this.h - .6; y += step) for (let x = .7; x < this.w - 2; x += step) {
      const r = this.venue.excluded;
      if (r && x > r.x - .4 && x < r.x + r.w + .4 && y > r.y - .4 && y < r.y + r.h + .4) continue;
      if (this.solids.some(s => distanceToWall(x, y, s) < .38)) continue;
      // The concourse starts upstream; arbitrary user enclosures still contain people.
      if (this.scenario === 'concourse' && x > 40) continue;
      cells.push({ x, y });
    }
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const count = Math.min(this.settings.count, cells.length);
    for (let i = 0; i < count; i++) {
      const p = cells[i]; this.agents.push({ id: i, x: p.x + (rng() - .5) * .10, y: p.y + (rng() - .5) * .10, vx: 0, vy: 0, ax: 0, ay: 0, radius: .215 + rng() * .035, factor: .7 + rng() * .6, start: this.settings.release ? i / this.settings.release : rng() * 2, state: 'moving', contact: 0, rawContact: 0, dose: 0, density: 0, trapped: false, hue: rng() });
    }
    this.initialCount = count;
  }
  buildHash() {
    this.hash.clear();
    for (const a of this.agents) { if (a.state === 'exited') continue; const key = Math.floor(a.x / this.bucketSize) + Math.floor(a.y / this.bucketSize) * 10000; let list = this.hash.get(key); if (!list) { list = []; this.hash.set(key, list); } list.push(a); }
  }
  neighbors(a, callback) {
    const x = Math.floor(a.x / this.bucketSize), y = Math.floor(a.y / this.bucketSize);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const list = this.hash.get(x + ox + (y + oy) * 10000); if (list) for (const b of list) callback(b); }
  }
  step() {
    const dt = DT;
    this.tick++; this.time = this.tick * DT;
    const urgency = this.settings.panic / 100, friction = this.settings.friction / 100;
    this.buildHash();
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      a.rawContact = 0; a.ax = 0; a.ay = 0;
      if (a.state !== 'moving') continue;
      const direction = this.field.direction(a.x, a.y); a.trapped = direction.trapped;
      const variation = 1 + (a.factor - 1) * this.settings.variation / 35;
      const desired = this.time >= a.start ? (.95 + 3.5 * urgency * urgency) * variation : 0;
      a.ax = (direction.x * desired - a.vx) / .5;
      a.ay = (direction.y * desired - a.vy) / .5;
    }
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      this.neighbors(a, b => {
        if (b.id <= a.id) return;
        let dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d > 1.1) return;
        if (d < .0001) { dx = .001; dy = 0; d = .001; }
        const nx = dx / d, ny = dy / d, overlap = a.radius + b.radius - d;
        const repulsion = 2.6 * Math.exp(clamp(overlap / .12, -12, 3)) * (1 - .5 * urgency);
        const contact = Math.max(0, overlap) * 900;
        // Tangential body friction increases with compression, allowing transient clogs.
        const tangential = clamp(((b.vx - a.vx) * -ny + (b.vy - a.vy) * nx) * Math.max(0, overlap) * 700 * friction, -35, 35);
        const fx = nx * (repulsion + contact) - ny * tangential, fy = ny * (repulsion + contact) + nx * tangential;
        a.ax += fx; a.ay += fy; b.ax -= fx; b.ay -= fy;
        a.rawContact += contact; b.rawContact += contact;
      });
      for (const wall of this.solids) {
        const p = closest(a.x, a.y, wall), dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy);
        if (d > .8) continue;
        const nx = dx / (d || 1), ny = dy / (d || 1), overlap = a.radius + .08 - d;
        const contact = Math.max(0, overlap) * 420;
        const force = 4 * Math.exp(clamp(overlap / .1, -10, 3)) + contact;
        a.ax += nx * force; a.ay += ny * force; a.rawContact += contact;
        const tangential = (a.vx * -ny + a.vy * nx) * Math.max(0, overlap) * 160 * friction;
        a.ax += ny * tangential; a.ay -= nx * tangential;
      }
    }
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      // Dimensionless contact index. It is NOT force in newtons or pressure in pascals.
      a.contact += (clamp(a.rawContact / 120, 0, 1) - a.contact) * .12;
      if (this.settings.casualties) {
        a.dose = Math.max(0, a.dose + (a.contact > .62 ? (a.contact - .62) * 4 : -.25) * dt);
        if (a.state === 'moving' && a.dose > 9) { a.state = 'fallen'; a.vx = 0; a.vy = 0; this.fallen++; }
        if (a.state === 'fallen' && a.dose > 22) { a.state = 'dead'; this.dead++; this.fallen--; }
      }
      if (a.state !== 'moving') continue;
      const oldX = a.x, oldY = a.y;
      a.vx += clamp(a.ax, -100, 100) * dt; a.vy += clamp(a.ay, -100, 100) * dt;
      const speed = Math.hypot(a.vx, a.vy), max = 5.5;
      if (speed > max) { a.vx *= max / speed; a.vy *= max / speed; }
      a.x += a.vx * dt; a.y += a.vy * dt;
      // Hard geometric floor prevents tunneling through even very thin drawn barriers.
      for (const wall of this.solids) {
        const p = closest(a.x, a.y, wall); let dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy);
        const min = a.radius * .7 + .06;
        if (d < min) {
          if (d < .001) { const old = closest(oldX, oldY, wall); dx = oldX - old.x; dy = oldY - old.y; d = Math.hypot(dx, dy) || 1; }
          const nx = dx / d, ny = dy / d; a.x = p.x + nx * min; a.y = p.y + ny * min;
          const into = a.vx * nx + a.vy * ny; if (into < 0) { a.vx -= into * nx; a.vy -= into * ny; }
        }
      }
      if (a.x < 0 || a.x > this.w || a.y < 0 || a.y > this.h) {
        const index = this.exits.findIndex(e => { const horizontal = e.side === 'top' || e.side === 'bottom'; return (e.side === 'left' ? a.x < 0 : e.side === 'right' ? a.x > this.w : e.side === 'top' ? a.y < 0 : a.y > this.h) && Math.abs((horizontal ? a.x : a.y) - e.at) < e.width / 2; });
        if (index >= 0) { a.state = 'exited'; this.evacuated++; this.exitCounts[index]++; this.exitTimes.push(this.time); }
        else { a.x = clamp(a.x, .25, this.w - .25); a.y = clamp(a.y, .25, this.h - .25); a.vx = 0; a.vy = 0; }
      }
    }
    if (this.tick % 10 === 0) this.measure();
    if (this.tick % 40 === 0) this.history.push({ time: this.time, evacuated: this.evacuated, flow: this.flow, contact: this.maxContact, density: this.maxDensity, fallen: this.fallen, dead: this.dead });
  }
  measure() {
    this.buildHash(); this.maxContact = 0; this.maxDensity = 0; this.trapped = 0; this.atRisk = 0;
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      let neighbors = 0;
      this.neighbors(a, b => { if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= 1) neighbors++; });
      a.density = neighbors / Math.PI;
      this.maxDensity = Math.max(this.maxDensity, a.density); this.maxContact = Math.max(this.maxContact, a.contact);
      if (a.contact > .62) { this.atRisk++; this.exposure += .25; }
      if (a.state === 'moving' && this.field.direction(a.x, a.y).trapped) this.trapped++;
    }
    this.peakContact = Math.max(this.peakContact, this.maxContact); this.peakDensity = Math.max(this.peakDensity, this.maxDensity);
    let recent = 0; for (let i = this.exitTimes.length - 1; i >= 0 && this.exitTimes[i] > this.time - 10; i--) recent++;
    this.flow = recent / Math.max(.25, Math.min(this.time, 10));
  }
  get remaining() { return this.initialCount - this.evacuated - this.dead; }
  get complete() { return this.agents.every(a => a.state === 'exited' || a.state === 'dead'); }
  snapshot() { return { scenario: this.scenario, settings: { ...this.settings }, walls: structuredClone(this.walls), exits: structuredClone(this.exits), time: this.time, total: this.initialCount, evacuated: this.evacuated, fallen: this.fallen, dead: this.dead, trapped: this.trapped, peakContact: this.peakContact, peakDensity: this.peakDensity, exposure: this.exposure, history: this.history.map(v => ({ ...v })) }; }
}
