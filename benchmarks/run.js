// Reproducible plausibility checks, not empirical validation or safety estimates.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const engine = process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : new URL('../engine.js', import.meta.url).href;
const { Simulation, DT } = await import(engine);
const results = [];
for (const seed of [42, 71, 113]) for (const condition of [
  { name: 'calm', panic: 0, cooperation: 75, width: 1.6 },
  { name: 'urgent-cooperative', panic: 100, cooperation: 100, width: 1.6 },
  { name: 'urgent-competitive', panic: 100, cooperation: 0, width: 1.6 },
  { name: 'wider-exit', panic: 0, cooperation: 75, width: 3.2 }
]) {
  const s = new Simulation('concert', { count: 200, groups: 0, ageVariation: 0, seed, casualties: false, ...condition }, { walls: [], exits: [{ side: 'right', at: 14, width: condition.width }] });
  let t10 = null, t90 = null, speedTotal = 0, samples = 0;
  for (let step = 0; step < 180 / DT && !s.complete; step++) {
    s.step();
    if (t10 === null && s.evacuated >= 20) t10 = s.time;
    if (t90 === null && s.evacuated >= 180) t90 = s.time;
    if (step % 40 === 0 && s.time < 10) for (const a of s.agents) {
      if (a.state === 'moving' && a.density < 1 && s.time > a.start + 2) { speedTotal += Math.hypot(a.vx, a.vy); samples++; }
    }
  }
  const row = { ...condition, seed, evacuated: s.evacuated, total: s.initialCount, elapsed: s.time, t10, t90, centralFlow: t90 ? 160 / (t90 - t10) : null, freeSpeed: speedTotal / samples, peakContact: s.peakContact, peakDensity: s.peakDensity };
  results.push(row); console.log(JSON.stringify(row));
}
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify({ model: results.length && new Simulation('hall', { count: 1 }).snapshot().model || 'crowd-lab-1.6', note: 'Synthetic regression scenarios; no calibration to trajectory data.', results }, null, 2) + '\n');
