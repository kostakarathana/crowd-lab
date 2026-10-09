// Illustrative age mix and physical variation, not fitted demographic/medical data.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function initializeDemographics(sim, rng) {
  const mix = clamp((sim.settings.ageVariation || 0) / 100, 0, 1);
  for (const a of sim.agents) {
    // Separate seeded draws keep spawn positions and behavioral traits unchanged.
    const cohort = rng(), sample = rng(), fitness = rng(), build = rng();
    const child = cohort < .25 * mix, older = cohort >= 1 - .25 * mix;
    const age = child ? 6 + Math.floor(sample * 12) : older ? 65 + Math.floor(sample * 21) : 18 + Math.floor(sample * 47);
    const youth = child ? (18 - age) / 12 : 0, aging = older ? (age - 55) / 30 : 0;
    const variation = (fitness - .5) * mix;
    Object.assign(a, {
      age,
      ageSpeed: clamp(1 - .18 * youth - .35 * aging + variation * .16, .55, 1.1),
      strength: clamp(1 - .5 * youth - .45 * aging + variation * .24, .4, 1.15),
      mass: clamp(1 - .55 * youth + (build - .5) * mix * .24, .4, 1.15),
      susceptibility: clamp(1 + .9 * youth + .85 * aging - variation * .3, .85, 2.1)
    });
    a.radius *= 1 - .25 * youth;
  }
}
