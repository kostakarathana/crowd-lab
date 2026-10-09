# Crowd Lab

A browser-based crowd evacuation sandbox. Draw walls, place exits, release a crowd, and compare flow with local compression. Built as a static GitHub Pages site, with no framework, runtime dependencies, or server-side data collection.

## Use

- Choose Exhibition hall, Concert rush, Stadium dispersal, or Concourse squeeze.
- Adjust population, exit panic, departure staging, exit width, contact friction, speed variation, casualty modeling, and random seed.
- Drag with the wall tool to add barriers. Hold Shift for 45° snapping.
- Click the outer boundary with the exit tool to add a door. Erase works on walls and exits; undo restores geometry.
- Use People, Contact, or Density views. Hover a person for details. Scroll to zoom or drag with the inspect tool to pan.
- Release/pause, reset, or run at 1×, 2×, or 4×. Actual simulation time is displayed; slower devices may not achieve the requested multiplier.
- Save up to eight run snapshots locally, restore their layouts/settings, or export JSON including per-second metrics.
- Read **Info** for primary sources, model definitions, limitations, and shortcuts.

Setup and layout edits restart the crowd. Saved runs are snapshots, not resumable physics states. A fixed seed reproduces a run for the same geometry and settings; changing geometry can change spawn positions. Staged departures activate people already present in the room, not new arrivals from outside. On very restricted layouts, the available spawn cells can limit the actual population; the denominator in the evacuated statistic shows the actual number simulated.

## Run locally

From this folder, run `python3 -m http.server 4173` and open `http://localhost:4173`. JavaScript ES modules require an HTTP server, so opening `index.html` as a file is insufficient. Run tests with `node --test tests/*.test.js` on Node 22 or newer. No install or build is required. Fonts load from Google Fonts with local system fallbacks.

## Publish

Push to `main` with GitHub Pages configured to use **GitHub Actions**. `.github/workflows/pages.yml` tests the engine, packages only public site files, and deploys. Relative asset URLs support repository subpaths. There are no credentials or environment variables in the site.

## Model

See [RESEARCH.md](RESEARCH.md) for the evidence review and implementation choices. The engine uses fixed 25 ms steps, a spatial hash for near-neighbor forces, a 0.5 m Dijkstra route field, soft disk contact and tangential friction, and hard wall containment. Agent radii are 0.215–0.25 m; the circles are drawn slightly smaller for readability. Desired speed ranges from 0.95 to 4.45 m/s before individual variation. These values and the simplified force coefficients are illustrative, not a calibrated parameter set from a paper.

**This is an exploratory toy model, not evacuation engineering software.** Contact scores are normalized model values, not measured force or clinical risk. Fall/death thresholds are invented exposure rules and must not be used to estimate real casualties. There is no claim that a barrier arrangement shown here is safe for a real venue.

## Structure

- `engine.js`: browser-independent simulation, geometry, route field, reproducible seeding.
- `app.js`: canvas rendering, editor, controls, charts, persistence, export.
- `index.html` / `style.css`: responsive, keyboard-operable interface and cited research notes.
- `tests/engine.test.js`: route reachability, containment, conservation, deterministic replay, casualty behavior, and exit-width experiment.
