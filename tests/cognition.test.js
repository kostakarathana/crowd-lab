import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../engine.js';
import { perceive, canObserve, believedRoute, perceivedDensity, personalRandom } from '../cognition.js';
import { updateStress, updateSocial } from '../social.js';

const setup = (count = 3, walls = []) => new Simulation('hall', { count, groups: 0, panic: 20, ageVariation: 0, casualties: false }, { walls, exits: [{ side: 'right', at: 15, width: 3 }] });
function look(s, time) { s.time = time; s.agents.forEach(a => a.perceiveAt = 0); s.buildHash(); perceive(s); }

test('a distant fall cannot change an unwitnessing person’s route, timing, stress or trajectory', () => {
  const control = setup(2), incident = setup(2);
  for (const s of [control, incident]) {
    Object.assign(s.agents[0], { x: 5, y: 5, start: 0 });
    Object.assign(s.agents[1], { x: 40, y: 25, start: 100 });
    s.updateRouting();
  }
  Object.assign(incident.agents[1], { state: 'fallen', down: true }); incident.fallen = 1; incident.routingDirty = true;
  const originalField = incident.exitFields[0];
  for (let i = 0; i < 5 / DT; i++) { control.step(); incident.step(); }
  assert.deepEqual(incident.agents[0], control.agents[0]);
  assert.equal(incident.exitFields[0], originalField);
});

test('people notice the same casualty at varied times and react with varied intensity', () => {
  const s = setup(13), patient = s.agents[0];
  Object.assign(patient, { x: 20, y: 15, state: 'fallen', down: true });
  s.agents.slice(1).forEach((a, i) => {
    const angle = i * Math.PI / 6;
    Object.assign(a, { x: 20 + Math.cos(angle) * 2.4, y: 15 + Math.sin(angle) * 2.4, heading: angle + Math.PI, lookAroundAt: 100 });
  });
  s.buildHash(); const noticedAt = new Map();
  for (let i = 0; i < 4 / DT; i++) {
    s.time = i * DT; perceive(s);
    for (const a of s.agents.slice(1)) { updateStress(s, a, DT); if (a.noticed[0] && !noticedAt.has(a.id)) noticedAt.set(a.id, s.time); }
  }
  assert.equal(noticedAt.size, 12);
  assert.ok(Math.max(...noticedAt.values()) - Math.min(...noticedAt.values()) > .5);
  assert.ok(new Set(s.agents.slice(1).map(a => a.arousal.toFixed(2))).size >= 5);
});

test('walls block casualty knowledge, aid and relayed concern even when a route around exists', () => {
  const s = setup(2, [{ ax: 20, ay: 8, bx: 20, by: 22 }]);
  Object.assign(s.agents[0], { x: 19, y: 15, heading: 0, start: 0, altruism: 0, courtesy: 1, lookAroundAt: 0 });
  Object.assign(s.agents[1], { x: 21, y: 15, state: 'fallen', down: true, alarm: 1 });
  for (let t = 0; t < 4; t += .2) { look(s, t); updateSocial(s); }
  const a = s.agents[0];
  assert.deepEqual(a.noticed, {}); assert.equal(a.seenCasualty, 0); assert.equal(a.socialAlarm, 0); assert.equal(a.aidTarget == null, true);
  assert.equal(believedRoute(s, a, 0), s.exitFields[0]);
});

test('directional attention and intervening people can hide a casualty until the view clears', () => {
  const s = setup(), [a, blocker, patient] = s.agents;
  Object.assign(a, { x: 10, y: 15, heading: Math.PI, lookAroundAt: 100 });
  Object.assign(blocker, { x: 11.5, y: 15 }); Object.assign(patient, { x: 13, y: 15, state: 'fallen', down: true });
  assert.equal(canObserve(s, a, patient), false);
  a.heading = 0; assert.equal(canObserve(s, a, patient), true);
  look(s, 0); look(s, 2); assert.deepEqual(a.noticed, {});
  blocker.state = 'exited'; look(s, 3); look(s, 5);
  assert.ok(a.noticed[patient.id]);
});

test('remembered obstructions are private, retain their observed location and eventually expire', () => {
  const s = setup(2), [a, patient] = s.agents;
  Object.assign(a, { x: 20, y: 15, heading: 0, lookAroundAt: 100 });
  Object.assign(patient, { x: 22, y: 15, state: 'fallen', down: true });
  look(s, 0); look(s, 2); assert.ok(a.noticed[1]);
  const known = believedRoute(s, a, 0); assert.equal(known.obstacles.length, 1);
  Object.assign(patient, { x: 40, y: 25 }); look(s, 3);
  assert.equal(a.noticed[1].x, 22); assert.ok(a.seenCasualty < 1 && a.seenCasualty > 0);
  look(s, 2 + a.memorySpan + 1); assert.deepEqual(a.noticed, {});
  assert.equal(believedRoute(s, a, 0), s.exitFields[0]);
});

test('local warnings take successive observations to travel and cannot amplify themselves', () => {
  const s = setup(), [a, b, c] = s.agents;
  s.agents.forEach((p, i) => Object.assign(p, { x: 10 + i * 2.5, y: 15, alarm: 0, lookAroundAt: 100 }));
  a.alarm = 1; a.perceivedAt = 0;
  look(s, .1);
  assert.ok(b.socialAlarm > 0); assert.equal(c.socialAlarm, 0); assert.deepEqual(b.noticed, {});
  const previousAlarm = b.alarm;
  look(s, .6); assert.ok(c.socialAlarm > 0 && c.socialAlarm < previousAlarm);
  for (let i = 1; i <= 10; i++) look(s, i);
  assert.ok(s.agents.every(p => p.alarm < .001));
});

test('perception results do not depend on which person happens to be iterated first', () => {
  const a = setup(), b = setup();
  for (const s of [a, b]) { s.agents.forEach((p, i) => Object.assign(p, { x: 10 + i * 2, y: 15, perceiveAt: 0, alarm: i === 0 ? 1 : 0 })); s.buildHash(); }
  b.agents.reverse(); perceive(a); perceive(b);
  assert.deepEqual(a.agents.map(p => p.socialAlarm), b.agents.reverse().map(p => p.socialAlarm));
});

test('individual random streams and decision clocks are diverse and reproducible', () => {
  const s = setup(100), repeat = setup(100);
  assert.deepEqual(s.agents, repeat.agents);
  assert.equal(new Set(s.agents.map(a => a.decisionInterval)).size, 100);
  assert.ok(Math.max(...s.agents.map(a => a.noticeDelay)) - Math.min(...s.agents.map(a => a.noticeDelay)) > .7);
  for (let i = 0; i < 30; i++) personalRandom(s.agents[1]);
  assert.equal(personalRandom(s.agents[0]), personalRandom(repeat.agents[0]));
});

test('density estimates require a recent nearby unobstructed observation', () => {
  const s = setup(1, [{ ax: 21, ay: 10, bx: 21, by: 20 }]), a = s.agents[0];
  Object.assign(a, { x: 20, y: 15, perceivedAt: 0, observedAround: true, perceivedNeighbors: [{ x: 19, y: 15 }] });
  assert.ok(perceivedDensity(s, a, 19, 15) > 0);
  assert.equal(perceivedDensity(s, a, 22, 15), null);
  assert.equal(perceivedDensity(s, a, 40, 15), null);
  s.time = 3; assert.equal(perceivedDensity(s, a, 19, 15), null);
});
