# MERIDIAN STATION — Before the First Cut

A standalone 90-second Meridian Station film study. It is not a replacement for the *Orbital Tomb* music video and is not a revival of *The Sixth Month* game.

The cut gives the station a working shift before the first irreversible loss: docking and transit, a habitat task following Rin and the same cart/tool, a hydroponics handoff, and a routine observation watch. At exactly 00:30, six continuous ten-second M1–M6 chapters begin. Three in-film same-camera damage cuts land at 00:30, 00:40, and 01:00. M6 opens on the survivor's face and both hands at the glass, crosses the window to reveal Meridian, Virgil, and Tiger, then returns to the identical hands frame. There is no dialogue, music, film-image captioning, victory state, escape mechanic, or viewer-controlled outcome. Optional sound is generated nonverbal machinery ambience and is off by default.

The optional **Last Shift** mode is an after-film, read-only comparison. It samples historical frames from the same `stateAt(t)` simulation without advancing or mutating the film clock. Its comparisons include the intact/Month 1 dock-route states, hydroponics Month 0/Month 4, and the recurring Observation Glass beats. The route diagram is a normalized local-plan schematic informed by a Blender first-slice clearance study—not a surveyed whole-station map or proof of Unreal/player traversal.

## Run it

The published page is static HTML, CSS, ES modules, and Canvas 2D. It has no runtime CDN, framework, remote font, or third-party runtime request.

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
- **Inspect** exposes chapter jumps, physical-system selection, a read-only deterministic state panel, and three fixed before/after cameras (docking, hydroponics, and observation room).
- **The Last Shift** compares the same camera at an intact frame and selected historical month. Wide layouts use a divider; narrow layouts switch panes. Month changes reconstruct existing film states. The dock route map is explicitly schematic, and the bypass marker is a route-state illustration—not a navigation test.
- **Keyboard:** Space play/pause; Left/Right step one second; 1–9 jump to the first nine chapters; 0 jumps to M6; F/I select Film/Inspect.
- The range control is native and touch-operable. Reduced effects cap the Canvas pixel ratio and reduce decorative motion. Focus-visible outlines are provided.

The viewer can change time and camera only. `stateAt(t)` reconstructs the same story state for every seek order; no control branches or mutates the outcome.

## Implementation map

- `src/sim.js` — fixed 90-second clock, six monthly chapters, explicit station geometry, persistent entity/component IDs, deterministic system state, and seeded visual points.
- `src/cameras.js` — authored shot cues, three fixed inspection views, and the three tested in-film same-camera cuts.
- `src/render.js` — bounded, state-driven station/interior/Chapel art and M6's glass-to-exterior sequence. Component identities remain attached, detached, in transit, and placed in named bloom sectors.
- `src/last-shift.js` and `src/last-shift-render.js` — read-only historical sampling and matched comparison views; the normalized dock/bypass diagram is scoped to a local first-slice study, not whole-station or Unreal navigation.
- `src/app.js` — playback, inspection, keyboard/touch controls, the Last Shift clock freeze/restore, reduced effects, optional nonverbal ambience, and bounded frame metrics.
- `tests/` — deterministic state coverage and jsdom UI/wiring checks. Route tests verify normalized illustration and simulation flags only; jsdom is not Chromium or traversal certification.
- `tools/render-frames.mjs` — offline pureimage evidence renderer using the production simulation and renderer.
- `tools/browser-smoke.mjs` — Playwright Chromium interaction, subpath, frame-identity, timing, touch-emulation, and planned Last Shift checks.
- `evidence/` — 28 individual offline review stills, including the six before/after frames for the three match cuts and three inspection-camera comparisons. They are not browser captures or a rendered video; no Last Shift browser walkthrough has been captured.
- `.github/workflows/pages.yml` — configured PR Chromium validation, followed on `main` by Pages deployment and a live URL/build-SHA/browser smoke check. A configured check is not a passing Actions result.

## Validation and asset limits

On 2026-11-25, the local `npm test` suite passed **35/35**; `npm run frames` rendered 28 offline pureimage stills and confirmed identical M6 opening/return-hands frames; syntax checks, `npm run build`, `npm run check:build` (10 files, 10 chapters), and `git diff --check` passed. The local build stamp reports baseline HEAD `85a06aa4b2129c39344183990cdfc5cf22a0f2ae`; it is not a release build of this dirty checkout. Pureimage stills do not certify browser playback.

A previous local end-to-end attempt stopped before page launch because Playwright's Chromium executable was absent. No real-browser visual pass, frame-time result, live-interaction claim, or physical-device test is being made for these changes. Tablet-sized checks are software emulation only. All art is original 2D proxy work; likeness and final-plate fidelity remain unverified. See [ASSET_RECEIPT.md](ASSET_RECEIPT.md) and [VALIDATION.md](VALIDATION.md).
