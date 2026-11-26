# MERIDIAN STATION — Before the First Cut

A standalone 90-second Meridian Station film study. It is not a replacement for the *Orbital Tomb* music video and is not a revival of *The Sixth Month* game.

The cut gives the station a working shift before the first irreversible loss: docking and transit, a habitat task following Rin and the same cart/tool, a hydroponics handoff, and a routine observation watch. Mara and Rin pass behind the center Observation Glass on one shared, persistent track; the same pair returns on it during M3 as the survivor shifts from work to noticing, then watches their return. Inspect mode offers two camera-only attention studies without changing the canonical Film cut. At exactly 00:30, six continuous ten-second M1–M6 chapters begin. Three in-film same-camera damage cuts land at 00:30, 00:40, and 01:00. M6 opens on the survivor's face and both hands at the glass, crosses the window to reveal Meridian, Virgil, and Tiger, then returns to the identical hands frame. There is no dialogue, music, film-image captioning, victory state, escape mechanic, or viewer-controlled outcome. Optional sound is generated nonverbal machinery ambience and is off by default.

The optional **Last Shift** mode is an after-film, read-only comparison. It samples historical frames from the same `stateAt(t)` simulation without advancing or mutating the film clock. Its comparisons include the intact/Month 1 dock-route states, hydroponics Month 0/Month 4, and the recurring Observation Glass beats. The route diagram is a normalized local-plan schematic informed by a Blender first-slice clearance study—not a surveyed whole-station map or proof of Unreal/player traversal.

## Run it

The published page is static HTML, CSS, and ES modules. Film and Inspect use a Three.js WebGL scene with bundled local modules and the MIT license notice; a Canvas 2D renderer remains as a compatibility fallback, and The Last Shift uses its own Canvas 2D comparison renderer. There is no runtime CDN, remote font, or third-party network request.

```sh
npm ci
npm test
npm run frames
npm run build
npm run check:build
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. `npm run build` recreates ignored `dist/` and writes `dist/build-info.json` with the checked-out commit SHA, branch, build time, duration, and chapter count. GitHub Pages serves the same relative assets from the repository subpath:

<https://westkitty.github.io/orbital_tomb_MERIDIAN-STATION-Before-the-First-Cut/>

For a real Chromium check, install the matching Playwright browser and run `npm run test:e2e` (CI performs the browser install). The script exercises playback, chapters, exact damage boundaries, all three match-camera pairs, read-only inspection, tablet-sized touch emulation, M6 frame identity, replay, console/network errors, and real requestAnimationFrame timing. `npm run smoke:live` additionally accepts `MERIDIAN_BASE_URL` and `EXPECTED_SHA` to verify the live build stamp before interaction checks.

## Watching

- **Film** plays the fixed 90-second cut. The Canvas contains the clean film image and its letterboxing; player controls remain outside it. Click the image to play/pause.
- **Inspect** exposes chapter jumps, physical-system selection, a read-only deterministic state panel, three fixed before/after cameras (docking, hydroponics, and observation room), and an Inspect-only A/B selector for survivor-first versus audience-first attention around the glass crossing. The selector changes only the camera and cannot affect Film playback.
- **The Last Shift** compares the same camera at an intact frame and selected historical month. Wide layouts use a divider; narrow layouts switch panes. Month changes reconstruct existing film states. The dock route map is explicitly schematic, and the bypass marker is a route-state illustration—not a navigation test.
- **Keyboard:** Space play/pause; Left/Right step one second; 1–9 jump to the first nine chapters; 0 jumps to M6; F/I select Film/Inspect.
- The range control is native and touch-operable. Reduced effects cap the Canvas pixel ratio and reduce decorative motion. Focus-visible outlines are provided.

The viewer can change time and camera only. `stateAt(t)` reconstructs the same story state for every seek order; no control branches or mutates the outcome.

## Implementation map

- `src/sim.js` — fixed 90-second clock, six monthly chapters, explicit station geometry, persistent entity/component IDs, deterministic system state, seeded visual points, and the shared Mara/Rin Observation Glass track.
- `src/cameras.js` and `src/cameras3d.js` — authored 2D/3D shot cues, fixed inspection views, tested same-camera damage cuts, and review-only attention framing.
- `src/scene3d.js` — editable Three.js station, hydroponics, Chapel, crew, Tiger, and Virgil proxy meshes, animated from the deterministic simulation. These are authored substitutes, not imported or canon-certified production models.
- `src/render.js` — Canvas 2D compatibility fallback for browsers where WebGL is unavailable.
- `src/last-shift.js` and `src/last-shift-render.js` — read-only historical sampling and matched Canvas 2D comparison views; the normalized dock/bypass diagram is scoped to a local first-slice study, not whole-station or Unreal navigation.
- `src/app.js` — playback, inspection (including camera-only A/B review), keyboard/touch controls, the Last Shift clock freeze/restore, reduced effects, optional nonverbal ambience, and bounded frame metrics.
- `tests/` — deterministic state coverage and jsdom UI/wiring checks. Route tests verify normalized illustration and simulation flags only; jsdom is not Chromium or traversal certification.
- `tools/render-frames.mjs` — offline pureimage evidence renderer using the production simulation and renderer.
- `tools/browser-smoke.mjs` — Playwright Chromium interaction, subpath, settled frame-identity, timing, touch-emulation, and Last Shift walkthrough checks.
- `evidence/` — 32 individual 960×600 offline review stills, including the three match-cut pairs, Observation Glass service cut, and attention framings. `evidence/cinematic3d/threejs-r187-*.webm` are real-browser canvas excerpts from the current Three.js scene; `baseline-*.webm` are earlier 2D captures. The current excerpts use software WebGL in this sandbox and are visual references, not smooth-playback evidence. The Playwright smoke also writes ignored browser captures and a Last Shift walkthrough under `artifacts/browser/`.
- `.github/workflows/pages.yml` — configured PR Chromium validation, followed on `main` by Pages deployment and a live URL/build-SHA/browser smoke check. A configured check is not a passing Actions result.

## Validation and asset limits

On 2026-11-26, `npm test` passed **42/42**; `npm run frames` rendered **32** offline pureimage review stills and confirmed pixel-identical M6 opening/return-hands frames; `npm run build`, `npm run check:build` (**15 files, 10 chapters**), and `git diff --check` passed. The full local `npm run test:e2e` passed in headless Chromium 158.0.8127.0: 20 browser review frames, 0 console/HTTP errors, and 0 failed requests. It exercised the recurring crossings, camera-only attention variants, hydro handoff/service continuity, match cuts, exact M6 hand-frame identity, tablet-sized emulation, and Last Shift glass beats. Chromium provided WebGL through the SwiftShader software renderer; active-playback p95 RAF was **883.4 ms**, so the `<33 ms` hardware frame-rate target is explicitly **not certified** by this software-only run. Synchronous render work p95 was 5.5 ms; this does not include GPU completion/presentation time. Last Shift selected its accessible single-pane fallback; its dual-pane path is not certified. Browser screenshots, metrics, the Last Shift walkthrough, and refreshed hydro probes are ignored review artifacts under `artifacts/browser/` and `artifacts/3d-probe/`.

The local build stamp records Git HEAD at build time; a local artifact built from a dirty tree is not a release identity. GitHub Pages is configured for workflow-based deployment, and the workflow's live smoke verifies the served SHA. Tablet-sized checks are software emulation only. All art is original 2D/3D proxy work; likeness and final-plate fidelity remain unverified. The headless SwiftShader frame-rate result is not a hardware performance claim. See [ASSET_RECEIPT.md](ASSET_RECEIPT.md) and [VALIDATION.md](VALIDATION.md).
