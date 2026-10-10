import { isMobile } from './health.js';
import { FlowField, visibleSegment } from './navigation.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const casualty = a => a.state === 'fallen' || a.state === 'injured' || a.state === 'dead';

// Independent, serializable random streams: another person's decisions cannot
// consume our draws. These are heterogeneous model traits, not measured IQs.
export function personalRandom(a) {
  a.thoughtSeed = (a.thoughtSeed + 0x6D2B79F5) >>> 0;
  let t = a.thoughtSeed;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

export function initializeCognition(sim, rng) {
  for (const a of sim.agents) {
    Object.assign(a, {
      thoughtSeed: Math.floor(rng() * 4294967296),
      attention: .55 + rng() * .45, sensitivity: .65 + rng() * .7,
      resilience: .65 + rng() * .8, patience: .6 + rng() * .8,
      adaptability: .55 + rng() * .9, socialTrust: .25 + rng() * .65,
      altruism: rng(), sidePreference: rng() * 2 - 1,
      noticeDelay: .18 + rng() * .9, perceptionInterval: .22 + rng() * .4,
      decisionInterval: .12 + rng() * .16, memorySpan: 8 + rng() * 12,
      vision: 5 + rng() * 3, heading: rng() * Math.PI * 2,
      perceiveAt: rng() * .65, lookAroundAt: 1 + rng() * 4,
      decisionAt: rng() * .25, aidReviewAt: rng() * .9,
      nextSignRead: rng() * .7, nextWaitCheck: rng() * 2,
      progressAt: .7 + rng() * .6, knowledgeVersion: 0,
      noticed: {}, pendingNotice: {}, visibleCasualties: [],
      seenCasualty: 0, socialAlarm: 0, alarm: 0, perceivedNeighbors: []
    });
  }
  sim.beliefFields = new Map();
}

export function canObserve(sim, a, b, around = false) {
  const dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy);
  if (distance > (a.vision ?? 7) || !visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .04)) return false;
  // Near-body awareness remains all-round. Otherwise vision is directional;
  // high arousal narrows attention, but periodic head turns still look around.
  const edge = -.45 + .65 * (a.arousal || 0);
  return around || distance < 1.2 || (dx * Math.cos(a.heading || 0) + dy * Math.sin(a.heading || 0)) / distance > edge;
}

function bodyOccludes(a, b, nearby) {
  const dx = b.x - a.x, dy = b.y - a.y, length2 = dx * dx + dy * dy;
  if (length2 < 1.2 ** 2) return false;
  return nearby.some(c => {
    if (c === b || !isMobile(c)) return false;
    const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / length2;
    return t > .05 && t < .9 && Math.hypot(c.x - a.x - dx * t, c.y - a.y - dy * t) < c.radius * .8;
  });
}

// Called each physics step, but only due individuals perceive. Alarm values are
// snapshotted first so a message cannot cascade across the room in one frame.
export function perceive(sim) {
  const signals = [];
  for (const a of sim.agents) signals[a.id] = { alarm: a.alarm || 0, at: a.perceivedAt ?? sim.time };
  for (const a of sim.agents) {
    if (a.state === 'dead' || a.state === 'exited' || sim.time < a.perceiveAt) continue;
    a.perceivedAt = sim.time;
    a.perceiveAt = sim.time + a.perceptionInterval * (.8 + personalRandom(a) * .4);
    if (Math.hypot(a.vx, a.vy) > .15) a.heading = Math.atan2(a.vy, a.vx);
    else if (a.intent && Math.hypot(a.intent.x, a.intent.y) > .1) a.heading = Math.atan2(a.intent.y, a.intent.x);
    const around = sim.time >= a.lookAroundAt;
    a.observedAround = around;
    if (around) a.lookAroundAt = sim.time + 2 + personalRandom(a) * 4;
    const nearby = [];
    sim.neighbors(a, b => {
      if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) <= a.vision) nearby.push(b);
    }, a.vision);
    nearby.sort((b, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(a.x - c.x, a.y - c.y));
    const attended = nearby.slice(0, Math.round(10 + 14 * a.attention));
    const visible = attended.filter(b => canObserve(sim, a, b, around) && !bodyOccludes(a, b, attended));
    a.perceivedNeighbors = nearby.slice(0, 64).filter(b => canObserve(sim, a, b, around))
      .map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, at: sim.time }));
    a.visibleCasualties = [];
    let changed = false;
    for (const b of visible) {
      if (!casualty(b)) {
        if (a.noticed[b.id]) { delete a.noticed[b.id]; changed = true; }
        delete a.pendingNotice[b.id]; continue;
      }
      a.pendingNotice[b.id] ??= sim.time + a.noticeDelay / a.attention;
      if (sim.time < a.pendingNotice[b.id]) continue;
      const old = a.noticed[b.id], down = !isMobile(b);
      if (!old || old.down !== down || Math.hypot(old.x - b.x, old.y - b.y) > .5) changed = true;
      a.noticed[b.id] = { id: b.id, x: b.x, y: b.y, radius: b.radius, down, state: b.state, at: sim.time };
      a.visibleCasualties.push(b.id);
    }
    for (const id of Object.keys(a.pendingNotice)) if (!visible.some(b => b.id === Number(id) && casualty(b))) delete a.pendingNotice[id];
    for (const [id, memory] of Object.entries(a.noticed)) {
      if (sim.time - memory.at > a.memorySpan) { delete a.noticed[id]; changed = true; }
    }
    const memories = Object.values(a.noticed).sort((b, c) => c.at - b.at);
    for (const old of memories.slice(8)) { delete a.noticed[old.id]; changed = true; }
    a.seenCasualty = Math.max(0, ...Object.values(a.noticed).map(m => Math.exp(-(sim.time - m.at) / (a.memorySpan * .45))));
    // Indistinct local calls carry concern, never the identity/location of an
    // unseen casualty. Every relay attenuates and ages; walls block this model.
    let heard = 0;
    for (const b of attended) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y), signal = signals[b.id];
      if (distance > 3 || !signal || !visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .04)) continue;
      heard = Math.max(heard, signal.alarm * Math.exp(-(sim.time - signal.at) / 2) * .5 * (1 - distance / 4));
    }
    a.socialAlarm = heard * a.socialTrust;
    const ownThreat = Math.max(clamp((a.contact - .25) / .5, 0, 1), casualty(a) ? 1 : 0);
    a.alarm = Math.max(ownThreat, a.seenCasualty * .7, heard);
    if (changed) { a.knowledgeVersion++; a.repathAt = Math.min(a.repathAt, sim.time + a.decisionInterval); }
  }
}

// Unknown space isn't assumed empty. The caller keeps its existing route or
// uses its current local density until it has a usable observation.
export function perceivedDensity(sim, a, x, y) {
  if (Math.hypot(x - a.x, y - a.y) > a.vision || sim.time - (a.perceivedAt ?? -Infinity) > 2
    || !canObserve(sim, a, { x, y }, a.observedAround)) return null;
  let count = Math.hypot(x - a.x, y - a.y) < 1.5 ? 1 : 0;
  for (const b of a.perceivedNeighbors) if (Math.hypot(x - b.x, y - b.y) < 1.5) count++;
  return count / (Math.PI * 1.5 ** 2);
}

// Shared geometry is known; temporary obstructions are private observations.
// Cache matching beliefs to avoid one full graph per person, with a work budget.
export function believedRoute(sim, a, exit = a.exitChoice, arrow = -1) {
  const base = arrow >= 0 ? sim.arrowField(arrow) : sim.exitFields[exit] || sim.designField;
  if (!base) return null;
  const obstacles = Object.values(a.noticed || {}).filter(m => m.down && sim.time - m.at <= a.memorySpan).sort((b, c) => b.id - c.id);
  if (!obstacles.length) return base;
  const key = `${exit}/${arrow}:` + obstacles.map(m => `${m.id},${m.x.toFixed(1)},${m.y.toFixed(1)}`).join(';');
  if (sim.beliefFields.has(key)) return sim.beliefFields.get(key);
  if (sim.beliefBuilds >= 2) return base;
  sim.beliefBuilds = (sim.beliefBuilds || 0) + 1;
  const sign = sim.arrows[arrow];
  const field = new FlowField(sim.w, sim.h, sim.solids, arrow >= 0 ? [] : exit >= 0 ? [sim.exits[exit]] : sim.exits,
    { geometry: sim.geometry, obstacles, ...(sign ? { goals: [{ x: sign.bx, y: sign.by }] } : {}) });
  if (sim.beliefFields.size >= 64) sim.beliefFields.delete(sim.beliefFields.keys().next().value);
  sim.beliefFields.set(key, field);
  return field;
}
