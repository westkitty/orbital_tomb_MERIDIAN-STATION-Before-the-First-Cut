# Validation record

## Recovered baseline and release state

Work is on `arena/9503dac7-orbital-tomb-meridian-station`, branched from merged `main` commit `85a06aa4b2129c39344183990cdfc5cf22a0f2ae` (PR #1). The previously recorded Pages deployment is Actions run `45622494428` for that baseline SHA. This working tree is still uncommitted; no PR, new deployment, or served-SHA proof has been observed for these changes.

## Local checks run on 2026-11-25

- `npm test` — **35 passed, 0 failed**. Coverage includes the fixed 90-second timeline and exact 00:30 transition; deterministic state hashes under reordered seeks; persistent damage/IDs; Month 0 and later-state Last Shift comparisons; Month 4 hydroponics; recurring Observation Glass beats; frozen/restored film-clock behavior; accessible narrow-layout controls; and jsdom SVG route-state wiring.
- `npm run frames` — **28** individual 960×600 pureimage stills rendered; the script confirmed the M6 opening and return-hands frames are pixel-identical. These are offline renders, not browser captures or video.
- `node --check` passed for `src/last-shift.js`, `src/last-shift-render.js`, `src/app.js`, `tests/last-shift.test.mjs`, and `tests/browser.test.mjs`.
- `npm run build` and `npm run check:build` passed. The checker reports **10 files, 10 chapters**, SHA `85a06aa4b2129c39344183990cdfc5cf22a0f2ae`.
- `git diff --check` passed.

The local build stamp reflects baseline `git HEAD`, not the dirty working tree; it is not a release artifact. The deploy artifact must be rebuilt from the eventual release commit.

## Last Shift geometry and evidence limits

The optional comparison samples the existing deterministic `stateAt(t)` simulation and does not mutate or advance the film clock. Tests cover the state flags and the normalized route illustration. The route map was compared with the authored First Slice plan shape and depicts an intact center route, the dock spur, the M1 detour, and the pressure closure. It remains a **normalized local-plan schematic**, not a surveyed whole-station coordinate frame. The Blender collision-ray evidence is not Unreal execution, navmesh proof, capsule-clearance proof, or human traversal. The source simulation's route flags and these tests do not certify physical navigation. The alcove waypoint is omitted because the referenced layout variants disagree there. Private Drive files/assets were not copied into or modified in the repository.

Month 0 hydroponics and Observation Glass comparisons, Month 4 hydroponics at 63.9s, recurring Month 3 glass at 56s, and Month 6 crossing/bloom/return beats are reconstructed from their actual film states. The comparison still uses a fixed matched view; its presentational animation does not create another world simulation.

## Real browser, performance, evidence capture, and devices

Playwright is a locked development dependency. A previous local `npm run test:e2e` attempt stopped before page launch because the expected Chromium executable was absent, and the browser download was blocked. No real-browser pass or Last Shift browser walkthrough/capture was run for this update. No local frame-time result, live-site interaction, release check, or physical-device test is claimed. Tablet-sized checks are software emulation, not hardware testing.

The Pages workflow is configured to install Chromium, smoke-test the built artifact before deployment, and verify the deployed SHA and live experience afterward. Those steps are configuration only until an Actions run is observed; the prior successful Pages run applies only to the baseline SHA.

## Asset and visual limits

The visuals are hand-authored 2D proxies, not source-model or plate reconstructions. Exact station surface motifs and 3D geometry, approved crew/survivor likenesses, Tiger silhouette details, Chapel material/light response, and finale plate/camera fidelity remain unverified. No private Drive binary, signed link, `.blend`/`.fbx`, or production audio ships. See [ASSET_RECEIPT.md](ASSET_RECEIPT.md) for the full asset limits.
