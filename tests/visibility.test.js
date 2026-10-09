import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeSign, sightWalls, visibilityPolygon, SIGN_RADIUS } from '../visibility.js';
import { Simulation } from '../engine.js';
const sign = { ax: 10, ay: 10, bx: 15, by: 10 };
test('sign radius is finite and walls block sight in either direction', () => {
  const walls = sightWalls([{ ax: 12, ay: 5, bx: 12, by: 15 }]);
  assert.ok(canSeeSign(11, 10, sign, walls)); assert.ok(!canSeeSign(13, 10, sign, walls));
  assert.ok(!canSeeSign(10, 15, sign, walls)); assert.ok(canSeeSign(10, 14.4, sign, walls));
  assert.ok(!canSeeSign(10, 10, { ...sign, ax: 13 }, walls));
  const polygon = visibilityPolygon(sign, walls); assert.ok(polygon.every(p => p.x <= 11.840001));
  assert.ok(polygon.every(p => Math.hypot(p.x - 10, p.y - 10) <= SIGN_RADIUS + 1e-8));
});
test('sight passes through door gaps but does not bend around corners', () => {
  const walls = sightWalls([{ ax: 12, ay: 5, bx: 12, by: 9 }, { ax: 12, ay: 11, bx: 12, by: 15 }]);
  assert.ok(canSeeSign(14, 10, sign, walls)); assert.ok(!canSeeSign(13, 12, sign, walls));
  assert.ok(visibilityPolygon(sign, walls).some(p => p.x > 14));
  const diagonal = sightWalls([{ ax: 11, ay: 9, bx: 13, by: 11 }]);
  assert.ok(!canSeeSign(14, 10, sign, diagonal));
  assert.ok(!canSeeSign(10, 10, { ...sign, ax: 12 }, diagonal));
});
test('agents cannot accept a sign across a wall even when a route around exists', () => {
  const s = new Simulation('hall', { count: 1 }, { walls: [{ ax: 12, ay: 7, bx: 12, by: 13 }], exits: [{ side: 'right', at: 10, width: 3 }], arrows: [sign] });
  const a = s.agents[0]; Object.assign(a, { x: 13, y: 10 }); s.navigationRng = () => 0;
  s.readArrows(a); assert.equal(a.arrow, -1); assert.deepEqual(a.signVisited, {});
  Object.assign(a, { x: 11, y: 10, nextSignRead: 0 }); s.readArrows(a); assert.equal(a.arrow, 0);
});
