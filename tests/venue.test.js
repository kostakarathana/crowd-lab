import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../engine.js';

const exits = [{ side: 'right', at: 15, width: 3 }];
const cut = { ax: 24, ay: 0, bx: 24, by: 30 };
const box = [{ ax: 8, ay: 8, bx: 18, by: 8 }, { ax: 18, ay: 8, bx: 18, by: 18 }, { ax: 18, ay: 18, bx: 8, by: 18 }, { ax: 8, ay: 18, bx: 8, by: 8 }];
const settings = { count: 500, panic: 20, casualties: false };
const create = walls => new Simulation('hall', settings, { walls, exits });

test('sealing half the room relocates the entire population and replaces the exterior', () => {
  const s = create([cut, { ax: 5, ay: 5, bx: 10, by: 15 }]);
  assert.equal(s.initialCount, 500); assert.equal(s.trapped, 0);
  assert.ok(s.agents.every(a => a.x > 24 && s.field.nearest(a.x, a.y) >= 0));
  assert.equal(s.walls.length, 1); assert.equal(s.walls[0].exterior, true);
  assert.ok(s.solids.every(w => w.ax >= 24 && w.bx >= 24));
  assert.ok(s.voids.some(r => r.x === 0 && r.w === 24));
});

test('wall portions hidden behind a new boundary are trimmed at the intersection', () => {
  const s = create([cut, { ax: 10, ay: 5, bx: 35, by: 5 }]);
  assert.deepEqual(s.walls.find(w => w.ay === 5 && w.by === 5), { ax: 24, ay: 5, bx: 35, by: 5, exterior: false });
});

test('an imported cut with a body-inaccessible end gap still trims the old perimeter', () => {
  const s = create([{ ax: 24, ay: .1, bx: 24, by: 30 }]);
  assert.equal(s.initialCount, 500); assert.equal(s.trapped, 0);
  assert.ok(s.agents.every(a => a.x > 24));
  assert.ok(s.solids.every(w => w.ax >= 24 && w.bx >= 24));
});

test('diagonal cuts keep straight boundaries and exclude the unreachable side', () => {
  const s = create([{ ax: 12, ay: 0, bx: 36, by: 30 }, { ax: 0, ay: 15, bx: 40, by: 15 }]);
  assert.equal(s.initialCount, 500); assert.equal(s.trapped, 0);
  assert.ok(s.agents.every(a => a.x > 12 + .8 * a.y));
  const diagonal = s.walls.find(w => w.ax === 12 && w.bx === 36);
  assert.ok(diagonal?.exterior);
  assert.equal(s.walls.find(w => w.ay === 15 && w.by === 15).ax, 24);
});

test('enclosed islands are filled, hidden nested walls are removed, and reopening restores floor', () => {
  const s = create([...box, { ax: 10, ay: 10, bx: 15, by: 15 }]);
  assert.equal(s.walls.length, 4); assert.ok(s.walls.every(w => w.exterior));
  assert.ok(s.agents.every(a => !(a.x > 8 && a.x < 18 && a.y > 8 && a.y < 18)));
  const open = create(s.walls.slice(1));
  assert.ok(open.agents.some(a => a.x > 8 && a.x < 18 && a.y > 8 && a.y < 18));
  assert.equal(open.walls.length, 3); // Hidden interior line does not reappear.
});

test('both components stay populated when both have usable exits', () => {
  const s = new Simulation('hall', settings, { walls: [cut], exits: [...exits, { side: 'left', at: 15, width: 3 }] });
  assert.ok(s.agents.some(a => a.x < 24)); assert.ok(s.agents.some(a => a.x > 24));
  assert.equal(s.walls[0].exterior, false); assert.equal(s.trapped, 0);
});

test('empty drafts retain editable geometry and a newly added exit repopulates them', () => {
  const empty = new Simulation('hall', settings, { walls: [cut], exits: [] });
  assert.equal(empty.initialCount, 0); assert.equal(empty.hasFloor, false); assert.equal(empty.walls.length, 1);
  const reopened = new Simulation('hall', settings, { ...empty.snapshot(), exits });
  assert.equal(reopened.initialCount, 500); assert.ok(reopened.agents.every(a => a.x > 24));
});

test('pruned layouts round-trip and reopening a boundary redistributes the crowd', () => {
  const s = create([cut, { ax: 10, ay: 5, bx: 35, by: 5 }]);
  const restored = new Simulation('hall', settings, s.snapshot());
  assert.deepEqual(restored.walls, s.walls); assert.deepEqual(restored.agents, s.agents);
  const reopened = create(s.walls.filter(w => !w.exterior));
  assert.ok(reopened.agents.some(a => a.x < 24)); assert.equal(reopened.initialCount, 500);
});

test('downstream concourse remains available if its initial upstream area is sealed', () => {
  const s = new Simulation('concourse', { count: 100 }, { walls: [{ ax: 42, ay: 0, bx: 42, by: 24 }], exits: [{ side: 'right', at: 12, width: 3 }] });
  assert.equal(s.initialCount, 100); assert.ok(s.agents.every(a => a.x > 42));
});

test('runtime casualties do not respawn people or permanently rewrite the design', () => {
  const s = create([cut]), originalWalls = structuredClone(s.walls);
  const a = s.agents[0]; Object.assign(a, { state: 'fallen', down: true }); s.fallen = 1;
  s.updateRouting();
  assert.deepEqual(s.walls, originalWalls); assert.equal(s.agents[0], a); assert.equal(s.initialCount, 500);
  const sparse = new Simulation('hall', { count: 80, panic: 20, casualties: false }, { walls: [cut], exits });
  for (let i = 0; i < 120 / DT && !sparse.complete; i++) sparse.step();
  assert.equal(sparse.evacuated, 80);
});
