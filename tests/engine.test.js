import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, FlowField, boundaryWalls, DT } from '../engine.js';

function advance(s, seconds) { for (let i = 0; i < seconds / DT; i++) s.step(); return s; }
test('identical seeds and inputs reproduce trajectories and exit events', () => {
  const a = advance(new Simulation('hall', { count: 120, seed: 271 }), 8);
  const b = advance(new Simulation('hall', { count: 120, seed: 271 }), 8);
  assert.deepEqual(a.agents, b.agents); assert.deepEqual(a.exitTimes, b.exitTimes);
  const c = new Simulation('hall', { count: 120, seed: 272 }); assert.notEqual(a.agents[0].x, c.agents[0].x);
});
test('a lightly populated hall clears through actual boundary exits', () => {
  const s = advance(new Simulation('hall', { count: 100, panic: 35 }), 90);
  assert.equal(s.evacuated, 100); assert.equal(s.dead, 0); assert.equal(s.fallen, 0); assert.ok(s.complete);
  assert.equal(s.exitCounts.reduce((a, b) => a + b, 0), 100);
});
test('solid enclosure is unreachable, with no diagonal corner leaks', () => {
  const exits = [{ side: 'right', at: 5, width: 2 }];
  const box = [{ ax: 2, ay: 2, bx: 6, by: 2 }, { ax: 6, ay: 2, bx: 6, by: 8 }, { ax: 6, ay: 8, bx: 2, by: 8 }, { ax: 2, ay: 8, bx: 2, by: 2 }];
  const field = new FlowField(10, 10, [...boundaryWalls(10, 10, exits), ...box], exits);
  assert.ok(field.direction(4, 5).trapped); assert.ok(!field.direction(8, 5).trapped);
});
test('routes go around a partial barrier but not a complete partition', () => {
  const exits = [{ side: 'right', at: 5, width: 2 }], boundary = boundaryWalls(10, 10, exits);
  const partial = new FlowField(10, 10, [...boundary, { ax: 5, ay: 0, bx: 5, by: 7 }], exits);
  const closed = new FlowField(10, 10, [...boundary, { ax: 5, ay: 0, bx: 5, by: 10 }], exits);
  assert.ok(!partial.direction(2, 4).trapped); assert.ok(closed.direction(2, 4).trapped);
  assert.ok(partial.direction(4, 4).y > 0);
});
test('agents cannot cross a sealed wall at maximum urgency', () => {
  const s = new Simulation('hall', { count: 100, panic: 100, casualties: false }, { walls: [{ ax: 24, ay: 0, bx: 24, by: 30 }], exits: [{ side: 'right', at: 15, width: 2 }] });
  const left = s.agents.filter(a => a.x < 24).map(a => a.id);
  advance(s, 25);
  for (const id of left) { assert.ok(s.agents[id].x < 24); assert.notEqual(s.agents[id].state, 'exited'); }
  assert.ok(s.trapped >= left.length);
});
test('no exits means no evacuation and every agent has a blocked route', () => {
  const s = advance(new Simulation('hall', { count: 100 }, { walls: [], exits: [] }), 5);
  assert.equal(s.evacuated, 0); assert.equal(s.trapped, 100); assert.ok(!s.complete);
});
test('staggered release delays activation independently of urgency', () => {
  const s = new Simulation('hall', { count: 100, panic: 100, release: 5 });
  advance(s, 5); assert.equal(s.agents.filter(a => a.start <= s.time).length, 26);
  assert.ok(s.agents[99].start > s.time);
});
function confinedCrush(casualties) {
  const walls = [{ ax: 10, ay: 10, bx: 14, by: 10 }, { ax: 14, ay: 10, bx: 14, by: 14 }, { ax: 14, ay: 14, bx: 10, by: 14 }, { ax: 10, ay: 14, bx: 10, by: 10 }];
  const s = new Simulation('hall', { count: 140, panic: 100, casualties }, { walls, exits: [{ side: 'right', at: 15, width: 3 }] });
  // An overcrowded enclosure leaves no open floor for the new escape response.
  s.agents.forEach((a, i) => Object.assign(a, { x: 10.35 + (i % 12) * .3, y: 10.35 + Math.floor(i / 12) * .3, start: 0 }));
  s.updateRouting(); return advance(s, 40);
}
test('inescapable compression still produces exposure-based illustrative casualties', () => {
  const s = confinedCrush(true);
  assert.ok(s.peakContact > .8); assert.ok(s.dead + s.fallen + s.injured > 0);
  assert.equal(s.agents.filter(a => a.state === 'dead').length, s.dead);
  assert.equal(s.agents.filter(a => a.state === 'fallen').length, s.fallen);
});
test('casualty toggle disables falls and deaths under the same pressure', () => {
  const s = confinedCrush(false);
  assert.ok(s.peakContact > .8); assert.equal(s.dead, 0); assert.equal(s.fallen, 0);
});
test('wider exits improve clearance in a controlled bottleneck experiment', () => {
  const run = width => advance(new Simulation('hall', { count: 500, panic: 50, casualties: false }, { walls: [], exits: [{ side: 'right', at: 15, width }] }), 30);
  const narrow = run(1), wide = run(5);
  assert.ok(wide.evacuated > narrow.evacuated, `wide ${wide.evacuated}; narrow ${narrow.evacuated}`);
});
test('stadium population stays finite and every person is accounted for', () => {
  const s = advance(new Simulation('stadium', { count: 3500, panic: 100 }), 12);
  assert.equal(s.initialCount, 3500);
  for (const a of s.agents) assert.ok(Number.isFinite(a.x + a.y + a.vx + a.vy + a.contact));
  assert.equal(s.evacuated + s.dead + s.fallen + s.injured + s.agents.filter(a => a.state === 'moving').length, s.initialCount);
});
test('snapshot is detached and retains reproduction settings and history', () => {
  const s = advance(new Simulation('hall', { count: 100 }), 3), snapshot = s.snapshot();
  snapshot.exits[0].width = 99; snapshot.settings.panic = 99; snapshot.history[0].flow = 99;
  assert.notEqual(s.exits[0].width, 99); assert.notEqual(s.settings.panic, 99); assert.notEqual(s.history[0].flow, 99);
});
