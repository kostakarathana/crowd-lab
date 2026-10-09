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

Implementation: retain the requested “exit panic” label as a game control, explain its narrow meaning (desired speed and personal-space repulsion), and do not model panic contagion or assert inevitable irrationality. Everyone assumes knowledge of reachable exits. Individual speed variability is included, but assistance, group cohesion, smoke-limited visibility, and route familiarity are not.

## 6. Falls and fatalities: deliberately invented mechanics

No reviewed source supplies a defensible mapping from this toy model's overlaps to death probability. The optional casualty layer is therefore explicitly illustrative. Contact above 0.62 accumulates dose at `4 × (contact − 0.62)` units per simulated second. Otherwise dose decreases by 0.25 units/s, floored at zero. At dose >9 a moving agent falls; continued high contact causes injury at >18 and death at >36. After two continuous seconds with contact <0.25, density <4, and space clear of nearby bodies and walls, fallen agents can stand with a recovery hazard of 0.2/s (0.07/s for injured agents). Injury persists after standing and reduces desired speed to 55%. Continued compression can knock injured agents down again. Death is terminal. Downed/dead agents remain route obstacles; routes refresh within 0.25 s of a fall or recovery. The UI counts current fallen, injured, and dead states separately; exported recoveries count stand-up events. Disabling the layer prevents all health transitions.

These numbers are neither clinical thresholds nor calibrated fatality predictions. They merely let users explore a feedback mechanism: sustained compression can immobilize someone, and an immobile obstruction can affect the surrounding flow. Do not infer real pressure, safe capacity, injury timing, or event safety from these outputs.

## Verification versus validation

Automated tests verify implementation properties: repeatable seeds, accounting of every person, finite state at stadium scale, blocked-route detection, wall containment, width-sensitive evacuation, and the casualty toggle. Browser checks exercise the actual editor, playback, scenarios, saves, export, and responsive layout. These checks do **not** establish real-world predictive validity. Proper validation would require measured trajectories, empirical flow/density relationships, parameter sensitivity, geometry-specific observations, and independent expert review.


## Navigation and exit signs (v1.1)

The 0.5 m navigation grid stores explicit shortest-path successors, not just a local potential gradient. Edges and waypoint shortcuts are checked against walls. Every two seconds, a congestion-weighted route field is rebuilt with fallen/dead people as obstacles. Density is estimated in a 4.5 m neighborhood for routing (separate from the displayed 1 m-radius density). Stalled agents discard their current waypoint and sign commitment, then retry the exit route. A physically sealed enclosure remains unreachable.

User-drawn signs are perceived within 4.5 m of their tail with wall visibility checks. Red visibility polygons and sign perception share the same ray casting against wall thickness; walls occlude the range, while door openings let it through. Following a sign means routing toward its arrowhead, then resuming an exit route. On each eligible encounter, the requested compliance probability is 0.85; noncompliant agents reconsider after a 2–4 second interval. Alternatives have weights `(1 + density)^(-exponent)`, with the exponent decreasing from 2.6 at minimum panic to 0.3 at maximum panic. Thus equal-density signs receive equal odds, while calmer agents have a stronger bias toward less crowded directions. Accepted sign groups are remembered for the run to avoid cycles.

Normal route traversal costs similarly penalize crowding by `0.12 + 3.5 × (1 − urgency)^2`. At panic below 65%, a subset with probability determined by `0.8 × (1 − urgency)^2` may wait in available space before a denser queue. A wait lasts roughly 2–7.2 seconds, with at least two seconds before another wait; physical compression cancels voluntary waiting. The requested behavioral percentages and waiting rules are game parameters, not empirically calibrated psychological claims.


## Security control posts (v1.3)

Placeable guards provide local metering as an illustrative game mechanic. Every 0.25 s they observe wall-visible traffic within 4.5 m and a 5 m-wide corridor along the current exit route. Counts on either side are divided by a nominal 10 m² observation area; this is an approximate control signal, separate from the per-person density measurement. Downstream density above 1.8 or mean contact above 0.35 triggers a hold, which clears below density 1.2 and contact 0.2. Upstream density above 3.2 or mean contact above 0.45 opens the post to relieve its queue.

Capacity is `floor(12 / (1 + 5 × urgency²))`, with a minimum of two people per guard. Overlapping guards assign different people, so staffing adds capacity. Individuals are held at most six seconds, followed by at least two seconds of release; anyone under contact above 0.35 is released immediately. Holding removes desired forward motion but does not freeze bodies or negate crowd forces. Guards remain fixed, non-solid control posts and cannot act through walls. Positions persist through layout saving, restoring, undo, and export. These chosen thresholds and capacities are uncalibrated game rules, not empirically supported staffing ratios or security tactics.


## Escaping compression and remembered caution (v1.4)

Contact above 0.4 builds a distress signal, accelerated by rises relative to a two-second smoothed baseline. A person-specific threshold triggers an attempt to withdraw, interrupts sign following and security holds, and raises caution to at least 0.6 on a 0–1 scale. This can override scheduled departure: someone experiencing compression need not wait for their release time before reacting.

Every roughly 0.6–0.9 seconds, retreating agents search 16 directions at 1.5, 3, and 4.5 m. Targets must have lower estimated crowding and a straight walkable path clear of walls and stationary bodies. Sampled paths with a denser band are rejected. The search can choose a sideways or backward route. No reachable improvement means normal exit routing is retained; the response grants no immunity to contact forces, immobilization, or casualties.

After two seconds with contact below 0.2 and local density below 1.8, people regroup for 2–4 seconds before resuming evacuation. Their lingering caution strengthens congestion costs, biases sign choices away from dense routes, and increases willingness to wait when urgency still allows it. Caution starts fading only after 20 seconds without renewed high contact, at 0.008 per second. A shared cautious route field keeps this tractable at stadium scale. Inspection labels expose the behavior without adding controls.

These are illustrative behavioral rules requested for the simulator, not a calibrated account of human reactions or evidence that escape is always possible. Regression tests separately verify that an open bottleneck crowd can retreat and eventually evacuate, while a sealed overcrowded enclosure can still produce casualties.


## Urgency overrides retreat (v1.6)

The retreat tendency is `clamp((90 − panic) / 60, 0, 1)²`. Each person has a stable individual threshold, so fewer people consider withdrawing as urgency rises: all are eligible at panic 30 or lower, about 25% at 60, about 4% at 78, and none at 90 or higher. Distress still has to cross its existing exposure threshold before an eligible person retreats. Remembered caution and its route-cost penalty are attenuated by the same tendency, so past compression cannot silently override high urgency.

At panic 90 and above, agents no longer voluntarily retreat, regroup, or stand back. Exit routing also drops its density penalty at this level, favoring the shortest traversable route. They still navigate around walls and bodies, follow visible signs, and can be held by security within its panic-dependent capacity. The model retains contact forces and casualties. This requested panic response is a game rule, not a claim about universal real-world emergency behavior.
