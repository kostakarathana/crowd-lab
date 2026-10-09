# Evidence and model decisions

Research reviewed October 9, 2026. Primary research and official crowd-management guidance informed the mechanisms below. This implementation has **not** been calibrated or validated against measured evacuation trajectories or injury outcomes.

## 1. Separate urgency from capacity and arrival demand

The UK Health and Safety Executive describes crowd management across arrival, circulation, and departure. Exit widths, clear routes, queuing space, overflow routes, information, and staged departures affect congestion. This motivates independent controls for exit geometry and the rate at which occupants begin leaving; “panic” is not the sole driver of danger.

Sources: [HSE: Put crowd controls in place](https://www.hse.gov.uk/event-safety/crowd-management-controls.htm); [HSE: Crowd controls inside the venue](https://www.hse.gov.uk/event-safety/crowd-management-control-inside.htm); [HSE: Assess crowd safety risks](https://www.hse.gov.uk/event-safety/crowd-management-assess.htm).

Implementation: variable-width exits, all-at-once or phased activation, walls that can either organize streams or create a choke point. Flow is an observed count of boundary crossings divided by the trailing ten seconds (or elapsed time during the first ten seconds), not an imposed quota. These sources do not validate the simulation's numerical exit capacities.

## 2. Local interactions can create macroscopic bottlenecks

Helbing, Farkas, and Vicsek introduced a generalized social-force evacuation model with desired motion, body contact, and sliding friction. Their model demonstrated arching, clogs, and a possible faster-is-slower effect. This is a qualitative mechanism, not a universal statement that faster walking always reduces throughput.

Sources: [Helbing, Farkas & Vicsek, Nature 407, 487–490 (2000), author preprint](https://arxiv.org/abs/cond-mat/0009448); [Pastor et al., Experimental proof of Faster-is-Slower (2015), author preprint](https://arxiv.org/abs/1507.05110).

Implementation: soft disk repulsion, contact elasticity and tangential friction, with larger forward drive at higher urgency. The toy model can show local crowding and frictional slowdown; no blanket claim is made that its total clearance time must increase monotonically with urgency. The coefficients are chosen for an interactive browser simulation and are not a reproduction of the published model.

## 3. Density and physical pressure are different quantities

Analysis of the 2006 Mina crowd disaster described transitions to stop-and-go and turbulent crowd motion at extreme density. The paper's “crowd pressure” uses density multiplied by local velocity variance. It is distinct from contact force and from density alone.

Source: [Helbing, Johansson & Al-Abideen, Physical Review E 75, 046109 (2007), author preprint](https://arxiv.org/abs/physics/0701203).

Implementation: show local density and a separately labeled **contact index**. Density counts centers within 1 m of each person and divides by π m²; boundary clipping is not corrected, so readings near walls are biased low. Contact sums positive compression terms, divides by 120, clamps to [0, 1], and smooths over time. It has no physical units and is not the 2007 crowd-pressure metric. Charted peak density/contact are maxima over a run; the overlay shows current local values. Density readings are model outputs, not safety thresholds.

## 4. Barriers are not a guaranteed improvement

Human experiments on obstacles near exits found effects that depend on geometry and competitiveness. An obstacle can change pressure or collective motion without shortening evacuation time, and dangerous congestion can move into gaps between the obstacle and the wall. A simulation should not encode a universal reward for adding a column.

Sources: [Feliciani et al., Scientific Reports 10, 15947 (2020)](https://www.nature.com/articles/s41598-020-72733-w); [Zuriguel et al., Safety Science 121, 394–402 (2020)](https://doi.org/10.1016/j.ssci.2019.09.014); [Echeverría-Huarte et al., Physical Review E 102, 012907 (2020)](https://journals.aps.org/pre/abstract/10.1103/PhysRevE.102.012907).

Implementation: arbitrary wall segments feed both navigation and physical contact. Saving run snapshots allows comparison of evacuation count, elapsed time, peak contact, and modeled casualties. There is no built-in “optimal barrier” score or claim of an engineering recommendation.

## 5. People often cooperate in emergencies

Research on the 2005 London bombings found helping to be more common than selfish behavior in survivor accounts. Modern crowd psychology cautions against treating “mass panic” as a default explanation for disaster. Human navigation and social behavior are far more complex than particle motion.

Sources: [Drury, Cocking & Reicher, International Journal of Mass Emergencies & Disasters 27(1), 66–95 (2009)](https://journals.sagepub.com/doi/10.1177/028072700902700104); [Drury, Current Opinion in Psychology 35, 12–16 (2020)](https://www.sciencedirect.com/science/article/pii/S2352250X20300221).

Implementation: retain the requested “exit panic” label as a game control, explain its narrow meaning (desired speed and personal-space repulsion), and do not model panic contagion or assert inevitable irrationality. Everyone assumes knowledge of reachable exits. Individual speed variability is included, but assistance, group cohesion, limited visibility, and route familiarity are not.

## 6. Falls and fatalities: deliberately invented mechanics

No reviewed source supplies a defensible mapping from this toy model's overlaps to death probability. The optional casualty layer is therefore explicitly illustrative. Contact above 0.62 accumulates dose at `4 × (contact − 0.62)` units per simulated second. Otherwise dose decreases by 0.25 units/s, floored at zero. At dose >9 a moving agent falls; at >22 a fallen agent dies. Fallen/dead agents remain obstacles. The UI counts currently fallen agents separately from deaths. Disabling the layer prevents both transitions.

These numbers are neither clinical thresholds nor calibrated fatality predictions. They merely let users explore a feedback mechanism: sustained compression can immobilize someone, and an immobile obstruction can affect the surrounding flow. Do not infer real pressure, safe capacity, injury timing, or event safety from these outputs.

## Verification versus validation

Automated tests verify implementation properties: repeatable seeds, accounting of every person, finite state at stadium scale, blocked-route detection, wall containment, width-sensitive evacuation, and the casualty toggle. Browser checks exercise the actual editor, playback, scenarios, saves, export, and responsive layout. These checks do **not** establish real-world predictive validity. Proper validation would require measured trajectories, empirical flow/density relationships, parameter sensitivity, geometry-specific observations, and independent expert review.
