# Behavioral benchmark results

Model 2.2, 9 October 2026. Baseline: commit `95c9a53` (model 1.6). These are synthetic plausibility/regression checks, **not empirical validation**.

## Reproduce

```sh
node --test tests/*.test.js
node benchmarks/run.js ./engine.js benchmarks/results.json
```

Each condition uses 200 people, concert geometry, seeds 42 / 71 / 113, no companions, age variation 0%, casualties disabled, and a 180-second limit. All 12 revised runs evacuated all 200 people. No throughput quota is imposed. The two urgent baseline rows are identical because that version has no cooperation control.

Central flow is 160 people divided by the interval between the 20th and 180th departures. Table values are means over three seeds; the range is the revised model’s minimum–maximum over those seeds. Contact is a dimensionless model proxy, not measured force.

| Condition | Exit width | Old flow (people/s) | Revised flow (people/s) | Revised range | Revised mean clearance (s) | Old → revised mean peak contact |
|---|---:|---:|---:|---:|---:|---:|
| Calm, cooperation 75% | 1.6 m | 3.80 | 1.86 | 1.81–1.89 | 113.0 | 0.16 → 0.03 |
| Urgency 100%, cooperation 100% | 1.6 m | 12.45 | 10.24 | 9.24–10.98 | 25.5 | 1.00 → 1.00 |
| Urgency 100%, cooperation 0% | 1.6 m | 12.45 | 16.16 | 15.53–16.67 | 18.8 | 1.00 → 0.99 |
| Calm, wider exit | 3.2 m | 4.62 | 3.86 | 3.84–3.87 | 58.3 | 0.06 → 0.01 |

## Interpretation

- Without stress exposure and with age variation disabled, below 90% urgency model 2.0 movement is preserved. The user-selected 90%+ emergency regime deliberately weakens yielding and adds forward shoving force. Even high-cooperation runs now develop saturated contact. These high discharge rates are an uncalibrated extreme scenario, not predicted real-world capacity.
- Doubling the calm exit width increased discharge flow in all three seeds. This is a directional check, not a calibration of flow per metre.
- Lower-cooperation emergency runs clear faster in these synthetic runs; both cooperation extremes approach saturated contact. That is compatible with the existence of both faster-is-faster and faster-is-slower regimes in the literature; this suite does not establish that the model quantitatively reproduces either experiment.
- Mean sampled low-density calm speed is approximately 1.22 m/s in the revised runs, versus 0.93 m/s before. Sampling uses moving people below 1/m², after their initial acceleration, during the first 10 seconds. This is not an isolated free-speed calibration.
- Different preferred speeds, planning, exit decisions and cooperation changed together. The before/after comparison cannot isolate the causal contribution of one feature.

## Other verification

Model 2.3 adds static venue normalization. The movement table above remains the model 2.2 benchmark; new layout regressions cover sealed regions, exact wall trimming, diagonal boundaries, reopening, snapshots, empty drafts and runtime casualty separation.

- 88 automated tests pass, including escalating emergency displacement of an inactive person, braking for fallen bodies, head-on passing without contact, queue braking, walls occluding observations, exit-switch hysteresis, group separation, exact staged release, delayed response, and severe-compression retreat at maximum urgency.
- Additional regressions cover age mix and vulnerability, contact-driven displacement, cooperation-dependent aid, occluded casualty awareness, safe assisted recovery, personal stress, arrow commitment and avoiding sign-induced reversals.
- Existing tests cover graph reachability, concave barriers, cyclic signs, full evacuation without stranded walkers, conservation, deterministic seeding, recovery/casualty state accounting, guard metering and a 3,500-person stadium.
- Model 2.0 browser checks covered new controls, saved-run restoration and model labels, Info links, narrow-screen layout and a running 3,500-person stadium. Model 2.2 additionally checks emergency behavior, the age control and saved setting, and browser error logs.

## Practical limits

Three seeds are not a statistical validation campaign. No measured trajectories or held-out evacuation datasets were fitted. The narrowest example here is 1.6 m, wider than several cited experimental doors. Density measurement, disk-shaped bodies, contact coefficients and casualty thresholds remain approximate. Group share, urgency, cooperation, sign compliance and guard capacity have no universal empirical interpretation.

Data: [revised results](results.json), [baseline results](baseline.json). Evidence and precise assumptions: [RESEARCH.md](../RESEARCH.md).
