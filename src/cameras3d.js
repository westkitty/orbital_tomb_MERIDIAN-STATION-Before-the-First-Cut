// Perspective camera blocking for the shared 3D Meridian set.
// Coordinates are kilometres; the film uses authored cuts while the Inspect
// orbit is a separate, camera-only 240-degree proof path.

const LOCKED = (value) => Object.freeze(value);

const CAMERA_KEYS = LOCKED({
  'dock-wide': [
    [0, [8.8, 5.6, 14.4], [0, 0, 0], 40],
    [2, [5.2, 3.0, 8.8], [0, 0, 4.45], 39],
  ],
  'dock-coupling': [
    [2, [5.2, 3.0, 8.8], [0, 0, 4.45], 39],
    [8, [1.25, 0.55, 6.9], [0, 0, 4.75], 40],
  ],
  'transit-follow': [
    [8, [0.004, 0.0016, 5.68], [0, 0.0014, 5.42], 70],
    [14, [-0.003, 0.0015, 5.48], [0.003, 0.0015, 5.1], 69],
  ],
  'hydroponic-handoff': [
    [14, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58],
    [20, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58],
  ],
  'routine-watch': [
    [20, [0.00065, 0.00145, -4.391], [-0.00025, 0.00148, -4.393], 50],
    [28, [0.00065, 0.00145, -4.391], [-0.00025, 0.00148, -4.393], 50],
  ],
  'm1-match-setup': [
    [28, [1.9, 0.76, 7.22], [0, 0, 4.85], 37],
    [30, [1.45, 0.55, 6.8], [0, 0, 4.95], 32],
  ],
  // One uninterrupted exterior camera carries the arm peel, complete release,
  // visible empty socket, and slow drift through 39.2 seconds.
  'arm01-peel': [
    [30, [1.45, 0.55, 6.8], [0, 0, 4.95], 32],
    [34, [1.66, 0.56, 6.72], [0, 0, 4.62], 33],
    [39.2, [1.25, 0.48, 6.48], [0, 0, 4.42], 35],
  ],
  'm2-match-setup': [
    [39.2, [5.1, 1.25, 4.5], [3.25, 0, 1.95], 37],
    [40, [4.9, 1.1, 4.35], [3.25, 0, 1.95], 35],
  ],
  'segment02-peel': [
    [40, [4.9, 1.1, 4.35], [3.25, 0, 1.95], 35],
    [44, [4.7, 0.9, 4.2], [3.25, 0, 1.95], 36],
  ],
  'relay-section': [
    [44, [8.5, 4.2, 10.8], [0, -0.4, 0], 44],
    [50, [9.1, 3.3, 7.0], [0, -0.2, 0], 43],
  ],
  'same-viewport-lane': [
    [50, [0.0014, 0.00145, -4.391], [0.0001, 0.0012, -4.50], 54],
    [58, [0.0014, 0.00145, -4.391], [0.0001, 0.0012, -4.50], 54],
  ],
  'm4-match-setup': [
    [58, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58],
    [60, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58],
  ],
  'hydroponic-breach': [
    [60, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58],
    [64, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58],
  ],
  'rack-to-vacuum': [
    [64, [0.008, -3.28, 0.108], [0, -3.33, -0.2], 55],
    [70, [2.8, -1.7, 4.8], [0, -3.1, 0], 48],
  ],
  'orbital-arrangement': [
    [70, [12.5, 6.5, 17.5], [0, 0, 0], 43],
    [80, [12.0, 5.7, 15.5], [0, 0, 0], 43],
  ],
  'witness-hands': [
    [80, [0.00135, 0.00152, -4.391], [-0.00025, 0.0015, -4.393], 49],
    [82.55, [0.00135, 0.00152, -4.391], [-0.00025, 0.0015, -4.393], 49],
    [83, [0.00035, 0.0015, -4.391], [0.00035, 0.0015, -4.60], 49],
  ],
  'crossing-the-glass': [
    [83, [0.00035, 0.0015, -4.391], [0.00035, 0.0015, -4.60], 49],
    [84.6, [0.0005, -0.001, -5.4], [0, -0.008, -15.5], 50],
  ],
  'orbit-past-virgil': [
    [84.6, [0.0005, -0.001, -5.4], [0, -0.008, -15.5], 50],
    [85.25, [1.7, -0.0025, -8.9], [0, -0.010, -16.0], 52],
    [85.72, [2.6, -0.0018, -10.2], [0, -0.008, -15.2], 48],
    [86, [1.8, -0.001, -8.2], [0, 0, 0], 46],
  ],
  'radial-bloom': [
    [86, [10.8, 4.5, 12.6], [0, 0, 0], 46],
    [87.1, [7.3, 2.3, 5.8], [1.2, 0.1, 0.0], 43],
    [88.5, [4.911, 0.0715, 0.135], [4.900, 0.0715, 0.120], 40],
  ],
  // An authored cut to the exterior face of the Chapel pane, followed by a
  // short physical return through its centre bay to the exact opening pose.
  'return-to-glass': [
    [88.5, [0.00035, 0.0015, -4.42], [0.00035, 0.0015, -4.34], 49],
    [88.92, [0.00135, 0.00152, -4.391], [-0.00025, 0.0015, -4.393], 49],
    [90, [0.00135, 0.00152, -4.391], [-0.00025, 0.0015, -4.393], 49],
  ],
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, u) => a + (b - a) * u;
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

function interpolateKeys(keys, time) {
  if (time <= keys[0][0]) return keys[0];
  if (time >= keys[keys.length - 1][0]) return keys[keys.length - 1];
  let index = 0;
  while (index < keys.length - 1 && time > keys[index + 1][0]) index++;
  const a = keys[index], b = keys[index + 1];
  const u = smooth((time - a[0]) / (b[0] - a[0]));
  return [time, lerp3(a[1], b[1], u), lerp3(a[2], b[2], u), lerp(a[3], b[3], u)];
}

const ATTENTION = Object.freeze({
  'survivor-notices-first': {
    start: 25.65,
    end: 27.72,
    position: [0.00048, 0.00152, -4.391],
    target: [-0.00025, 0.00148, -4.393],
    fov: 40,
  },
  'audience-notices-first': {
    start: 25.78,
    end: 27.95,
    position: [0.0017, 0.00175, -4.349],
    target: [0.0001, 0.00105, -4.62],
    fov: 56,
  },
});

export function authoredPose3d(time, shotId, attentionVariant = 'incumbent') {
  const t = Math.max(0, Math.min(90, Number.isFinite(time) ? time : 0));
  const keys = CAMERA_KEYS[shotId] || CAMERA_KEYS['dock-wide'];
  const [at, position, target, fov] = interpolateKeys(keys, t);
  const base = { time: at, position: [...position], target: [...target], fov };
  const attention = ATTENTION[attentionVariant];
  const opening = t >= 20 && t < 28;
  const returning = t >= 50 && t < 58;
  if (!attention || (!opening && !returning)) return base;
  const transitionStart = opening ? attention.start : (attentionVariant === 'survivor-notices-first' ? 51.2 : 54.2);
  const transitionEnd = opening ? attention.end : (attentionVariant === 'survivor-notices-first' ? 57.6 : 57.8);
  const u = smooth((t - transitionStart) / (transitionEnd - transitionStart));
  return {
    ...base,
    position: lerp3(base.position, attention.position, u),
    target: lerp3(base.target, attention.target, u),
    fov: lerp(base.fov, attention.fov, u),
  };
}

export const ORBIT_STOPS = Object.freeze([
  Object.freeze({ angle: 0, label: 'front three-quarter' }),
  Object.freeze({ angle: 90, label: 'side' }),
  Object.freeze({ angle: 180, label: 'rear' }),
  Object.freeze({ angle: 240, label: 'rear / underside' }),
]);

export function orbitPose3d(angleDegrees) {
  const angle = Math.max(0, Math.min(240, Number.isFinite(angleDegrees) ? angleDegrees : 0));
  const azimuth = (38 + angle) * Math.PI / 180;
  const elevationDegrees = 24 - (angle / 240) * 51;
  const elevation = elevationDegrees * Math.PI / 180;
  const radius = 24;
  const cosElevation = Math.cos(elevation);
  return {
    time: angle,
    position: [Math.sin(azimuth) * radius * cosElevation, Math.sin(elevation) * radius, Math.cos(azimuth) * radius * cosElevation],
    target: [0, 0, 0],
    fov: 48,
    orbitDegrees: angle,
    orbitLabel: ORBIT_STOPS.reduce((nearest, stop) => Math.abs(stop.angle - angle) < Math.abs(nearest.angle - angle) ? stop : nearest).label,
  };
}

export function comparePose3d(cameraId, time, shotId = '') {
  if (cameraId === 'hydro') return interpolateKeys([[0, [0.002, -3.33, 0.108], [0, -3.33, -0.045], 58]], time);
  if (cameraId === 'chapel') return interpolateKeys([[0, [0.00065, 0.00145, -4.391], [-0.00025, 0.00148, -4.393], 50]], time);
  // A shared, close perspective on the same physical dock socket for both panes.
  return interpolateKeys([[0, [1.45, 0.55, 6.8], [0, 0, 4.95], 32]], time);
}
