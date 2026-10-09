import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../engine.js';
import { updateDistress, reliefDirection, cautiousPanic, retreatTendency, effectiveCaution } from '../escape.js';
import { updateSecurity } from '../security.js';
const person = () => new Simulation('hall', { count: 1 }).agents[0];
test('worsening compression triggers escape before the same steady contact does', () => {
  const rising = person(), steady = person(); rising.hue = steady.hue = .5;
  rising.contact = steady.contact = .65; steady.contactBaseline = .65;
  let risingAt, steadyAt;
  for (let i = 1; i <= 200; i++) {
    for (const a of [rising, steady]) updateDistress(a, DT, i * DT, 30);
    if (rising.escaping && !risingAt) risingAt = i;
    if (steady.escaping && !steadyAt) steadyAt = i;
  }
  assert.ok(risingAt < steadyAt); assert.ok(steadyAt); assert.ok(rising.caution >= .6);
  assert.equal(rising.arrow, -1); assert.equal(rising.securityHeld, false);
});
test('brief contact is ignored; relief permits regrouping and slowly fading caution', () => {
  const a = person(); a.contact = .6; updateDistress(a, DT, 1, 35); assert.equal(a.escaping, false);
  a.contact = 1; a.arrow = 0; a.securityHeld = true;
  for (let i = 1; i <= 120; i++) updateDistress(a, DT, i * DT, 35);
  assert.ok(a.escaping); assert.equal(a.arrow, -1); assert.equal(a.securityHeld, false);
  a.contact = .1; a.density = 1;
  for (let i = 1; i <= 100; i++) updateDistress(a, DT, 3 + i * DT, 35);
  assert.equal(a.escaping, false); assert.ok(a.regroupUntil > 5.5); assert.ok(a.caution >= .6);
  const memory = a.caution; updateDistress(a, 1, 10, 35); assert.equal(a.caution, memory);
  updateDistress(a, 1, 25, 35); assert.ok(a.caution < memory && a.caution > .5);
});
test('escape seeks lower density including backwards but cannot cross a wall', () => {
  const setup = walls => {
    const s = new Simulation('hall', { count: 1 }, { walls, exits: [{ side: 'right', at: 15, width: 3 }] });
    const a = s.agents[0]; Object.assign(a, { x: 12, y: 15, escaping: true, reliefCheck: 0 });
    s.routeDensity = x => x < 10 ? .1 : 3;
    return { s, a };
  };
  const open = setup([]), blocked = setup([{ ax: 11, ay: 0, bx: 11, by: 30 }]);
  assert.ok(reliefDirection(open.s, open.a).x < 0); assert.ok(open.a.reliefTarget.x < 10);
  assert.equal(reliefDirection(blocked.s, blocked.a), null);
  assert.equal(blocked.a.reliefTarget, null);
});
test('escape never crosses a denser band to reach an empty target', () => {
  const s = new Simulation('hall', { count: 1 }); const a = s.agents[0];
  Object.assign(a, { x: 20, y: 15, escaping: true });
  s.routeDensity = (x, y) => { const d = Math.hypot(x - 20, y - 15); return d < .5 ? 2 : d < 3.5 ? 5 : .1; };
  assert.equal(reliefDirection(s, a), null);
});
test('experienced people avoid crowded routes and wait at moderate urgency', () => {
  const s = new Simulation('hall', { count: 1, panic: 50 }); const a = s.agents[0];
  Object.assign(a, { x: 20, y: 15, start: 0, hue: .1, contact: 0, caution: 1 });
  s.routeDensity = x => x > 21 ? 2 : 1;
  assert.ok(cautiousPanic(50, 1) < 35);
  assert.equal(s.shouldWait(a, { x: 1, y: 0 }), true);
  a.escaping = true; assert.equal(s.shouldWait(a, { x: -1, y: 0 }), false);
  s.updateRouting(); assert.ok(s.cautiousField);
});
test('security does not restrain someone escaping compression', () => {
  const s = new Simulation('concert', { count: 30, panic: 0 }, { walls: [], exits: [{ side: 'right', at: 14, width: 3 }], guards: [{ x: 20, y: 14 }] });
  const a = s.agents[0]; Object.assign(a, { x: 18, y: 14, escaping: true, start: 0, contact: 0, waypoint: { x: 25, y: 14 } });
  s.agents.slice(1).forEach((b, i) => Object.assign(b, { x: 21 + i % 6 * .4, y: 12.8 + Math.floor(i / 6) * .5 }));
  s.updateRouting(); updateSecurity(s); assert.equal(a.securityHeld, false);
});
test('escape can precede scheduled release and keeps physical motion finite', () => {
  const s = new Simulation('hall', { count: 1, release: 1 }); const a = s.agents[0];
  Object.assign(a, { x: 20, y: 15, escaping: true, start: 100, reliefCheck: 100, reliefTarget: { x: 17, y: 15 }, caution: .8 });
  s.step(); assert.ok(a.x < 20); assert.ok(Number.isFinite(a.x + a.y + a.vx + a.vy));
  a.reliefTarget = null; a.reliefCheck = 100;
  const fallback = s.navigate(a); assert.ok(Math.hypot(fallback.x, fallback.y) > .9);
});

test('a crowd that retreats from a bottleneck eventually resumes and fully evacuates', () => {
  const s = new Simulation('concert', { count: 700, panic: 50, casualties: false }); let seenEscape = false, seenRegroup = false;
  for (let i = 0; i < 350 / DT && !s.complete; i++) {
    s.step();
    if (i % 40 === 0) { seenEscape ||= s.agents.some(a => a.escaping); seenRegroup ||= s.agents.some(a => s.time < a.regroupUntil); }
  }
  assert.ok(seenEscape); assert.ok(seenRegroup); assert.equal(s.evacuated, 700);
  assert.ok(s.agents.every(a => !a.escaping));
});

test('higher urgency progressively suppresses retreat under identical compression', () => {
  const counts = [30, 60, 78, 90, 100].map(panic => {
    const s = new Simulation('hall', { count: 100, panic });
    s.agents.forEach((a, i) => Object.assign(a, { hue: (i + .5) / 100, contact: 1, distress: 3, caution: 1 }));
    for (const a of s.agents) updateDistress(a, DT, 1, panic);
    return s.agents.filter(a => a.escaping).length;
  });
  assert.deepEqual(counts, [100, 25, 4, 0, 0]);
  assert.equal(retreatTendency(100), 0); assert.equal(effectiveCaution(100, 1), 0);
});
test('maximum panic overrides remembered caution, regrouping, and an old retreat', () => {
  const s = new Simulation('hall', { count: 1, panic: 100 }); const a = s.agents[0];
  Object.assign(a, { x: 20, y: 15, start: 0, hue: 0, contact: 0, caution: 1, distress: 4, escaping: true, reliefTarget: { x: 17, y: 15 }, regroupUntil: 100, waitUntil: 100 });
  s.routeDensity = x => x > 21 ? 3 : 1;
  assert.equal(reliefDirection(s, a), null);
  assert.equal(s.shouldWait(a, { x: 1, y: 0 }), false);
  updateDistress(a, DT, 1, 100); assert.equal(a.escaping, false); assert.equal(a.regroupUntil, 0);
  assert.equal(cautiousPanic(100, 1), 100);
  s.updateRouting(); assert.equal(s.cautiousField, null);
  const direction = s.navigate(a); assert.ok(direction.x > 0);
});
test('an emergency bottleneck crowd keeps heading for exits without retreating', () => {
  const s = new Simulation('concert', { count: 700, panic: 100, casualties: false });
  for (let i = 0; i < 20 / DT; i++) {
    s.step(); assert.ok(s.agents.every(a => !a.escaping && !a.waiting && a.regroupUntil === 0));
  }
  assert.ok(s.peakContact > .8); assert.ok(s.evacuated > 0);
});
