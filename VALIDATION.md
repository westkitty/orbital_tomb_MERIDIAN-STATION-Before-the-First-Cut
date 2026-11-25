# Validation record

## Baseline

The recovered upstream baseline was commit `13670c4eec0c392b11c41081baaa7bbfbaa24199` (`Initial commit`). It contained no prior runnable Meridian site, renderer, tests, or Pages workflow to preserve. This branch is the first implementation; no unrelated upstream build was overwritten.

## Reproducible local checks

Run with Node 22 and the lockfile:

```sh
npm ci
npm test
npm run frames
npm run build
node tools/check-build.mjs
```

The current Node runner contains 23 tests. The state suite checks the 90-second/30-second cut line, 29.9 vs 30.0, twelve intact arms before M1, monotonic scars, route/seal/light consequences, stable entity/component IDs, landmarks, finale order, and complete-state hashes after reordered seeks. The jsdom suite exercises player wiring, keyboard controls, chapter/system/before-after controls, range input at an emulated tablet-sized viewport, the subpath-safe source URLs, all chapter/finale boundaries, and a simulated 90-second playback/replay. jsdom does not execute the page in Chromium and an emulated viewport is not a tablet hardware pass.

`npm run frames` renders 19 individual 960×600 stills by running the same `sim.js` and `render.js` through pureimage; the script also asserts that M6's opening and return-hands frames are pixel-identical. The evidence set covers intact docking/interior/hydroponics/observation; M1 peel, seal/cart and detached arm; M2 Hesh; M3 return lane; M4 hydroponics breach; M5 placement/arrangement; the four M6 beats; and three matched before/after cameras. Pureimage output is an offline approximation, not a browser-rendered frame. The stills do not certify the moving composition or timing.

The Actions workflow runs `npm ci`, `npm test`, `npm run frames`, a clean static build, and the `build-info.json`/asset-path check for pull requests; only a non-PR run deploys the validated `dist/` artifact with the official GitHub Pages actions. The served `build-info.json` is the release-SHA proof. CI output and the Pages deployment status are authoritative for the release commit.

## Not certified in this sandbox

- No downloadable/system Chromium or Firefox is available; the Playwright Chromium CDN is blocked. A real-browser visual pass and live interactive smoke test (start, jump to Month 6, replay) have **not** been executed.
- Preview-hardware timing was not measured. The target of 95% of frames under 33 ms on desktop is **not measured**, not passed.
- No physical tablet was tested. The jsdom viewport/input check is software-only.
- No frame in `evidence/` is a browser capture or video; Canvas 2D implementations may rasterize differently by browser.
- The visual and likeness limitations listed in [ASSET_RECEIPT.md](ASSET_RECEIPT.md) remain open.
