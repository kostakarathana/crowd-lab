import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, random, DT } from '../engine.js';
import { FlowField, chooseArrow, visibleSegment } from '../navigation.js';

function advance(s, seconds) { for (let i = 0; i < seconds / DT && !s.complete; i++) s.step(); return s; }

test('graph paths clear concave barriers without leaving stragglers', () => {
  const walls = [{ ax: 20, ay: 3, bx: 20, by: 25 }, { ax: 20, ay: 25, bx: 35, by: 25 }, { ax: 35, ay: 25, bx: 35, by: 8 }];
  const s = advance(new Simulation('hall', { count: 150, panic: 10, casualties: false }, { walls, exits: [{ side: 'right', at: 15, width: 2.6 }] }), 180);
  assert.equal(s.evacuated, 150); assert.equal(s.trapped, 0);
});

test('route segments do not shortcut through walls or sealed enclosures', () => {
  const wall = { ax: 10, ay: 0, bx: 10, by: 20 };
  assert.equal(visibleSegment(8, 10, 12, 10, [wall]), false);
  const field = new FlowField(20, 20, [wall], [{ side: 'right', at: 10, width: 3 }]);
  assert.equal(field.waypoint(9.8, 10), null);
});

test('agents route around fallen people instead of pushing at them indefinitely', () => {
  const s = new Simulation('hall', { count: 100, panic: 0, casualties: false }, { walls: [], exits: [{ side: 'right', at: 15, width: 3 }] });
  s.agents = s.agents.slice(0, 2); s.initialCount = 2;
  Object.assign(s.agents[0], { x: 28, y: 15, start: 0 });
  Object.assign(s.agents[1], { x: 33, y: 15, state: 'fallen' }); s.fallen = 1; s.updateRouting();
  advance(s, 70);
  assert.equal(s.agents[0].state, 'exited'); assert.equal(s.agents[1].state, 'fallen');
});

test('single-arrow encounter compliance is between 80 and 90 percent', () => {
  const rng = random(123), candidates = [{ index: 0, density: 1 }]; let followed = 0;
  for (let i = 0; i < 10000; i++) if (chooseArrow(candidates, rng)) followed++;
  assert.ok(followed >= 8000 && followed <= 9000, `${followed / 100}% followed`);
});

test('equally crowded conflicting arrows split approximately 50/50', () => {
  const rng = random(987), counts = [0, 0];
  for (let i = 0; i < 10000; i++) { const choice = chooseArrow([{ index: 0, density: 2 }, { index: 1, density: 2 }], rng); if (choice) counts[choice.index]++; }
  const fraction = counts[0] / (counts[0] + counts[1]); assert.ok(fraction > .47 && fraction < .53, `${fraction}`);
});

test('less crowded arrow is favored, with weaker avoidance at high panic', () => {
  const sample = panic => { const rng = random(5), counts = [0, 0]; for (let i = 0; i < 10000; i++) { const choice = chooseArrow([{ index: 0, density: .5 }, { index: 1, density: 4 }], rng, panic); if (choice) counts[choice.index]++; } return counts[0] / (counts[0] + counts[1]); };
  const calm = sample(0), panic = sample(100);
  assert.ok(calm > .9); assert.ok(panic > .5 && panic < .7); assert.ok(calm > panic);
});

test('arrows guide actual agents, remember an encounter, and survive snapshots', () => {
  const arrows = [{ ax: 20, ay: 15, bx: 20, by: 5 }];
  const s = new Simulation('hall', { count: 100, casualties: false }, { walls: [], exits: [{ side: 'right', at: 15, width: 3 }], arrows });
  for (const a of s.agents) Object.assign(a, { x: 20, y: 15, start: 0 });
  s.occupancy.fill(0); s.time = 1;
  for (const a of s.agents) s.readArrows(a);
  const followers = s.agents.filter(a => a.arrow === 0); assert.ok(followers.length >= 75 && followers.length <= 95);
  const a = followers[0]; assert.ok(s.navigate(a).y < -.8);
  s.time = 60; a.arrow = -1; a.nextSignRead = 0; s.readArrows(a); assert.equal(a.arrow, -1);
  const snapshot = s.snapshot(); assert.deepEqual(snapshot.arrows, arrows); snapshot.arrows[0].by = 99; assert.equal(s.arrows[0].by, 5);
});

test('arrows through a wall do not redirect people to unreachable targets', () => {
  const s = new Simulation('hall', { count: 100 }, { walls: [{ ax: 24, ay: 0, bx: 24, by: 30 }], exits: [{ side: 'right', at: 15, width: 3 }], arrows: [{ ax: 27, ay: 15, bx: 20, by: 15 }] });
  const a = s.agents[0]; Object.assign(a, { x: 27, y: 15, start: 0 }); s.time = 1; s.readArrows(a); assert.equal(a.arrow, -1);
});

test('cyclic arrows cannot keep an otherwise mobile crowd looping forever', () => {
  const arrows = [{ ax: 18, ay: 12, bx: 25, by: 12 }, { ax: 25, ay: 12, bx: 25, by: 20 }, { ax: 25, ay: 20, bx: 18, by: 12 }];
  const s = advance(new Simulation('hall', { count: 100, panic: 10, casualties: false }, { walls: [], exits: [{ side: 'right', at: 15, width: 3 }], arrows }), 180);
  assert.equal(s.evacuated, 100);
});

test('calm agents wait before a dense queue, panic reduces waiting, and waits expire', () => {
  const s = new Simulation('hall', { count: 100, panic: 0, casualties: false });
  s.occupancy.fill(0);
  for (let y = 7; y <= 13; y++) for (let x = 13; x <= 17; x++) s.occupancy[y * s.densityCols + x] = 9;
  s.time = 10;
  const sample = panic => { s.settings.panic = panic; let n = 0; for (const a of s.agents) { Object.assign(a, { x: 17, y: 15, start: 0, waitUntil: 0, nextWaitCheck: 0, contact: 0 }); if (s.shouldWait(a, { x: 1, y: 0 })) n++; } return n; };
  const calm = sample(0), moderate = sample(40), panic = sample(100);
  assert.ok(calm > 60); assert.ok(moderate < calm && moderate > 5); assert.equal(panic, 0);
  s.settings.panic = 0; const a = s.agents.find(a => a.hue < .4); a.nextWaitCheck = 0;
  assert.ok(s.shouldWait(a, { x: 1, y: 0 })); s.time = a.waitUntil + .1;
  assert.equal(s.shouldWait(a, { x: 1, y: 0 }), false);
  a.contact = .5; a.waitUntil = s.time + 10; assert.equal(s.shouldWait(a, { x: 1, y: 0 }), false);
});

test('route costs steer calm people around a dense patch more strongly', () => {
  const s = new Simulation('hall', { count: 100, panic: 0 }, { walls: [], exits: [{ side: 'right', at: 15, width: 3 }] });
  for (let i = 0; i < s.agents.length; i++) { s.agents[i].x = 28 + (i % 10) * .3; s.agents[i].y = 13.5 + Math.floor(i / 10) * .3; }
  const routeExposure = () => {
    let i = s.field.index(23, 15), exposure = 0, length = 0;
    while (i >= 0 && length < 500) { const p = s.field.center(i); exposure += s.routeDensity(p.x, p.y); length++; i = s.field.next[i]; }
    return { exposure, length };
  };
  s.updateRouting(); const calm = routeExposure();
  s.settings.panic = 100; s.updateRouting(); const panic = routeExposure();
  assert.ok(calm.exposure < panic.exposure && calm.length > panic.length, JSON.stringify({ calm, panic }));
});
