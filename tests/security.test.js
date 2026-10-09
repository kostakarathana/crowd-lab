import test from 'node:test';
import assert from 'node:assert/strict';
import { guardCapacity, updateSecurity } from '../security.js';
import { sightWalls } from '../visibility.js';
import { Simulation, DT } from '../engine.js';
function fixture(panic = 0, guards = [{ x: 20, y: 15 }]) {
  const agents = Array.from({ length: 36 }, (_, id) => ({ id, x: id < 12 ? 17.5 + id % 3 * .5 : 21 + id % 6 * .45, y: 13.8 + (id < 12 ? Math.floor(id / 3) : Math.floor((id - 12) / 6)) * .65, state: 'moving', contact: 0, start: 0, waypoint: { x: 30, y: 15 }, securityHeld: false }));
  return { settings: { panic }, guards, agents, time: 1, signWalls: [], field: { waypoint: (x, y) => ({ x: x + 3, y }) } };
}
test('panic lowers capacity and nearby guards increase held crowd without double counting', () => {
  const calm = fixture(), panic = fixture(100), team = fixture(100, [{ x: 20, y: 15 }, { x: 20, y: 15.7 }, { x: 20, y: 14.3 }]);
  for (const s of [calm, panic, team]) updateSecurity(s);
  assert.equal(guardCapacity(0), 12); assert.equal(guardCapacity(100), 2);
  assert.equal(calm.held, 12); assert.equal(panic.held, 2); assert.equal(team.held, 6);
  assert.equal(team.guards.reduce((sum, g) => sum + g.held, 0), team.held);
  assert.equal(panic.guards[0].mode, 'overwhelmed');
});
test('guards release when downstream clears or the upstream queue compresses', () => {
  const s = fixture(); updateSecurity(s); assert.ok(s.held > 0);
  s.agents.filter(a => a.id >= 12).forEach(a => a.state = 'exited'); updateSecurity(s); assert.equal(s.held, 0);
  s.agents.forEach(a => { a.state = 'moving'; if (a.id < 12) a.contact = .6; }); updateSecurity(s);
  assert.equal(s.held, 0); assert.equal(s.guards[0].mode, 'relieving queue');
});
test('holds expire and release windows prevent permanent restraint', () => {
  const s = fixture(); updateSecurity(s); assert.equal(s.held, 12);
  s.time += 6; updateSecurity(s); assert.equal(s.held, 0);
  s.time += 1; updateSecurity(s); assert.equal(s.held, 0);
  s.time += 1; updateSecurity(s); assert.equal(s.held, 12);
});
test('guards neither sense nor restrain people through walls', () => {
  const s = fixture(); s.signWalls = sightWalls([{ ax: 20.5, ay: 9, bx: 20.5, by: 21 }]);
  updateSecurity(s); assert.equal(s.held, 0); assert.equal(s.guards[0].aheadDensity, 0);
  s.signWalls = sightWalls([{ ax: 19, ay: 9, bx: 19, by: 21 }]);
  updateSecurity(s); assert.equal(s.held, 0); assert.ok(s.guards[0].aheadDensity > 1.8);
});
test('departing, unreleased, downed, and pressured people are not restrained', () => {
  const s = fixture();
  s.agents[0].start = 10; s.agents[1].state = 'fallen'; s.agents[2].contact = .4;
  s.agents[3].waypoint = { x: 0, y: 15 };
  updateSecurity(s); for (let i = 0; i < 4; i++) assert.equal(s.agents[i].securityHeld, false);
});
test('security persists as detached layout data and sparse crowds still evacuate', () => {
  const layout = { walls: [], exits: [{ side: 'right', at: 15, width: 3 }], guards: [{ x: 40, y: 15 }] };
  const s = new Simulation('hall', { count: 80, panic: 35 }, layout);
  const snap = s.snapshot(); snap.guards[0].x = 1; assert.equal(s.guards[0].x, 40);
  for (let i = 0; i < 100 / DT && !s.complete; i++) s.step();
  assert.equal(s.evacuated, 80); assert.equal(s.held, 0); assert.equal(s.dead, 0);
  const old = new Simulation('hall', { count: 1 }, { walls: [], exits: layout.exits }); assert.deepEqual(old.guards, []);
});
test('security decisions reproduce for identical seeds and geometry', () => {
  const run = () => {
    const s = new Simulation('concert', { count: 500, panic: 60, casualties: false }, { walls: [], exits: [{ side: 'right', at: 14, width: 1.6 }], guards: [{ x: 34, y: 14 }, { x: 34, y: 15 }] });
    let peakHeld = 0;
    for (let i = 0; i < 35 / DT; i++) { s.step(); peakHeld = Math.max(peakHeld, s.held); }
    assert.ok(peakHeld > 0); return s;
  };
  const a = run(), b = run(); assert.deepEqual(a.agents, b.agents); assert.deepEqual(a.history, b.history);
});
test('a hold brakes actual motion without freezing a person in place', () => {
  const run = guards => {
    const s = new Simulation('hall', { count: 25, panic: 100, casualties: false }, { walls: [], exits: [{ side: 'right', at: 15, width: 3 }], guards });
    Object.assign(s.agents[0], { x: 18, y: 15, vx: 1, start: 0 });
    s.agents.slice(1).forEach((a, i) => Object.assign(a, { x: 21 + i % 6 * .5, y: 13.8 + Math.floor(i / 6) * .65, start: 100 }));
    s.updateRouting(); for (let i = 0; i < 10; i++) s.step(); return s;
  };
  const controlled = run([{ x: 20, y: 15 }]), free = run([]);
  assert.ok(controlled.agents[0].securityHeld);
  assert.ok(controlled.agents[0].x > 18); assert.ok(controlled.agents[0].x < free.agents[0].x);
  assert.equal(controlled.agents[0].stalled, 0);
});
