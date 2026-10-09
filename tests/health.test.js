import test from 'node:test';
import assert from 'node:assert/strict';
import { updateHealth, isMobile } from '../health.js';
import { Simulation, DT } from '../engine.js';
const person = () => ({ state: 'moving', down: false, dose: 0, contact: 1, density: 6, safeTime: 0, vx: 1, vy: 0 });
test('sustained compression progresses through fall, injury, then death', () => {
  const a = person(), states = [a.state];
  for (let i = 0; i < 1600; i++) { updateHealth(a, DT, () => 0, false); if (states.at(-1) !== a.state) states.push(a.state); }
  assert.deepEqual(states, ['moving', 'fallen', 'injured', 'dead']);
  assert.equal(isMobile(a), false);
  a.contact = a.density = 0; for (let i = 0; i < 1000; i++) updateHealth(a, DT, () => 0, true);
  assert.equal(a.state, 'dead');
});
test('recovery requires sustained relief and room, and is probabilistic', () => {
  const a = { ...person(), state: 'fallen', down: true, dose: 10, contact: 0, density: 1 };
  for (let i = 0; i < 100; i++) updateHealth(a, DT, () => 0, false);
  assert.equal(a.safeTime, 0);
  for (let i = 0; i < 60; i++) updateHealth(a, DT, () => 0, true);
  assert.equal(a.state, 'fallen');
  a.density = 5; updateHealth(a, DT, () => 0, true); assert.equal(a.safeTime, 0);
  a.density = 1; for (let i = 0; i < 100; i++) updateHealth(a, DT, () => .99, true);
  assert.equal(a.state, 'fallen');
  assert.equal(updateHealth(a, DT, () => 0, true), true);
  assert.equal(a.state, 'moving'); assert.equal(isMobile(a), true);
});
test('injured people stand more slowly and retain injury', () => {
  const a = { ...person(), state: 'injured', down: true, dose: 20, contact: 0, density: 1, safeTime: 3 };
  assert.equal(updateHealth(a, DT, () => .003, true), false);
  const b = { ...a, state: 'fallen' };
  assert.equal(updateHealth(b, DT, () => .003, true), true);
  assert.equal(updateHealth(a, DT, () => 0, true), true);
  assert.equal(a.state, 'injured'); assert.equal(isMobile(a), true);
  a.dose = 19; a.contact = 1; updateHealth(a, DT, () => 0, false);
  assert.equal(a.down, true);
});
test('recovered people resume evacuation and leave obstacle and casualty counts', () => {
  for (const state of ['fallen', 'injured']) {
    const s = new Simulation('hall', { count: 1, panic: 0 });
    const a = s.agents[0]; Object.assign(a, { state, down: true, dose: 12, x: 40, y: 9, contact: 0, density: 0 });
    s[state] = 1; s.healthRng = () => 0; s.updateRouting(); assert.equal(s.field.obstacles.length, 1);
    for (let i = 0; i < 90 / DT && !s.complete; i++) s.step();
    assert.equal(s.evacuated, 1); assert.equal(s.recoveries, 1); assert.equal(s[state], 0); assert.equal(s.field.obstacles.length, 0);
    assert.equal(s.snapshot().recoveries, 1); assert.ok(s.history.some(h => h.recoveries === 1));
  }
});
test('seeded recovery outcomes reproduce exactly', () => {
  const run = () => {
    const s = new Simulation('hall', { count: 10 });
    for (const a of s.agents) Object.assign(a, { state: 'fallen', down: true, dose: 10 });
    s.fallen = 10; s.updateRouting(); for (let i = 0; i < 20 / DT; i++) s.step(); return s;
  };
  const a = run(), b = run(); assert.ok(a.recoveries > 0); assert.deepEqual(a.agents, b.agents); assert.deepEqual(a.history, b.history);
});
