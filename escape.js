import { isMobile } from './health.js';

// Illustrative responses to the model's contact index, not psychological calibration.
export const cautiousPanic = (panic, caution = 0) => panic * (1 - .85 * caution);
export function updateDistress(a, dt, time, panic) {
  if (a.state === 'dead' || a.state === 'exited') { a.escaping = false; return; }
  const rising = Math.max(0, a.contact - a.contactBaseline);
  a.contactBaseline += (a.contact - a.contactBaseline) * (1 - Math.exp(-dt / 2));
  if (a.contact > .4) {
    a.distress = Math.min(4, a.distress + ((a.contact - .4) * 2 + rising * 3) * dt);
    a.caution = Math.min(1, a.caution + (.12 + .25 * rising) * dt);
    a.lastCrush = time;
  } else {
    a.distress = Math.max(0, a.distress - .35 * dt);
    if (time - a.lastCrush > 20) a.caution = Math.max(0, a.caution - .008 * dt);
  }
  if (!isMobile(a)) { a.escaping = false; a.reliefTarget = null; a.reliefSafe = 0; return; }
  if (!a.escaping && a.contact > .4 && a.distress > .5 + .45 * a.hue + .3 * panic / 100) {
    a.escaping = true; a.caution = Math.max(a.caution, .6); a.reliefSafe = 0; a.reliefCheck = 0;
    a.reliefTarget = null; a.waypoint = null; a.arrow = -1; a.waitUntil = 0; a.securityHeld = false;
    a.nextSignRead = time + 8;
  }
  if (!a.escaping) return;
  a.reliefSafe = a.contact < .2 && a.density < 1.8 ? a.reliefSafe + dt : 0;
  if (a.reliefSafe >= 2) {
    a.escaping = false; a.distress = 0; a.reliefTarget = null; a.waypoint = null;
    a.regroupUntil = time + 2 + a.hue * 2; a.nextSignRead = a.regroupUntil + 3;
    a.progressAt = a.regroupUntil + 1; a.stalled = 0;
  }
}

export function reliefDirection(sim, a) {
  if (!a.escaping) return null;
  // Keep a short commitment, but stop immediately if a body blocks the route.
  if (a.reliefTarget && !sim.field.clear(a.x, a.y, a.reliefTarget.x, a.reliefTarget.y)) { a.reliefTarget = null; a.reliefCheck = 0; }
  if (sim.time >= a.reliefCheck || (a.reliefTarget && Math.hypot(a.x - a.reliefTarget.x, a.y - a.reliefTarget.y) < .4)) {
    a.reliefCheck = sim.time + .6 + a.hue * .3;
    const here = sim.routeDensity(a.x, a.y); let best = null, score = Infinity;
    // Search sidewards and backwards too. Visible, walkable segments cannot cross walls.
    for (const radius of [1.5, 3, 4.5]) for (let i = 0; i < 16; i++) {
      const angle = (i + a.hue) * Math.PI / 8, x = a.x + Math.cos(angle) * radius, y = a.y + Math.sin(angle) * radius;
      if (x < .4 || y < .4 || x > sim.w - .4 || y > sim.h - .4) continue;
      const density = sim.routeDensity(x, y);
      if (density > here - .2 || !sim.field.clear(a.x, a.y, x, y)) continue;
      const pathDensity = Math.max(...[.33, .67].map(t => sim.routeDensity(a.x + (x - a.x) * t, a.y + (y - a.y) * t)));
      if (pathDensity > here + .4) continue;
      const continuity = a.reliefTarget ? Math.min(2, Math.hypot(x - a.reliefTarget.x, y - a.reliefTarget.y)) * .08 : 0;
      const cost = density * 2 + pathDensity * .6 + radius * .045 + continuity;
      if (cost < score) { best = { x, y }; score = cost; }
    }
    a.reliefTarget = best;
  }
  if (!a.reliefTarget) return null; // No magic escape: fall back to an available exit route.
  const dx = a.reliefTarget.x - a.x, dy = a.reliefTarget.y - a.y, length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length, trapped: false };
}
