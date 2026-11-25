# MERIDIAN STATION — Before the First Cut

A standalone 90-second Meridian Station study. It is not a replacement for the *Orbital Tomb* music video and is not a revival of *The Sixth Month* game.

The cut gives the station a working shift before the first irreversible loss: a coupling, a transit/habitation task following Rin and the same cart/tool, a hydroponics handoff, and a routine observation watch. At 00:30, six ten-second chapters begin. The ending returns to the survivor's face and hands at the observation glass after the exterior reveal. There is no dialogue, music, captioning inside the film image, victory state, escape mechanic, or viewer-controlled outcome. Optional sound is a generated, nonverbal machinery hum and is off by default.

## Run it

The published site is static HTML, CSS, ES modules, and Canvas 2D. No runtime CDN, framework, remote font, or third-party runtime request is required.

```sh
npm ci
npm test
npm run frames
npm run build
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`. GitHub Pages serves the same relative `./src/...` paths from the repository subpath. `npm run build` recreates `dist/` and writes `dist/build-info.json` with the checkout SHA, branch, UTC build time, 90-second duration, and chapter count. `dist/` is build output and is intentionally ignored by Git.

## Watching

- **Film** autoplays the fixed 90-second cut. The canvas is the clean film image; player controls sit outside the image. Click the image to play/pause.
- **Inspect** exposes chapter jumps, system selection, a read-only state panel, and split before/after views at the fixed docking, hydroponics, and observation-room cameras.
- **Keyboard:** Space play/pause; Left/Right seek one second; 1–9 jump to the first nine chapters; 0 jumps to Month 6; F/I select Film/Inspect.
- The range control is native and touch-operable. Reduced-effects caps the canvas pixel ratio and reduces decorative particles. Focus-visible outlines are provided.

The viewer changes time/camera only. `stateAt(t)` reconstructs story state from the deterministic 90-second clock; it does not save, randomize, or branch the outcome.

## Implementation map

- `src/sim.js` — authored chapters, fixed IDs for actors/doors/props/modules/landmarks/components, deterministic state and seeded visual points.
- `src/render.js` — state-driven station/interior/chapel art and the three locked match cameras. The 8.7 km ring, spire, lower spine, twelve starting arms, Virgil, and the Chapel's three canted bays/two panes each are held as one repeatable proxy design.
- `src/app.js` — playback, inspection, keyboard/touch controls, reduced-effects setting, optional nonverbal ambience.
- `tests/` — Node state tests and jsdom UI/wiring tests. The jsdom suite is not a substitute for a real browser.
- `tools/render-frames.mjs` — offline pureimage evidence renderer using the production simulation and renderer.
- `evidence/` — individually rendered intact, transition, finale, and same-camera before/after review frames (960×600). These are review stills, not browser screenshots or a rendered video.
- `.github/workflows/pages.yml` — PR validation; gated static build and official Pages artifact/deploy actions on `main` or manual dispatch.

## Validation boundaries

The committed source contains clean, hand-authored vector proxies rather than imported production models or plates. The offline pureimage renderer exercises the actual simulation/rendering code, but it is not Chromium and its pixel output is not browser certification. Browser download is blocked in the build sandbox; therefore a real-browser visual pass, deployed-URL interaction smoke, tablet-hardware pass, and the requested desktop frame-time percentile have not been certified. See [ASSET_RECEIPT.md](ASSET_RECEIPT.md) and [VALIDATION.md](VALIDATION.md) for precise asset and test limits.
