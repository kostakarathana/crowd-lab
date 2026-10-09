# Behavioral benchmark results

Model 2.0, 9 October 2026. Baseline: commit `95c9a53` (model 1.6). These are synthetic plausibility/regression checks, **not empirical validation**.

## Reproduce

```sh
node --test tests/*.test.js
node benchmarks/run.js ./engine.js benchmarks/results.json
```

Each condition uses 200 people, concert geometry, seeds 42 / 71 / 113, no companions, casualties disabled, and a 180-second limit. All 12 revised runs evacuated all 200 people. No throughput quota is imposed. The two urgent baseline rows are identical because that version has no cooperation control.

Central flow is 160 people divided by the interval between the 20th and 180th departures. Table values are means over three seeds; the range is the revised model’s minimum–maximum over those seeds. Contact is a dimensionless model proxy, not measured force.

| Condition | Exit width | Old flow (people/s) | Revised flow (people/s) | Revised range | Revised mean clearance (s) | Old → revised mean peak contact |
|---|---:|---:|---:|---:|---:|---:|
| Calm, cooperation 75% | 1.6 m | 3.80 | 1.86 | 1.81–1.89 | 113.0 | 0.16 → 0.03 |
| Urgency 100%, cooperation 100% | 1.6 m | 12.45 | 3.23 | 3.21–3.25 | 64.0 | 1.00 → 0.13 |
| Urgency 100%, cooperation 0% | 1.6 m | 12.45 | 5.31 | 5.13–5.57 | 40.9 | 1.00 → 0.76 |
| Calm, wider exit | 3.2 m | 4.62 | 3.86 | 3.84–3.87 | 58.3 | 0.06 → 0.01 |

## Interpretation

- Cooperative people leave time and space between one another. The previous emergency setting produced very high discharge speeds and saturated contact; the revised model brakes before contact and differentiates courtesy from urgency.
- Doubling the calm exit width increased discharge flow in all three seeds. This is a directional check, not a calibration of flow per metre.
- Competitive urgency is faster in these particular synthetic runs, with more contact. That is compatible with the existence of both faster-is-faster and faster-is-slower regimes in the literature; this suite does not establish that the model quantitatively reproduces either experiment.
- Mean sampled low-density calm speed is approximately 1.22 m/s in the revised runs, versus 0.93 m/s before. Sampling uses moving people below 1/m², after their initial acceleration, during the first 10 seconds. This is not an isolated free-speed calibration.
- Different preferred speeds, planning, exit decisions and cooperation changed together. The before/after comparison cannot isolate the causal contribution of one feature.

## Other verification

- 62 automated tests pass, including head-on passing without contact, queue braking, walls occluding observations, exit-switch hysteresis, group separation, exact staged release, delayed response, and severe-compression retreat at maximum urgency.
- Existing tests cover graph reachability, concave barriers, cyclic signs, full evacuation without stranded walkers, conservation, deterministic seeding, recovery/casualty state accounting, guard metering and a 3,500-person stadium.
- Browser checks cover new controls, saved-run restoration and model labels, Info links, narrow-screen layout and a running 3,500-person stadium. No browser warnings/errors were observed during these checks.

## Practical limits

Three seeds are not a statistical validation campaign. No measured trajectories or held-out evacuation datasets were fitted. The narrowest example here is 1.6 m, wider than several cited experimental doors. Density measurement, disk-shaped bodies, contact coefficients and casualty thresholds remain approximate. Group share, urgency, cooperation, sign compliance and guard capacity have no universal empirical interpretation.

Data: [revised results](results.json), [baseline results](baseline.json). Evidence and precise assumptions: [RESEARCH.md](../RESEARCH.md).
