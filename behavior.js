import { isMobile } from './health.js';
import { visibleSegment } from './navigation.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const angles = [0, -.25, .25, -.5, .5, -.8, .8, -1.1, 1.1];

// User-selected emergency regime, not an empirical threshold for human behavior.
// Courtesy still varies between people; even courteous agents can shove here.
export function emergencyDrive(sim, a) {
  const panic = sim.settings.panic;
  return panic < 90 || a.escaping ? 0 : (.2 + .8 * clamp((panic - 90) / 10, 0, 1)) * (1 - .35 * a.courtesy);
}

// Positive time until two moving disks meet; Infinity for diverging trajectories.
// Karamouzas et al. (2014), supplement S1. We use TTC in a sampled-velocity
// heuristic, not their force-gradient model. All tuning is documented in RESEARCH.md.
export function collisionTime(px, py, vx, vy, radius) {
  const c = px * px + py * py - radius * radius;
  if (c <= 0) return px * vx + py * vy > 0 ? 0 : Infinity;
  const speed2 = vx * vx + vy * vy, approach = px * vx + py * vy;
  if (speed2 < 1e-8 || approach <= 0) return Infinity;
  const disc = approach * approach - speed2 * c;
  return disc > 0 ? (approach - Math.sqrt(disc)) / speed2 : Infinity;
}

export function initializeBehavior(sim, rng) {
  for (const a of sim.agents) {
    Object.assign(a, {
      courtesy: clamp(sim.settings.cooperation / 100 + (rng() - .5) * .5, 0, 1),
      headway: .75 + rng() * .4, response: .4 + rng() * .2,
      decisionAt: 0, intent: null, turn: 0, yielding: false,
      group: -1, companionSince: -1, accompanying: false,
      exitChoice: -1, exitReview: 0, exitCommitted: 0,
      exitBias: sim.exits.map(() => rng() * 3), exitMemory: {}, routeChanges: 0
    });
    if (sim.settings.release === -1) {
      // A bounded right-skewed response delay, not a fitted alarm-response model.
      a.start = Math.min(40, .5 - Math.log(Math.max(.0001, rng())) * (3 + 9 * (1 - sim.settings.panic / 100)));
    }
  }
  sim.groups = [];
  sim.buildHash();
  const target = Math.floor(sim.agents.length * sim.settings.groups / 100);
  let assigned = 0;
  for (const a of sim.agents) {
    if (assigned >= target || a.group >= 0) continue;
    const nearby = [];
    sim.neighbors(a, b => {
      if (b !== a && b.group < 0 && Math.hypot(a.x - b.x, a.y - b.y) < 2.2 && visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .08)) nearby.push(b);
    }, 2.2);
    nearby.sort((b, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(a.x - c.x, a.y - c.y));
    const members = [a, ...nearby.slice(0, rng() < .7 ? 1 : 2)];
    if (members.length < 2) continue;
    const group = sim.groups.length;
    for (const b of members) { b.group = group; b.exitBias = [...a.exitBias]; }
    sim.groups.push(members); assigned += members.length;
  }
}

export function companionPreference(sim, a, direction) {
  a.accompanying = false;
  if (a.group < 0 || a.escaping || a.arrow >= 0 || a.contact > .2 || a.density > 3 || a.waiting) return { ...direction, pace: 1 };
  let x = 0, y = 0, count = 0, lagging = false;
  for (const b of sim.groups[a.group] || []) {
    const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
    if (b === a || !isMobile(b) || sim.time < b.start || b.escaping || distance > 4 || distance < .7 || !visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .08)) continue;
    x += dx / distance; y += dy / distance; count++;
    lagging ||= distance > 1.5 && dx * direction.x + dy * direction.y < -.5;
  }
  if (!count) { a.companionSince = -1; return { ...direction, pace: 1 }; }
  if (lagging && a.companionSince < 0) a.companionSince = sim.time;
  if (!lagging) a.companionSince = -1;
  // Never stop forever waiting for a separated friend, or walk backwards into a jam.
  const strength = .22 * (1 - sim.settings.panic / 200);
  let dx = direction.x + strength * x / count, dy = direction.y + strength * y / count;
  const norm = Math.hypot(dx, dy) || 1;
  a.accompanying = true;
  return { x: dx / norm, y: dy / norm, pace: lagging && sim.time - a.companionSince < 8 ? .8 : 1 };
}

export function preferredSpeed(sim, a) {
  const urgency = sim.settings.panic / 100;
  const variation = clamp(1 + (a.factor - 1) * sim.settings.variation / 35, .45, 1.6);
  return (1.3 + 2.2 * urgency * urgency) * variation * (a.state === 'injured' ? .55 : 1);
}

// Cognitive local planning: compare candidate headings, anticipate moving bodies,
// and leave a speed-dependent gap. Physical contact remains a separate force layer.
export function planMotion(sim, a, route) {
  if (route.trapped || (!route.x && !route.y)) return { x: 0, y: 0, speed: 0 };
  const direction = companionPreference(sim, a, route);
  const urgency = sim.settings.panic / 100, speed = preferredSpeed(sim, a) * direction.pace;
  const emergency = emergencyDrive(sim, a);
  const horizon = (2.4 - .7 * urgency) * (1 - .45 * emergency);
  const reach = Math.min(6, Math.max(3, speed * horizon));
  const neighbors = [];
  sim.neighbors(a, b => {
    if (a === b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    if (dx * dx + dy * dy > reach * reach || dx * direction.x + dy * direction.y < -.6) return;
    if (!visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .06)) return;
    neighbors.push({ b, distance2: dx * dx + dy * dy });
  }, reach);
  // Bounded local attention keeps large venues interactive. Closest bodies occlude
  // more distant interactions in dense queues; this is an approximation, not a law.
  if (neighbors.length > 24) { neighbors.sort((x, y) => x.distance2 - y.distance2); neighbors.length = 24; }
  const headway = a.headway * (1 - .35 * urgency) * (.75 + .35 * a.courtesy) * (1 - .65 * emergency);
  const push = 1.2 * urgency * urgency * (1 - a.courtesy) + 3 * emergency;
  const padding = (.035 + .09 * a.courtesy * (1 - .5 * urgency) + .12 * a.caution * (1 - .8 * urgency)) * (1 - .85 * emergency);
  let best = null, bestScore = Infinity;
  for (const angle of angles) {
    const co = Math.cos(angle), si = Math.sin(angle);
    const dx = direction.x * co - direction.y * si, dy = direction.x * si + direction.y * co;
    const look = Math.min(1.1, Math.max(.4, speed * .5));
    if (!sim.field.clear(a.x, a.y, a.x + dx * look, a.y + dy * look)) continue;
    let allowed = speed, collision = Infinity;
    for (const { b } of neighbors) {
      const px = b.x - a.x, py = b.y - a.y;
      const moving = isMobile(b), bvx = moving ? b.vx : 0, bvy = moving ? b.vy : 0;
      const radius = a.radius + b.radius + padding;
      collision = Math.min(collision, collisionTime(px, py, dx * speed - bvx, dy * speed - bvy, radius));
      const along = px * dx + py * dy, across = Math.abs(px * dy - py * dx);
      if (along <= 0 || across >= radius) continue;
      const gap = Math.max(0, along - Math.sqrt(radius * radius - across * across));
      const leaderSpeed = Math.max(0, bvx * dx + bvy * dy);
      // Headway for a moving queue, plus stopping distance for a stationary body.
      allowed = Math.min(allowed, gap / headway + Math.min(leaderSpeed * .2, gap / a.response) + (moving ? push : 0));
    }
    // Prefer continuing a chosen sidestep over oscillating left and right.
    const score = (1 - Math.cos(angle)) * 1.4 + Math.abs(angle - a.turn) * .12
      + (speed - Math.min(speed, allowed)) / speed
      + (collision < horizon ? .9 * (1 - .8 * emergency) * (1 - collision / horizon) : 0)
      + (angle < 0 ? .004 : 0);
    if (score < bestScore) { bestScore = score; best = { x: dx, y: dy, speed: Math.max(0, allowed), angle }; }
  }
  // At a tight corner the graph waypoint is safer than an arbitrary sampled turn.
  if (!best) best = { x: route.x, y: route.y, speed: Math.min(speed, .35), angle: 0 };
  // Extra drive only near a standing person ahead. Existing equal/opposite body
  // forces transmit the shove; nobody is teleported or assigned fake pressure.
  best.shove = emergency && best.speed > .1 && neighbors.some(({ b, distance2 }) => isMobile(b) && distance2 < .85 ** 2
    && (b.x - a.x) * best.x + (b.y - a.y) * best.y > 0) ? emergency : 0;
  a.turn = best.angle; a.yielding = best.speed < speed * .65;
  return best;
}

export function exitPosition(sim, exit, inset = .6) {
  return { x: exit.side === 'left' ? inset : exit.side === 'right' ? sim.w - inset : exit.at,
    y: exit.side === 'top' ? inset : exit.side === 'bottom' ? sim.h - inset : exit.at };
}

// Exit utility has memory and switching cost. Observations are local and occluded;
// the floor plan itself is still assumed known, explicitly documented in Info.
export function selectExit(sim, a) {
  if (sim.time < a.exitReview && a.exitChoice >= 0) return;
  a.exitReview = sim.time + 2 + a.response * 2;
  const options = [], speed = preferredSpeed(sim, a), urgency = sim.settings.panic / 100;
  for (let i = 0; i < sim.exits.length; i++) {
    const field = sim.exitFields[i], cell = field.nearest(a.x, a.y);
    if (cell < 0) continue;
    const e = sim.exits[i], p = exitPosition(sim, e);
    if (Math.hypot(a.x - p.x, a.y - p.y) <= 14 && visibleSegment(a.x, a.y, p.x, p.y, sim.solids, .06)) {
      let count = 0, sumSpeed = 0;
      for (const b of sim.agents) {
        if (b.state === 'exited' || Math.hypot(b.x - p.x, b.y - p.y) > 4 || !visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .06)) continue;
        count++; sumSpeed += Math.hypot(b.vx, b.vy);
      }
      a.exitMemory[i] = { at: sim.time, delay: count / Math.max(.5, e.width * (1 + Math.min(1, sumSpeed / Math.max(1, count)))) };
    }
    const memory = a.exitMemory[i], remembered = memory ? memory.delay * Math.exp(-(sim.time - memory.at) / 15) : 0;
    const cost = field.distance[cell] * field.cell / speed + remembered * (1 - .5 * urgency) + (a.exitBias[i] || 0);
    options.push({ index: i, cost });
  }
  options.sort((x, y) => x.cost - y.cost);
  const best = options[0], current = options.find(o => o.index === a.exitChoice);
  if (!best) { a.exitChoice = -1; return; }
  const switchCost = 2 + 5 * urgency;
  if (!current || (sim.time >= a.exitCommitted && best.cost + switchCost < current.cost)) {
    if (a.exitChoice >= 0 && a.exitChoice !== best.index) a.routeChanges++;
    a.exitChoice = best.index; a.exitCommitted = sim.time + 5 + 7 * urgency; a.waypoint = null;
  }
}
