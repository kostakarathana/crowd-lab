import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../engine.js';
import { collisionTime, planMotion, preferredSpeed, companionPreference, selectExit } from '../behavior.js';

test('anticipation distinguishes approaching, crossing, parallel, and receding traffic', () => {
  assert.ok(Math.abs(collisionTime(3, 0, 2, 0, .5) - 1.25) < 1e-9);
  assert.equal(collisionTime(3, 0, -2, 0, .5), Infinity);
  assert.equal(collisionTime(0, 1, 0, 0, .5), Infinity);
  assert.ok(collisionTime(2, 2, 1, 1, .5) < 2);
  assert.equal(collisionTime(.3, 0, -1, 0, .5), Infinity);
});

function pair(panic = 0, walls = []) {
  const s = new Simulation('hall', { count: 2, panic, groups: 0, cooperation: 100, casualties: false }, { walls, exits: [{ side: 'right', at: 15, width: 3 }] });
  Object.assign(s.agents[0], { x: 20, y: 15, start: 0, factor: 1 });
  Object.assign(s.agents[1], { x: 20.9, y: 15, start: 100 });
  s.buildHash(); return s;
}
test('below the emergency threshold people anticipate a stationary person before contact', () => {
  for (const panic of [0, 89]) {
    const s = pair(panic), a = s.agents[0], intent = planMotion(s, a, { x: 1, y: 0 });
    assert.equal(a.contact, 0);
    assert.ok(intent.speed < preferredSpeed(s, a) * .8 || Math.abs(intent.y) > .4);
  }
});
test('90%+ emergency shoves displace a waiting person and escalate toward maximum urgency', () => {
  const samples = [];
  for (const panic of [89, 90, 95, 100]) {
    const s = pair(panic, [{ ax: 15, ay: 14.65, bx: 30, by: 14.65 }, { ax: 15, ay: 15.35, bx: 30, by: 15.35 }]);
    // Isolate physical queue behavior from global path choice in a narrow lane.
    s.navigate = () => ({ x: 1, y: 0, trapped: false });
    let contact = 0;
    for (let i = 0; i < 3 / DT; i++) { s.step(); contact = Math.max(contact, s.agents[1].contact); }
    samples.push({ displacement: s.agents[1].x - 20.9, contact });
    assert.ok(s.agents.every(a => Number.isFinite(a.x) && a.y > 14.65 && a.y < 15.35));
    assert.equal(s.agents[1].intent, null, 'waiting person has no self-propelled motion');
  }
  assert.equal(samples[0].contact, 0);
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i].displacement > samples[i - 1].displacement * 1.4, JSON.stringify(samples));
    assert.ok(samples[i].contact > samples[i - 1].contact, JSON.stringify(samples));
  }
});
test('emergency agents still brake for fallen bodies and stop shoving during retreat', () => {
  const s = pair(100, [{ ax: 15, ay: 14.65, bx: 25, by: 14.65 }, { ax: 15, ay: 15.35, bx: 25, by: 15.35 }]);
  const [a, b] = s.agents;
  Object.assign(b, { x: 20.45, state: 'fallen', down: true }); s.buildHash();
  const stopped = planMotion(s, a, { x: 1, y: 0 });
  assert.equal(stopped.shove, 0); assert.ok(stopped.speed < .1);
  Object.assign(b, { state: 'moving', down: false });
  a.escaping = true;
  assert.equal(planMotion(s, a, { x: 1, y: 0 }).shove, 0);
});
test('queue headway slows people when a corridor prevents passing', () => {
  const s = pair(0, [{ ax: 15, ay: 14.65, bx: 25, by: 14.65 }, { ax: 15, ay: 15.35, bx: 25, by: 15.35 }]);
  const a = s.agents[0], intent = planMotion(s, a, { x: 1, y: 0 });
  assert.ok(intent.speed < .65, `${intent.speed}`);
  assert.ok(Math.abs(intent.y) < .1);
});
test('occluded people do not influence visual steering', () => {
  const s = pair(0, [{ ax: 15, ay: 15.5, bx: 25, by: 15.5 }]);
  Object.assign(s.agents[1], { x: 20.8, y: 15.8, vx: 0, vy: -1 }); s.buildHash();
  const a = s.agents[0], withHidden = planMotion(s, a, { x: 1, y: 0 });
  s.agents[1].state = 'exited'; s.buildHash(); a.turn = 0;
  assert.deepEqual(planMotion(s, a, { x: 1, y: 0 }), withHidden);
});
test('urgency and cooperation are independent seeded traits', () => {
  const calm = new Simulation('hall', { count: 50, panic: 0, cooperation: 80 });
  const urgent = new Simulation('hall', { count: 50, panic: 100, cooperation: 80 });
  assert.deepEqual(calm.agents.map(a => a.courtesy), urgent.agents.map(a => a.courtesy));
  assert.ok(preferredSpeed(urgent, urgent.agents[0]) > preferredSpeed(calm, calm.agents[0]));
  const competitive = new Simulation('hall', { count: 50, panic: 100, cooperation: 0 });
  assert.ok(competitive.agents.every(a => a.courtesy < .26));
});
test('companions slow for visible partners, but never wait indefinitely or pull through walls', () => {
  const s = pair(), [a, b] = s.agents; a.group = b.group = 0; s.groups = [[a, b]];
  Object.assign(b, { x: 18, y: 15, start: 0 });
  assert.equal(companionPreference(s, a, { x: 1, y: 0 }).pace, .8);
  s.time = 9; assert.equal(companionPreference(s, a, { x: 1, y: 0 }).pace, 1);
  s.solids.push({ ax: 19, ay: 10, bx: 19, by: 20 });
  assert.deepEqual(companionPreference(s, a, { x: 1, y: 0 }), { x: 1, y: 0, pace: 1 });
  assert.equal(a.accompanying, false);
});
test('group allocation is deterministic, local, and switchable', () => {
  const s = new Simulation('concert', { count: 500, groups: 50 });
  assert.ok(s.agents.filter(a => a.group >= 0).length >= 245);
  for (const group of s.groups) for (const a of group) assert.ok(Math.hypot(a.x - group[0].x, a.y - group[0].y) < 2.2);
  assert.equal(new Simulation('hall', { count: 100, groups: 0 }).groups.length, 0);
});
test('varied response has a bounded tail while staged release remains exact', () => {
  const s = new Simulation('hall', { count: 500, release: -1 });
  assert.ok(s.agents.every(a => a.start >= .5 && a.start <= 40));
  assert.ok(s.agents.some(a => a.start > 15));
  const staged = new Simulation('hall', { count: 100, release: 5 });
  assert.equal(staged.agents[99].start, 19.8);
});
test('exit choice remembers only visible queues and resists minor changes', () => {
  const s = new Simulation('hall', { count: 1, groups: 0 }); const a = s.agents[0];
  Object.assign(a, { x: 42, y: 15, exitBias: [0, 0] }); selectExit(s, a);
  assert.equal(Object.keys(a.exitMemory).length, 2);
  const first = a.exitChoice;
  a.exitMemory[first].delay += .2; a.exitReview = 0; selectExit(s, a);
  assert.equal(a.exitChoice, first); assert.equal(a.routeChanges, 0);
  const hidden = new Simulation('hall', { count: 1 }, { walls: [{ ax: 44, ay: 0, bx: 44, by: 24 }], exits: s.exits });
  const b = hidden.agents[0]; Object.assign(b, { x: 42, y: 15 }); selectExit(hidden, b);
  assert.deepEqual(b.exitMemory, {}); assert.ok(b.exitChoice >= 0);
});
test('an observed congested exit loses out to an equally distant open exit', () => {
  const s = new Simulation('hall', { count: 41, groups: 0, panic: 0 });
  const a = s.agents[0]; Object.assign(a, { x: 42, y: 15, exitBias: [0, 0] });
  s.agents.slice(1).forEach((b, i) => Object.assign(b, { x: 44 + i % 8 * .45, y: 9 + Math.floor(i / 8) * .4 }));
  selectExit(s, a); assert.equal(a.exitChoice, 1);
  // A committed choice can change once a substantially better alternative appears.
  Object.assign(a, { exitChoice: 0, exitCommitted: 0, exitReview: 0 });
  s.time = 20; selectExit(s, a); assert.equal(a.exitChoice, 1); assert.equal(a.routeChanges, 1);
});
test('opposing pedestrians pass with anticipation rather than colliding head-on', () => {
  const s = pair(), [a, b] = s.agents;
  Object.assign(a, { x: 15, y: 15, factor: 1 }); Object.assign(b, { x: 25, y: 15, start: 0, factor: 1 });
  s.navigate = person => ({ x: person === a ? 1 : -1, y: 0, trapped: false });
  let separation = Infinity;
  for (let i = 0; i < 10 / DT; i++) { s.step(); separation = Math.min(separation, Math.hypot(a.x - b.x, a.y - b.y)); }
  assert.ok(a.x > b.x); assert.ok(separation > a.radius + b.radius, `${separation}`);
  assert.ok(s.peakContact < .05);
});
test('ordinary bottleneck traffic brakes and exits without forced mass casualties', () => {
  const s = new Simulation('concert', { count: 250, panic: 20, groups: 0 }); let slowed = false;
  for (let i = 0; i < 150 / DT && !s.complete; i++) {
    s.step(); slowed ||= s.agents.some(a => a.yielding);
  }
  assert.ok(slowed); assert.equal(s.evacuated, 250); assert.equal(s.dead, 0); assert.equal(s.fallen, 0);
});
