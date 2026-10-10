# Crowd Lab

A browser-based crowd evacuation sandbox. Draw walls, place exits, release a crowd, and compare flow with local compression. Built as a static GitHub Pages site, with no framework, runtime dependencies, or server-side data collection.

## Use

- Choose Exhibition hall, Concert rush, Stadium dispersal, or Concourse squeeze.
- Adjust population, exit urgency, departure staging, exit width, cooperation, age variation, companion groups, contact friction, speed variation, casualty modeling, and random seed.
- Drag with the wall tool to add barriers. Hold Shift for 45° snapping.
- Drag with the exit-arrow tool (**A**) to guide people toward a destination. Red signs show a 4.5 m visibility area clipped by walls. About 85% follow per encounter; conflicting signs favor less crowded routes, or split evenly at equal density. Erase and undo also work on arrows.
- Press **S** and click to place security. Guards meter approaching crowds, release when space opens, and ease off if their queue compresses. Higher panic reduces each guard’s capacity; nearby guards share the load. Erase, bin, undo, saved layouts, and exports include guards.
- Click the outer boundary with the exit tool to add a door. Erase works on walls and exits; undo restores geometry.
- Use People, Contact, or Density views. Hover a person for details. Scroll to zoom or drag with the inspect tool to pan.
- Release/pause, reset, or run at 1×, 2×, or 4×. Actual simulation time is displayed; slower devices may not achieve the requested multiplier.
- Save up to eight run snapshots locally, restore their layouts/settings, or export JSON including per-second metrics.
- Read **Info** for primary sources, model definitions, limitations, and shortcuts.

Setup and layout edits restart the crowd. Saved runs are snapshots, not resumable physics states. Sustained or rising compression can make people seek open space, regroup, and remember the experience with stronger crowd avoidance that slowly fades. Urgency reduces retreat without erasing self-preservation: severe sustained compression can trigger escape at any setting. Cooperation sets individual courtesy. At 90%+ urgency, an extreme emergency regime overrides some yielding and increases shoving against people ahead, producing contact-driven displacement and compression. This threshold is a sandbox choice, not a universal claim about emergencies. Security gives retreating people priority to move away. Calm people favor less crowded routes and some wait briefly before entering a dense queue; urgency reduces both behaviors. People anticipate collisions, brake for queues and remember visible exit congestion before changing routes. Nearby companions loosely stay together. Age variation adds children and older adults with seeded differences in size, speed, strength and compression susceptibility. Cooperative people attempt bounded, wall-visible aid; nearby helpers improve recovery only after relief and with room to stand. Personal stress rises rapidly with compression, injury and visible casualties, reducing waiting, queue comparison and helping. Dead casualties can be checked but never revived. Arrow followers retain direction through short queues and commit to the indicated exit instead of immediately turning back at the arrow tip. The optional varied response pattern adds bounded departure delays. Navigation replans around stationary casualties and remembers signs to prevent endless loops. A fixed seed reproduces a run for the same geometry and settings; changing geometry can change spawn positions. Staged departures activate people already present in the room, not new arrivals from outside. Sealed design regions become solid space: people respawn only where they can reach an exit, hidden wall segments are removed, and exposed cuts become exterior boundaries. Undo restores the previous layout; erasing a boundary or adding an exit can reopen floor. With no reachable floor, the draft stays empty and editable. Casualties during a run never trigger this design cleanup. On very restricted layouts, the available spawn cells can limit the actual population; the denominator in the evacuated statistic shows the actual number simulated.

## Run locally

From this folder, run `python3 -m http.server 4173` and open `http://localhost:4173`. JavaScript ES modules require an HTTP server, so opening `index.html` as a file is insufficient. Run tests with `node --test tests/*.test.js` on Node 22 or newer. No install or build is required. Fonts load from Google Fonts with local system fallbacks.

## Publish

Push to `main` with GitHub Pages configured to use **GitHub Actions**. `.github/workflows/pages.yml` tests the engine, packages only public site files, and deploys. Relative asset URLs support repository subpaths. There are no credentials or environment variables in the site.

## Model

See [RESEARCH.md](RESEARCH.md) for the evidence review and implementation choices. The engine uses fixed 25 ms steps, a spatial hash for near-neighbor forces, a 0.5 m Dijkstra route field, soft disk contact and tangential friction, and hard wall containment. Agent radii are 0.215–0.25 m; people are drawn as overhead figures with movement-driven walking animation; physics still uses disks. Nominal desired speed ranges from 1.3 to 3.5 m/s before individual variation. The layered decision system in `behavior.js` is a local agent planner, not a trained neural network. These values and the simplified force coefficients are illustrative, not a calibrated parameter set from a paper.

**This is an exploratory toy model, not evacuation engineering software.** Contact scores are normalized model values, not measured force or clinical risk. Fall/injury/death thresholds are invented exposure rules and must not be used to estimate real casualties. There is no claim that a barrier arrangement shown here is safe for a real venue.

## Structure

- `engine.js`: browser-independent physics, congestion-aware routing, sign encounters, waiting, and reproducible seeding.
- `behavior.js`: collision anticipation, headway, individual traits, companions, response delays and exit-choice memory.
- `navigation.js`: clearance-checked Dijkstra graph, waypoint shortcuts, dynamic obstacles, weighted arrow choices.
- `escape.js`: rising-compression response, visible open-space search, regrouping, and lingering caution.
- `security.js`: visible congestion sensing, shared guard capacity, bounded holds, and queue relief.
- `health.js`: recovery, injury, and prolonged exposure states.
- `visibility.js`: shared wall-clipped sign perception and range polygons.
- `people.js`: cached overhead people, motion-driven gait, and downed poses.
- `app.js`: canvas rendering, editor, controls, charts, persistence, export.
- `index.html` / `style.css`: responsive, keyboard-operable interface and cited research notes.
- `tests/engine.test.js`: route reachability, containment, conservation, deterministic replay, casualty behavior, and exit-width experiment.

## Research and benchmarks

The [23-paper evidence review](RESEARCH.md) distinguishes examined methods/results from abstract-only sources, and identifies the exact simplifications used. [Benchmark results](benchmarks/RESULTS.md) compare three seeds with the preceding revision. Reproduce them using `node benchmarks/run.js ./engine.js benchmarks/results.json`. These synthetic checks are not empirical validation.
