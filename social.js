import { isMobile } from './health.js';
import { visibleSegment } from './navigation.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const casualty = a => ['fallen', 'injured', 'dead'].includes(a.state);
export const agentUrgency = (sim, a) => clamp(sim.settings.panic + (100 - sim.settings.panic) * (a.arousal || 0), 0, 100);

// Fast local escalation, slow recovery. Illustrative stress, not a diagnosis or
// a claim that everybody loses rational thought during a real emergency.
export function updateStress(sim, a, dt) {
  if (a.state === 'dead' || a.state === 'exited') return;
  const compression = clamp((a.contact - .25) / .5, 0, 1);
  const injury = a.state === 'injured' || a.state === 'fallen' ? 1 : 0;
  const threat = Math.max(compression, injury, (a.seenCasualty || 0) * .6);
  const target = threat > 0 ? Math.min(1, .35 + threat * .65) : 0;
  const current = a.arousal || 0;
  a.arousal = clamp(current + (target > current ? (target - current) * (1 - Math.exp(-dt * (1 + threat))) : -dt * .025), 0, 1);
}

function aidGoal(sim, helper, target) {
  const dx = target.x - helper.x, dy = target.y - helper.y, distance = Math.hypot(dx, dy);
  const gap = helper.radius + target.radius + .3;
  const travel = Math.max(0, distance - gap);
  const x = helper.x + dx / (distance || 1) * travel, y = helper.y + dy / (distance || 1) * travel;
  return sim.field.clear(helper.x, helper.y, x, y) ? { x, y, distance } : null;
}

// Sight and aid choices run twice a second, with two helpers per casualty.
export function updateSocial(sim) {
  const assigned = new Map();
  for (const a of sim.agents) { a.helpers = 0; a.aiding = false; }
  for (const a of sim.agents) {
    if (!isMobile(a)) { a.aidTarget = null; continue; }
    let visible = [];
    sim.neighbors(a, b => {
      if (b === a || !casualty(b) || Math.hypot(a.x - b.x, a.y - b.y) > 3.5 || !visibleSegment(a.x, a.y, b.x, b.y, sim.solids, .06)) return;
      visible.push(b);
    }, 3.5);
    a.seenCasualty = visible.length ? 1 : 0;
    const urgency = agentUrgency(sim, a) / 100;
    const willing = sim.settings.cooperation > 0 && a.hue < a.courtesy * (1 - .9 * urgency) ** 2;
    const safe = a.state === 'moving' && !a.escaping && !a.securityHeld && a.contact < .2 && a.density < 3 && sim.time >= a.start;
    let target = a.aidTarget == null ? null : sim.agents[a.aidTarget];
    if (target && (!safe || !willing || sim.time >= a.aidUntil || !visible.includes(target) || !aidGoal(sim, a, target))) {
      a.aidChecked ||= {};
      a.aidChecked[target.id] = target.state === 'dead' ? Infinity : sim.time + 45;
      a.aidTarget = null; a.aidCooldown = sim.time + 10; a.intent = null; target = null;
    }
    if (!target && safe && willing && sim.time >= (a.aidCooldown || 0)) {
      visible.sort((b, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(a.x - c.x, a.y - c.y));
      target = visible.find(b => (assigned.get(b.id) || 0) < 2 && sim.time >= (a.aidChecked?.[b.id] || 0) && aidGoal(sim, a, b));
      if (target) { a.aidTarget = target.id; a.aidUntil = sim.time + (target.state === 'dead' ? 2 : 6); a.intent = null; a.waitUntil = 0; }
    }
    if (!target) continue;
    if ((assigned.get(target.id) || 0) >= 2) { a.aidTarget = null; a.intent = null; continue; }
    assigned.set(target.id, (assigned.get(target.id) || 0) + 1);
    a.aiding = Math.hypot(a.x - target.x, a.y - target.y) <= a.radius + target.radius + .55;
    if (a.aiding && target.state !== 'dead') target.helpers++;
  }
}

export function aidDirection(sim, a) {
  if (a.aidTarget == null || a.escaping || a.contact >= .2 || a.density >= 3) return null;
  const target = sim.agents[a.aidTarget];
  if (!target || !casualty(target)) return null;
  const goal = aidGoal(sim, a, target);
  if (!goal) return null;
  const dx = goal.x - a.x, dy = goal.y - a.y, distance = Math.hypot(dx, dy);
  return { x: distance > .1 ? dx / distance : 0, y: distance > .1 ? dy / distance : 0, trapped: false, helping: true };
}
