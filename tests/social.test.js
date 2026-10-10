import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../engine.js';
import { updateSocial, updateStress, agentUrgency, aidDirection } from '../social.js';
import { emergencyDrive } from '../behavior.js';
import { updateHealth } from '../health.js';
import { perceive } from '../cognition.js';

function scene(cooperation = 100, panic = 0, walls = []) {
  const s = new Simulation('hall', { count: 5, cooperation, panic, groups: 0, ageVariation: 0 }, { walls, exits: [{ side: 'right', at: 15, width: 3 }] });
  s.agents.forEach((a, i) => Object.assign(a, { x: 20, y: 13 + i * .8, start: 0, hue: .1, altruism: .1, heading: 0, noticeDelay: .2, attention: 1, perceiveAt: 0, aidReviewAt: 0, courtesy: cooperation / 100, density: 0, contact: 0 }));
  Object.assign(s.agents[0], { x: 21, state: 'fallen', down: true });
  s.buildHash(); perceive(s); s.time = 1; s.agents.forEach(a => a.perceiveAt = 0); perceive(s); return s;
}

test('cooperation creates bounded aid teams; high urgency sharply suppresses helping', () => {
  const calm = scene(); updateSocial(calm);
  assert.equal(calm.agents.filter(a => a.aidTarget === 0).length, 2);
  const helper = calm.agents.find(a => a.aidTarget === 0);
  assert.equal(aidDirection(calm, helper).helping, true);
  const selfish = scene(0); updateSocial(selfish);
  assert.equal(selfish.agents.filter(a => a.aidTarget != null).length, 0);
  const urgent = scene(100, 100); updateSocial(urgent);
  assert.equal(urgent.agents.filter(a => a.aidTarget != null).length, 0);
  calm.time = 9; updateSocial(calm);
  assert.equal(helper.aidTarget, null); assert.ok(helper.aidCooldown > calm.time);
});

test('walls block both casualty awareness and attempts to render aid', () => {
  const hidden = scene(100, 0, [{ ax: 20.5, ay: 10, bx: 20.5, by: 20 }]);
  updateSocial(hidden);
  for (const a of hidden.agents.slice(1)) { assert.equal(a.seenCasualty, 0); assert.equal(a.aidTarget == null, true); }
  const visible = scene(); updateSocial(visible);
  assert.ok(visible.agents.slice(1).some(a => a.seenCasualty === 1));
});

test('nearby helpers improve recovery only after relief and space, never revive the dead', () => {
  const patient = { state: 'fallen', down: true, dose: 10, contact: 0, density: 1, safeTime: 3, vx: 0, vy: 0 };
  const alone = { ...patient }, supported = { ...patient, helpers: 2 };
  assert.equal(updateHealth(alone, DT, () => .007, true), false);
  assert.equal(updateHealth(supported, DT, () => .007, true), true);
  const compressed = { ...patient, contact: .8, helpers: 2 };
  assert.equal(updateHealth(compressed, DT, () => 0, true), false);
  assert.equal(updateHealth({ ...patient, helpers: 2 }, DT, () => 0, false), false);
  const dead = { ...patient, state: 'dead', helpers: 2 };
  for (let i = 0; i < 100; i++) updateHealth(dead, DT, () => 0, true);
  assert.equal(dead.state, 'dead');
});

test('people briefly check a dead casualty, then move on without repeatedly returning', () => {
  const s = scene(); s.agents[0].state = 'dead'; updateSocial(s);
  const helper = s.agents.find(a => a.aidTarget === 0);
  assert.ok(helper); assert.equal(s.agents[0].helpers, 0);
  s.time = 4; updateSocial(s); assert.equal(helper.aidTarget, null);
  s.time = 60; updateSocial(s); assert.equal(helper.aidTarget, null);
});

test('injury and compression rapidly raise personal urgency, while witnesses respond locally', () => {
  const s = scene(100, 20), a = s.agents[1]; a.contact = .9;
  for (let i = 0; i < 3 / DT; i++) updateStress(s, a, DT);
  assert.ok(agentUrgency(s, a) > 95); assert.ok(emergencyDrive(s, a) > 0);
  assert.equal(s.settings.panic, 20);
  a.contact = 0;
  const high = agentUrgency(s, a); updateStress(s, a, DT);
  assert.ok(agentUrgency(s, a) < high && agentUrgency(s, a) > 90);
  const injured = { state: 'injured', contact: 0 };
  for (let i = 0; i < 3 / DT; i++) updateStress(s, injured, DT);
  assert.ok(agentUrgency(s, injured) > 95);
  const bystander = { state: 'moving', contact: 0, seenCasualty: 1 }, unexposed = { state: 'moving', contact: 0 };
  for (let i = 0; i < 3 / DT; i++) { updateStress(s, bystander, DT); updateStress(s, unexposed, DT); }
  assert.ok(agentUrgency(s, bystander) > 45 && agentUrgency(s, bystander) < 70); assert.equal(agentUrgency(s, unexposed), 20);
  a.escaping = false; a.regroupUntil = 0; a.waitUntil = 20;
  assert.equal(s.shouldWait(a, { x: 1, y: 0 }), false);
});

test('helpers abandon aid when compressed and cannot provide help at a distance', () => {
  const s = scene(); updateSocial(s);
  const a = s.agents.find(a => a.aidTarget === 0);
  assert.equal(s.agents[0].helpers, 0);
  a.contact = .5; updateSocial(s);
  assert.equal(a.aidTarget, null); assert.equal(aidDirection(s, a), null);
});

test('aid works during a full run, then both helper and recovered person resume evacuation', () => {
  const s = new Simulation('hall', { count: 2, cooperation: 100, panic: 0, groups: 0, ageVariation: 0 });
  Object.assign(s.agents[0], { x: 40, y: 10, state: 'fallen', down: true, dose: 10, start: 0 });
  Object.assign(s.agents[1], { x: 38.8, y: 10, start: 0, courtesy: 1, hue: .001 });
  s.fallen = 1; s.healthRng = () => .007; s.updateRouting();
  let helped = false;
  for (let i = 0; i < 90 / DT && !s.complete; i++) { s.step(); helped ||= s.agents[0].helpers > 0; }
  assert.ok(helped); assert.equal(s.recoveries, 1); assert.equal(s.evacuated, 2); assert.equal(s.dead, 0);
});
