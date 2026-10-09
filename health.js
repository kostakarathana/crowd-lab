// Illustrative gameplay states; thresholds and probabilities are not medical estimates.
export const isMobile = a => a.state === 'moving' || (a.state === 'injured' && !a.down);

export function updateHealth(a, dt, rng, hasSpace) {
  if (a.state === 'dead' || a.state === 'exited') return false;
  const bad = a.contact > .62;
  a.dose = Math.max(0, a.dose + (bad ? (a.contact - .62) * 4 * (a.susceptibility ?? 1) : -.25) * dt);
  if (a.state === 'moving' && a.dose > 9) {
    a.state = 'fallen'; a.down = true; a.safeTime = 0; a.vx = a.vy = 0;
  } else if (a.state === 'fallen' && bad && a.dose > 18) {
    a.state = 'injured'; a.down = true; a.safeTime = 0;
  } else if (a.state === 'injured' && bad && a.dose > 36) {
    a.state = 'dead'; a.down = true; a.safeTime = 0; a.vx = a.vy = 0;
  } else if (a.state === 'injured' && !a.down && bad && a.dose > 18) {
    a.down = true; a.safeTime = 0; a.vx = a.vy = 0;
  }
  if (a.state !== 'fallen' && !(a.state === 'injured' && a.down)) return false;
  const improved = a.contact < .25 && a.density < 4 && hasSpace;
  a.safeTime = improved ? (a.safeTime || 0) + dt : 0;
  if (a.safeTime < 2) return false;
  // A per-second hazard keeps recovery probability independent of rendering speed.
  const rate = (a.state === 'injured' ? .07 : .2) * (1 + .75 * Math.min(2, a.helpers || 0));
  if (rng() >= 1 - Math.exp(-rate * dt)) return false;
  if (a.state === 'fallen') a.state = 'moving';
  a.down = false; a.safeTime = 0; a.dose = Math.min(a.dose, a.state === 'injured' ? 12 : 3);
  return true;
}
