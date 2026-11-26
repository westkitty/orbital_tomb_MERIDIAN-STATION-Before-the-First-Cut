# Validation record

## Branch and release state

Work is on `arena/9503dac7-orbital-tomb-meridian-station`, branched from `main` at `85a06aa4b2129c39344183990cdfc5cf22a0f2ae`. The existing checkpoint is `c691fc9f285fb8b935e21998ffb9d417fbefb33d`. GitHub Pages is configured for workflow deployment at the project URL; the workflow rebuilds from the selected commit and its live-smoke job checks the served SHA.

## Local checks run on 2026-11-26

- `npm test` — **42 passed, 0 failed**. Coverage includes the deterministic 90-second timeline and damage cuts; persistent world IDs; recurring Mara/Rin Observation Glass tracks and survivor attention; camera-variant isolation; hydro and named-component continuity; M6 sequence; 3D camera framing and match-cut continuity; Last Shift reconstruction; and jsdom UI wiring.
- `npm run frames` — **32** individual 960×600 pureimage stills rendered. The offline renderer confirmed pixel-identical M6 opening/return-hands frames. Evidence includes the Observation Glass service cut and both Inspect-only attention framings; these are offline 2D review stills, not 3D browser captures or video.
- `npm run build` and `npm run check:build` — passed; **15 files, 10 chapters**. The artifact includes both bundled Three.js modules, their MIT license notice, and no remote runtime assets. The local pre-commit build stamp was `c691fc9f285fb8b935e21998ffb9d417fbefb33d`; the Pages workflow rebuilds and stamps the pushed commit.
- `git diff --check` — passed.

## Full Chromium smoke

`npm run test:e2e` completed against the locally built site served from its repository subpath. Headless Chromium **158.0.8127.0** at 1440×900 passed the complete interaction and capture run: 20 browser review frames, no console/HTTP errors, and no failed asset requests. It exercised the camera-only attention variants without changing the world-state hash, opening and recurring crossings, hydro handoff/service continuity, all three authored match cuts, exact M6 opening/return-hand frame equality, replay, tablet-sized touch emulation, and the Last Shift comparison walkthrough. A focused WebGL probe refreshed hydro captures at 00:18, 01:03.9, 01:04, and 01:06 under `artifacts/3d-probe/hydro-latest-*.png`; the observed states progressed from tended rack to rupture, detachment, and drift.

This sandbox's WebGL backend is **ANGLE/SwiftShader software rendering**, not a hardware GPU. The active-playback probe sampled 9 frame intervals; p95 RAF was **883.4 ms** and p95 JavaScript-side synchronous render work was **5.5 ms**. GPU completion/presentation time is not included in that render-work metric. The smoke records the backend and deliberately marks the `<33 ms` hardware frame-rate goal **not certified** on software WebGL; hardware-backed runs still enforce it. This result is not a claim about physical-device performance. The Last Shift chose its accessible single-pane fallback; its optional dual-pane path is not certified. Tablet checks are software emulation only.

Chromium's reused Canvas backing store can produce a transient raster difference during the first redraws, so the M6 identity check compares the settled image after three synchronous redraws; it passed pixel-identically. The Month 0 matched-pane test allows a strict raster tolerance (≤0.1% changed pixels and max channel delta ≤3). The browser smoke generated ignored screenshots, metrics, and `artifacts/browser/browser-last-shift-dock-walkthrough.webm`. Separate Chromium MediaRecorder captures in `evidence/cinematic3d/threejs-r187-*.webm` are excerpts from the current 3D canvas; their SwiftShader pacing is not hardware performance evidence. The hydro probes are ignored review artifacts, not release assets.

## Last Shift geometry and evidence limits

The optional comparison samples the existing deterministic `stateAt(t)` simulation and does not mutate or advance the film clock. Tests and the browser smoke cover the state flags, normalized route illustration, hydroponics Month 0/Month 4, and Observation Glass Month 0/Month 3/Month 6 beats. The route map depicts an intact center route, dock spur, M1 detour, and pressure closure, informed by the authored First Slice plan shape. It remains a **normalized local-plan schematic**, not a surveyed whole-station coordinate frame. The Blender collision-ray evidence is not Unreal execution, navmesh proof, capsule-clearance proof, or human traversal. The source simulation's route flags and these tests do not certify physical navigation. The disputed alcove waypoint remains omitted because referenced layout variants disagree there. Private Drive files and approved reference images remain private and were not copied into public output.

## Asset and visual limits

The visuals use original hand-authored 2D illustrations and editable Three.js proxy meshes; neither is a source-model or plate reconstruction. Exact station surface motifs and 3D asset geometry, approved crew/survivor likenesses, Tiger silhouette details, Chapel material/light response, and finale plate/camera fidelity remain unverified. No private Drive binary, signed link, `.blend`/`.fbx`, or production audio ships.

The Pages workflow validates pull requests, deploys from `main`, and supports explicit `workflow_dispatch`; its final live-smoke job checks the published build stamp before reporting a deployment as verified. See the workflow run and [ASSET_RECEIPT.md](ASSET_RECEIPT.md) for release status and asset limits.
