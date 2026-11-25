// Authored camera/shot language. This module is deliberately separate from the
// deterministic world state in sim.js and the Canvas renderer in render.js.

const locked = (camera) => Object.freeze(camera);

export const CAMERAS = Object.freeze({
  docking: locked({
    id: 'cam.docking', label: 'Docking socket', scene: 'exterior',
    intactT: 6, damagedT: 36, centerX: 0.53, focusY: 0.34, zoom: 1.35, rotation: 0.28,
  }),
  hydro: locked({
    id: 'cam.hydro', label: 'Hydroponics', scene: 'hydro',
    intactT: 18, damagedT: 66, centerX: 0.5, focusY: 0.5, zoom: 1,
  }),
  chapel: locked({
    id: 'cam.chapel', label: 'Observation room', scene: 'chapel',
    intactT: 26, damagedT: 84, centerX: 0.5, focusY: 0.5, zoom: 1,
  }),
});

// Normalized camera targets use the same 0..1 coordinate space as the scene.
// Three explicit match cuts reuse the *exact* camera at each damage boundary:
// the intact image at 29.9/39.9/59.9 is held into M1/M2/M4 at 30/40/60.
const cues = [
  { id: 'dock-wide', start: 0, end: 2, scene: 'exterior', from: [1, .5, .5, 0], to: [1.02, .49, .5, 0] },
  { id: 'dock-coupling', start: 2, end: 8, scene: 'exterior', from: [1.02, .49, .5, 0], to: [1.45, .40, .31, 0] },
  { id: 'transit-follow', start: 8, end: 14, scene: 'interior', from: [1.06, .5, .53, 0], to: [1.12, .54, .53, 0] },
  { id: 'hydroponic-handoff', start: 14, end: 20, scene: 'hydro', from: [1.02, .5, .5, 0], to: [1.08, .48, .52, 0] },
  { id: 'routine-watch', start: 20, end: 28, scene: 'chapel', from: [1.02, .5, .5, 0], to: [1.06, .5, .47, 0] },
  { id: 'm1-match-setup', start: 28, end: 30, scene: 'exterior', from: [1.45, .40, .31, 0], to: [1.45, .40, .31, 0] },
  { id: 'arm01-peel', start: 30, end: 34, scene: 'exterior', from: [1.45, .40, .31, 0], to: [1.45, .40, .31, 0] },
  { id: 'pressure-reroute', start: 34, end: 38, scene: 'interior', from: [1.04, .5, .5, 0], to: [1.08, .5, .5, 0] },
  { id: 'empty-socket', start: 38, end: 39.2, scene: 'exterior', from: [1.45, .40, .31, 0], to: [1.34, .5, .35, 0] },
  { id: 'm2-match-setup', start: 39.2, end: 40, scene: 'exterior', from: [1.34, .5, .35, 0], to: [1.34, .5, .35, 0] },
  { id: 'segment02-peel', start: 40, end: 44, scene: 'exterior', from: [1.34, .5, .35, 0], to: [1.34, .5, .35, 0] },
  { id: 'relay-section', start: 44, end: 50, scene: 'exterior', from: [1.34, .5, .35, 0], to: [1.02, .46, .5, 0] },
  { id: 'same-viewport-lane', start: 50, end: 58, scene: 'viewport-lane', from: [1.04, .5, .5, 0], to: [1.07, .5, .5, 0] },
  { id: 'm4-match-setup', start: 58, end: 60, scene: 'hydro', from: [1.35, .35, .52, 0], to: [1.35, .35, .52, 0] },
  { id: 'hydroponic-breach', start: 60, end: 64, scene: 'hydro', from: [1.35, .35, .52, 0], to: [1.35, .35, .52, 0] },
  { id: 'rack-to-vacuum', start: 64, end: 70, scene: 'hydro', from: [1.35, .35, .52, 0], to: [1.12, .39, .52, 0] },
  { id: 'orbital-arrangement', start: 70, end: 80, scene: 'reliquary', from: [1.02, .48, .5, 0], to: [.94, .46, .5, 0] },
  { id: 'witness-hands', start: 80, end: 83, scene: 'chapel', from: [1, .5, .5, 0], to: [1, .5, .5, 0] },
  { id: 'crossing-the-glass', start: 83, end: 84.6, scene: 'window-crossing', from: [1.02, .5, .5, 0], to: [1, .5, .5, 0] },
  { id: 'orbit-past-virgil', start: 84.6, end: 86, scene: 'exterior', from: [1.22, .46, .48, -.025], to: [1.02, .48, .5, 0] },
  { id: 'radial-bloom', start: 86, end: 88.5, scene: 'bloom', from: [1.02, .5, .5, 0], to: [1, .5, .5, 0] },
  { id: 'return-to-glass', start: 88.5, end: 90, scene: 'chapel', from: [1, .5, .5, 0], to: [1, .5, .5, 0] },
];

export const MATCH_CUTS = Object.freeze([
  Object.freeze({ at: 30, intactShot: 'm1-match-setup', damageShot: 'arm01-peel', system: 'docking arm 01' }),
  Object.freeze({ at: 40, intactShot: 'm2-match-setup', damageShot: 'segment02-peel', system: 'ring segment 02' }),
  Object.freeze({ at: 60, intactShot: 'm4-match-setup', damageShot: 'hydroponic-breach', system: 'hydroponic rack' }),
]);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothCue = (v) => { const x = clamp(v, 0, 1); return x * x * (3 - 2 * x); };

export function shotAt(time) {
  const t = clamp(Number.isFinite(time) ? time : 0, 0, 90);
  const cue = cues.find((candidate) => t >= candidate.start && t < candidate.end) || cues.at(-1);
  const u = smoothCue((t - cue.start) / (cue.end - cue.start));
  const camera = cue.from.map((value, i) => value + (cue.to[i] - value) * u);
  return Object.freeze({
    id: cue.id,
    scene: cue.scene,
    start: cue.start,
    end: cue.end,
    progress: u,
    camera: Object.freeze({ zoom: camera[0], focusX: camera[1], focusY: camera[2], roll: camera[3] }),
  });
}

export function cameraAt(time) {
  return shotAt(time).camera;
}

export function shotCount() { return cues.length; }
