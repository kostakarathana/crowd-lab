import { isMobile } from './health.js';
import { canSeeSign } from './visibility.js';
import { agentUrgency } from './social.js';

export const guardCapacity = panic => Math.max(2, Math.floor(12 / (1 + 5 * (panic / 100) ** 2)));

// Fixed control posts meter incoming pedestrians using local, visible conditions.
// Capacities and thresholds are game rules, not staffing recommendations.
export function updateSecurity(sim) {
  const previouslyHeld = new Set(sim.agents.filter(a => a.securityHeld).map(a => a.id));
  for (const a of sim.agents) a.securityHeld = false;
  const candidatesByGuard = new Map();
  for (const guard of sim.guards) {
    const target = sim.field.waypoint(guard.x, guard.y);
    guard.capacity = guardCapacity(sim.settings.panic); guard.held = 0; guard.demand = 0;
    if (!target) { guard.mode = 'no route'; guard.holding = false; continue; }
    const length = Math.hypot(target.x - guard.x, target.y - guard.y) || 1;
    guard.dx = (target.x - guard.x) / length; guard.dy = (target.y - guard.y) / length;
    const sign = { ax: guard.x, ay: guard.y }, visible = [];
    let aheadCount = 0, aheadContact = 0, behindCount = 0, behindContact = 0;
    for (const a of sim.agents) {
      if (a.state === 'exited' || !canSeeSign(a.x, a.y, sign, sim.signWalls)) continue;
      const x = a.x - guard.x, y = a.y - guard.y, along = x * guard.dx + y * guard.dy, across = Math.abs(x * guard.dy - y * guard.dx);
      if (across > 2.5) continue;
      if (along > .5) { aheadCount++; aheadContact += a.contact; }
      else { behindCount++; behindContact += a.contact; }
      if (along <= .5 && along >= -4 && isMobile(a) && sim.time >= a.start) visible.push({ a, distance: Math.hypot(x, y) });
    }
    // Same 10 m² observation windows for both sides; bodies count as congestion.
    guard.aheadDensity = aheadCount / 10;
    const capacity = guardCapacity(Math.max(sim.settings.panic, ...visible.map(({ a }) => agentUrgency(sim, a))));
    guard.capacity = capacity;
    const downstreamContact = aheadContact / Math.max(1, aheadCount), upstreamContact = behindContact / Math.max(1, behindCount);
    const relief = behindCount / 10 > 3.2 || upstreamContact > .45;
    if (relief) guard.holding = false;
    else if (guard.aheadDensity > 1.8 || downstreamContact > .35) guard.holding = true;
    else if (guard.aheadDensity < 1.2 && downstreamContact < .2) guard.holding = false;
    if (!guard.holding) { guard.mode = relief ? 'relieving queue' : 'open'; continue; }
    const candidates = visible.filter(({ a }) => {
      if (a.escaping || a.aidTarget != null || a.contact > .35 || sim.time < (a.securityCooldown || 0)) return false;
      if (previouslyHeld.has(a.id) && sim.time - a.securitySince >= 6) { a.securityCooldown = sim.time + 2; return false; }
      const route = a.waypoint || sim.field.waypoint(a.x, a.y);
      if (!route) return false;
      const dx = route.x - a.x, dy = route.y - a.y, length = Math.hypot(dx, dy) || 1;
      return (dx * guard.dx + dy * guard.dy) / length > .25;
    }).sort((a, b) => Number(previouslyHeld.has(b.a.id)) - Number(previouslyHeld.has(a.a.id)) || a.distance - b.distance || a.a.id - b.a.id);
    candidatesByGuard.set(guard, candidates);
    guard.demand = candidates.length;
    for (const { a } of candidates) {
      if (a.securityHeld) continue; // Nearby guards share the work, never count a person twice.
      if (guard.held >= capacity) break;
      a.securityHeld = true;
      if (!previouslyHeld.has(a.id)) a.securitySince = sim.time;
      guard.held++;
    }
    guard.mode = guard.held ? 'holding' : 'open';
  }
  // Compute overload after every guard has contributed its capacity.
  for (const guard of sim.guards) {
    if (guard.holding && guard.demand > guard.held) {
      const unheld = candidatesByGuard.get(guard)?.some(({ a }) => !a.securityHeld);
      if (unheld && guard.held >= guard.capacity) guard.mode = 'overwhelmed';
    }
  }
  sim.held = sim.agents.filter(a => a.securityHeld).length;
}
