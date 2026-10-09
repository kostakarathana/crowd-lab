import { initializeBehavior, planMotion, selectExit } from './behavior.js';
import { updateDistress, reliefDirection, cautiousPanic, effectiveCaution, retreatTendency } from './escape.js';
import { updateSecurity } from './security.js';
import { canSeeSign, sightWalls, visibilityPolygon } from './visibility.js';
import { FlowField, chooseArrow, visibleSegment } from './navigation.js';
import { isMobile, updateHealth } from './health.js';
export { FlowField } from './navigation.js';
// A qualitative social-force-inspired model, not a calibrated life-safety solver.
export const DT = 1 / 40;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const defaults = { count: 1000, panic: 35, width: 2.6, release: 0, friction: 55, variation: 25, casualties: true, seed: 42, cooperation: 75, groups: 40 };
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
export class Simulation {
  constructor(scenario = 'hall', settings = {}, layout = null) {
    this.scenario = scenario; this.venue = scenarios[scenario]; this.settings = { ...defaults, count: this.venue.count, panic: this.venue.panic, width: this.venue.exits[0].width, ...settings };
    this.w = this.venue.w; this.h = this.venue.h;
    this.walls = structuredClone(layout?.walls ?? this.venue.walls); this.exits = structuredClone(layout?.exits ?? this.venue.exits); this.arrows = structuredClone(layout?.arrows ?? []); this.guards = (layout?.guards ?? []).map(({ x, y }) => ({ x, y })); this.held = 0;
    this.time = 0; this.tick = 0; this.evacuated = 0; this.fallen = 0; this.injured = 0; this.dead = 0; this.recoveries = 0; this.trapped = 0; this.peakContact = 0; this.peakDensity = 0; this.exposure = 0;
    this.history = []; this.exitTimes = []; this.exitCounts = this.exits.map(() => 0); this.agents = []; this.hash = new Map(); this.bucketSize = 1.2;
    this.navigationRng = random(this.settings.seed ^ 0x1234abcd); this.healthRng = random(this.settings.seed ^ 0x76543210); this.routeVersion = 0; this.bodyCount = 0; this.routingDirty = false;
    this.rebuild(); this.populate(); initializeBehavior(this, random(this.settings.seed ^ 0x45f839ac)); this.updateRouting(); this.measure();
  }
  rebuild() { this.solids = [...boundaryWalls(this.w, this.h, this.exits), ...this.walls]; this.field = new FlowField(this.w, this.h, this.solids, this.exits); this.geometry = this.field.geometry; this.arrowFields = new Map(); this.signWalls = sightWalls(this.solids); this.signRanges = this.arrows.map(s => visibilityPolygon(s, this.signWalls)); }
  updateRouting() {
    this.densityCols = Math.ceil(this.w / 1.5); this.densityRows = Math.ceil(this.h / 1.5);
    this.occupancy = new Float32Array(this.densityCols * this.densityRows);
    const obstacles = [];
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      const x = clamp(Math.floor(a.x / 1.5), 0, this.densityCols - 1), y = clamp(Math.floor(a.y / 1.5), 0, this.densityRows - 1);
      this.occupancy[y * this.densityCols + x]++;
      if (!isMobile(a)) obstacles.push({ x: a.x, y: a.y, radius: a.radius });
    }
    const costs = new Float32Array(this.field.cols * this.field.rows);
    const avoidance = .12 + 3.5 * (1 - this.settings.panic / 100) ** 2;
    for (let i = 0; i < costs.length; i++) { const p = this.field.center(i); costs[i] = 1 + Math.min(12, this.routeDensity(p.x, p.y) * avoidance); }
    this.field = new FlowField(this.w, this.h, this.solids, this.exits, { geometry: this.geometry, costs, obstacles });
    if (this.agents.some(a => isMobile(a) && effectiveCaution(this.settings.panic, a.caution) > .2)) {
      const cautiousCosts = costs.map((cost, i) => { const p = this.field.center(i); return cost + Math.min(18, this.routeDensity(p.x, p.y) * 5 * retreatTendency(this.settings.panic)); });
      this.cautiousField = new FlowField(this.w, this.h, this.solids, this.exits, { geometry: this.geometry, costs: cautiousCosts, obstacles });
    } else this.cautiousField = null;
    if (!this.exitFields || obstacles.length !== this.bodyCount || this.routingDirty) {
      this.arrowFields.clear();
      this.exitFields = this.exits.map(exit => new FlowField(this.w, this.h, this.solids, [exit], { geometry: this.geometry, obstacles }));
      for (const a of this.agents) a.exitReview = 0;
    }
    this.bodyCount = obstacles.length; this.routingDirty = false; this.routeVersion++;
  }
  routeDensity(x, y) {
    const cx = Math.floor(x / 1.5), cy = Math.floor(y / 1.5); let total = 0, cells = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const nx = cx + ox, ny = cy + oy; if (nx >= 0 && ny >= 0 && nx < this.densityCols && ny < this.densityRows) { total += this.occupancy[ny * this.densityCols + nx]; cells++; } }
    return total / Math.max(2.25, cells * 2.25);
  }
  arrowField(index) {
    if (!this.arrowFields.has(index)) {
      const sign = this.arrows[index];
      const goal = this.field.nearest(sign.bx, sign.by);
      this.arrowFields.set(index, goal < 0 ? null : new FlowField(this.w, this.h, this.solids, [], { geometry: this.geometry, obstacles: this.field.obstacles, goals: [this.field.center(goal)] }));
    }
    return this.arrowFields.get(index);
  }
  readArrows(a) {
    if (a.arrow >= 0 || this.time < a.nextSignRead || a.stalled > 2) return;
    a.nextSignRead = this.time + .7;
    const candidates = [];
    for (let i = 0; i < this.arrows.length; i++) {
      const s = this.arrows[i];
      if (a.signVisited[i] || (a.signMemory[i] || 0) > this.time) continue;
      if (!canSeeSign(a.x, a.y, s, this.signWalls)) continue;
      const field = this.arrowField(i);
      if (!field || field.nearest(a.x, a.y) < 0) continue;
      // Sample the indicated corridor, not just the shared location of two signs.
      const density = [.45, .75, 1].reduce((sum, t) => sum + this.routeDensity(s.ax + (s.bx - s.ax) * t, s.ay + (s.by - s.ay) * t), 0) / 3;
      candidates.push({ index: i, density });
    }
    if (!candidates.length) return;
    const choice = chooseArrow(candidates, this.navigationRng, cautiousPanic(this.settings.panic, a.caution));
    for (const c of candidates) { a.signMemory[c.index] = this.time + (choice ? 18 : 2 + this.navigationRng() * 2); if (choice) a.signVisited[c.index] = true; }
    if (choice) { a.arrow = choice.index; a.arrowUntil = this.time + 18; a.waypoint = null; }
    else a.nextSignRead = this.time + 2 + this.navigationRng() * 2;
  }
  navigate(a) {
    const relief = reliefDirection(this, a);
    if (relief) return relief;
    if (!a.escaping && this.time < a.start) return { x: 0, y: 0, trapped: false };
    // Progress is measured over time, so a jam isn't mistaken for a completed route.
    if (this.time >= a.progressAt) {
      const moved = Math.hypot(a.x - a.progressX, a.y - a.progressY);
      a.stalled = moved < .18 && !a.securityHeld && this.time >= a.waitUntil ? a.stalled + 1 : 0;
      a.progressX = a.x; a.progressY = a.y; a.progressAt = this.time + 1;
      if (a.stalled >= 2) { a.waypoint = null; a.arrow = -1; a.nextSignRead = this.time + 6; }
    }
    if (!a.escaping) this.readArrows(a);
    if (a.arrow < 0) selectExit(this, a);
    if (a.arrow >= 0) {
      const sign = this.arrows[a.arrow];
      if (this.time >= a.arrowUntil || Math.hypot(a.x - sign.bx, a.y - sign.by) < .8) { a.signMemory[a.arrow] = this.time + 20; a.arrow = -1; a.waypoint = null; }
    }
    if (!a.waypoint || this.time >= a.repathAt || a.routeVersion !== this.routeVersion || Math.hypot(a.x - a.waypoint.x, a.y - a.waypoint.y) < .35) {
      const field = a.arrow >= 0 ? this.arrowField(a.arrow) : this.exitFields[a.exitChoice] || this.field;
      a.waypoint = field?.waypoint(a.x, a.y);
      if (!a.waypoint && a.arrow >= 0) { a.arrow = -1; a.waypoint = this.field.waypoint(a.x, a.y); }
      a.repathAt = this.time + .45 + a.hue * .2; a.routeVersion = this.routeVersion;
    }
    if (!a.waypoint) return { x: 0, y: 0, trapped: true };
    const dx = a.waypoint.x - a.x, dy = a.waypoint.y - a.y, length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, trapped: false };
  }
  shouldWait(a, direction) {
    if (this.settings.panic >= 90 && !a.escaping && this.time >= a.regroupUntil) { a.waitUntil = 0; return false; }
    const caution = effectiveCaution(this.settings.panic, a.caution);
    if (a.escaping) { a.waitUntil = 0; return false; }
    if (this.time < a.regroupUntil && a.contact < .2 && a.density < 2) return true;
    const urgency = cautiousPanic(this.settings.panic, a.caution) / 100;
    // Waiting is voluntary only in room to maneuver, not a freeze inside a crush.
    if (urgency >= .65 || a.contact > .2 || direction.trapped || this.time < a.start) { a.waitUntil = 0; return false; }
    if (this.time < a.waitUntil) return true;
    if (this.time < a.nextWaitCheck) return false;
    a.nextWaitCheck = this.time + 2 + a.hue * 2;
    const ahead = this.routeDensity(a.x + direction.x * 2.5, a.y + direction.y * 2.5), here = this.routeDensity(a.x, a.y);
    const willing = a.hue < Math.max(.8 * (1 - urgency) ** 2, caution * .9);
    if (willing && ahead > 2.1 - caution * .6 && ahead > here + .35 && here < 3 && Math.min(a.x, a.y, this.w - a.x, this.h - a.y) > 1) {
      a.waitUntil = this.time + 2 + 4 * (1 - urgency) * a.factor;
      a.nextWaitCheck = a.waitUntil + 2; return true;
    }
    return false;
  }
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
      const p = cells[i]; this.agents.push({ id: i, x: p.x + (rng() - .5) * .10, y: p.y + (rng() - .5) * .10, vx: 0, vy: 0, ax: 0, ay: 0, radius: .215 + rng() * .035, factor: .7 + rng() * .6, start: this.settings.release ? i / this.settings.release : rng() * 2, state: 'moving', down: false, safeTime: 0, contact: 0, rawContact: 0, dose: 0, density: 0, trapped: false, hue: rng() });
    }
    this.initialCount = count;
    for (const a of this.agents) Object.assign(a, { arrow: -1, arrowUntil: 0, nextSignRead: 0, signMemory: {}, signVisited: {}, waypoint: null, repathAt: 0, routeVersion: -1, progressAt: 1, progressX: a.x, progressY: a.y, stalled: 0, waitUntil: 0, nextWaitCheck: 0, waiting: false, securityHeld: false, securitySince: 0, securityCooldown: 0, contactBaseline: 0, distress: 0, caution: 0, lastCrush: 0, escaping: false, reliefTarget: null, reliefCheck: 0, reliefSafe: 0, regroupUntil: 0 });
  }
  buildHash() {
    this.hash.clear();
    for (const a of this.agents) { if (a.state === 'exited') continue; const key = Math.floor(a.x / this.bucketSize) + Math.floor(a.y / this.bucketSize) * 10000; let list = this.hash.get(key); if (!list) { list = []; this.hash.set(key, list); } list.push(a); }
  }
  neighbors(a, callback, radius = 1.2) {
    const x = Math.floor(a.x / this.bucketSize), y = Math.floor(a.y / this.bucketSize);
    const extent = Math.ceil(radius / this.bucketSize);
    for (let oy = -extent; oy <= extent; oy++) for (let ox = -extent; ox <= extent; ox++) { const list = this.hash.get(x + ox + (y + oy) * 10000); if (list) for (const b of list) callback(b); }
  }
  canStand(a) {
    if (a.contact >= .25 || a.density >= 4) return false;
    if (this.solids.some(s => distanceToWall(a.x, a.y, s) < a.radius + .06)) return false;
    let space = true;
    this.neighbors(a, b => { if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < (a.radius + b.radius) * .95) space = false; });
    return space;
  }
  advanceHealth(a, dt) {
    const previous = a.state, mobile = isMobile(a);
    const recovered = updateHealth(a, dt, this.healthRng, (a.state === 'fallen' || (a.state === 'injured' && a.down)) && this.canStand(a));
    for (const state of ['fallen', 'injured', 'dead']) this[state] += Number(a.state === state) - Number(previous === state);
    if (mobile !== isMobile(a)) this.routingDirty = true;
    if (recovered) {
      this.recoveries++; a.waypoint = null; a.arrow = -1; a.waiting = false; a.waitUntil = 0; a.stalled = 0;
      a.progressX = a.x; a.progressY = a.y; a.progressAt = this.time + 1;
    }
  }
  step() {
    const dt = DT;
    this.tick++; this.time = this.tick * DT;
    const urgency = this.settings.panic / 100, friction = this.settings.friction / 100;
    this.buildHash();
    if ((this.routingDirty && this.tick % 10 === 0) || this.tick % 80 === 0) this.updateRouting();
    if (this.guards.length && (this.tick === 1 || this.tick % 10 === 0)) updateSecurity(this);
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      a.rawContact = 0; a.ax = 0; a.ay = 0;
      if (!isMobile(a)) continue;
      const direction = this.navigate(a); a.trapped = direction.trapped;
      if (a.contact > .35 || a.escaping) a.securityHeld = false;
      a.waiting = a.securityHeld || this.shouldWait(a, direction);
      const active = (this.time >= a.start || a.escaping) && !a.waiting;
      if (active && (this.time >= a.decisionAt || !a.intent)) {
        a.intent = planMotion(this, a, direction);
        a.decisionAt = this.time + .15 + (a.id % 3) * DT;
      }
      if (!active) { a.intent = null; a.yielding = false; a.accompanying = false; }
      const intent = active && a.intent ? a.intent : { x: 0, y: 0, speed: 0 };
      a.ax = (intent.x * intent.speed - a.vx) / a.response;
      a.ay = (intent.y * intent.speed - a.vy) / a.response;
      const forwardSpeed = a.vx * intent.x + a.vy * intent.y;
      const shove = (intent.shove || 0) * 18 * Math.max(0, 1 - Math.max(0, forwardSpeed) / Math.max(.1, intent.speed));
      a.ax += intent.x * shove; a.ay += intent.y * shove;
    }
    for (const a of this.agents) {
      if (a.state === 'exited') continue;
      this.neighbors(a, b => {
        if (b.id <= a.id) return;
        let dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d > 1.1 || !visibleSegment(a.x, a.y, b.x, b.y, this.walls, .02)) return;
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
      if (this.settings.casualties) this.advanceHealth(a, dt);
      updateDistress(a, dt, this.time, this.settings.panic);
      if (!isMobile(a)) continue;
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
        if (index >= 0) { if (a.state === 'injured') this.injured--; a.state = 'exited'; a.escaping = false; a.securityHeld = false; a.waiting = false; this.evacuated++; this.exitCounts[index]++; this.exitTimes.push(this.time); }
        else { a.x = clamp(a.x, .25, this.w - .25); a.y = clamp(a.y, .25, this.h - .25); a.vx = 0; a.vy = 0; }
      }
    }
    if (this.tick % 10 === 0) this.measure();
    if (this.tick % 40 === 0) this.history.push({ time: this.time, evacuated: this.evacuated, flow: this.flow, contact: this.maxContact, density: this.maxDensity, fallen: this.fallen, injured: this.injured, dead: this.dead, recoveries: this.recoveries, held: this.held });
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
      if (isMobile(a) && this.field.nearest(a.x, a.y) < 0) this.trapped++;
    }
    this.peakContact = Math.max(this.peakContact, this.maxContact); this.peakDensity = Math.max(this.peakDensity, this.maxDensity);
    let recent = 0; for (let i = this.exitTimes.length - 1; i >= 0 && this.exitTimes[i] > this.time - 10; i--) recent++;
    this.flow = recent / Math.max(.25, Math.min(this.time, 10));
  }
  get remaining() { return this.initialCount - this.evacuated - this.dead; }
  get complete() { return this.agents.every(a => a.state === 'exited' || a.state === 'dead'); }
  snapshot() { return { model: 'crowd-lab-2.1', scenario: this.scenario, settings: { ...this.settings }, walls: structuredClone(this.walls), exits: structuredClone(this.exits), arrows: structuredClone(this.arrows), guards: this.guards.map(({ x, y }) => ({ x, y })), held: this.held, time: this.time, total: this.initialCount, evacuated: this.evacuated, fallen: this.fallen, injured: this.injured, dead: this.dead, recoveries: this.recoveries, trapped: this.trapped, peakContact: this.peakContact, peakDensity: this.peakDensity, exposure: this.exposure, history: this.history.map(v => ({ ...v })) }; }
}
