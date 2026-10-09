import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, DT } from '../engine.js';
import { preferredSpeed } from '../behavior.js';
import { updateHealth } from '../health.js';

test('age mix is seeded, adjustable, independent of spawning, and saved', () => {
  const adult = new Simulation('hall', { count: 800, ageVariation: 0 });
  const mixed = new Simulation('hall', { count: 800, ageVariation: 100 });
  const repeat = new Simulation('hall', { count: 800, ageVariation: 100 });
  const medium = new Simulation('hall', { count: 800, ageVariation: 50 });
  assert.deepEqual(mixed.agents, repeat.agents);
  assert.deepEqual(adult.agents.map(a => [a.x, a.y, a.courtesy]), mixed.agents.map(a => [a.x, a.y, a.courtesy]));
  assert.ok(adult.agents.every(a => a.age >= 18 && a.age < 65 && a.mass === 1 && a.strength === 1 && a.susceptibility === 1 && a.ageSpeed === 1));
  const young = mixed.agents.filter(a => a.age < 18), old = mixed.agents.filter(a => a.age >= 65);
  assert.ok(young.length > 160 && young.length < 240);
  assert.ok(old.length > 160 && old.length < 240);
  assert.ok(medium.agents.filter(a => a.age < 18 || a.age >= 65).length < young.length + old.length);
  assert.ok(new Set(young.map(a => a.strength)).size > 50);
  assert.equal(mixed.snapshot().settings.ageVariation, 100);
  assert.deepEqual(new Simulation('hall', mixed.snapshot().settings, mixed.snapshot()).agents, mixed.agents);
});

test('children and older adults have varied mobility and develop injuries sooner under equal compression', () => {
  const s = new Simulation('hall', { count: 800, ageVariation: 100, variation: 0 });
  const child = s.agents.find(a => a.age === 6), older = s.agents.find(a => a.age === 85);
  const adult = new Simulation('hall', { count: 1, ageVariation: 0, variation: 0 }).agents[0];
  function exposure(a) {
    const b = { ...a, state: 'moving', dose: 0, contact: .9, density: 6 };
    let fall = 0, injury = 0;
    for (let t = DT; t < 40; t += DT) {
      updateHealth(b, DT, () => 1, false);
      if (!fall && b.state === 'fallen') fall = t;
      if (b.state === 'injured') { injury = t; break; }
    }
    return { fall, injury };
  }
  const reference = exposure(adult);
  for (const a of [child, older]) {
    assert.ok(a.strength < adult.strength);
    assert.ok(preferredSpeed(s, a) < preferredSpeed(s, adult));
    const result = exposure(a);
    assert.ok(result.fall < reference.fall && result.injury < reference.injury);
    const safe = { ...a, contact: 0, dose: 0 };
    for (let i = 0; i < 1000; i++) updateHealth(safe, DT, () => 0, true);
    assert.equal(safe.state, 'moving'); assert.equal(safe.dose, 0);
  }
  assert.ok(child.radius < adult.radius);
});

test('weaker bodies are physically easier to displace, rather than only having different health labels', () => {
  function displacement(strength, mass) {
    const s = new Simulation('hall', { count: 2, panic: 100, ageVariation: 0, groups: 0, casualties: false }, {
      walls: [{ ax: 15, ay: 14.65, bx: 30, by: 14.65 }, { ax: 15, ay: 15.35, bx: 30, by: 15.35 }],
      exits: [{ side: 'right', at: 15, width: 3 }]
    });
    Object.assign(s.agents[0], { x: 20, y: 15, start: 0, factor: 1 });
    Object.assign(s.agents[1], { x: 20.9, y: 15, start: 100, strength, mass });
    s.navigate = () => ({ x: 1, y: 0, trapped: false });
    for (let i = 0; i < 2 / DT; i++) s.step();
    return s.agents[1].x - 20.9;
  }
  const adult = displacement(1, 1);
  assert.ok(displacement(.55, 1) > adult);
  assert.ok(displacement(.55, .5) > adult);
});

test('maximum age variation remains finite, accounts for everyone, and respects disabled casualties', () => {
  const s = new Simulation('concert', { count: 300, panic: 100, ageVariation: 100, casualties: false });
  for (let i = 0; i < 30 / DT; i++) s.step();
  assert.ok(s.agents.every(a => Number.isFinite(a.x) && Number.isFinite(a.y) && a.state !== 'fallen' && a.state !== 'dead'));
  assert.equal(s.evacuated + s.remaining, s.initialCount);
});
