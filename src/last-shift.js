// The Last Shift is an observational comparison over the existing simulation.
// It has no writable world state and never advances the film clock.
import { IDS, stateAt, stateHash } from './sim.js';

export const LAST_SHIFT_STAGES = Object.freeze([
  Object.freeze({ id: 'dock', label: 'Docking / Transit', intactTime: 6 }),
  Object.freeze({ id: 'hydro', label: 'Hydroponics', intactTime: 18 }),
  Object.freeze({ id: 'glass', label: 'Observation Glass', intactTime: 26 }),
]);

// Story-time samples are actual stateAt() times in the authored 90-second cut.
// Month 0 deliberately uses each intact scene's own established film frame.
// Month 3's glass frame is the recurring Mara/Rin lane crossing at 00:56.
const MONTH_TIMES = Object.freeze({
  dock: Object.freeze([6, 38, 48, 58, 68, 78, 89]),
  hydro: Object.freeze([18, 38, 48, 58, 63.9, 78, 89]),
  glass: Object.freeze([26, 38, 48, 56, 68, 78, 89]),
});

// A normalized drawing of the first-slice route topology. Its proportions are
// for legibility: they are not a surveyed whole-station coordinate frame. The
// referenced collision-ray work is Blender-only and does not certify runtime
// navigation, Unreal transforms, or player/capsule traversal.
const FIRST_SLICE_GEOMETRY = Object.freeze({
  basis: 'blender-first-slice-clearance-study',
  projection: 'normalized-plan-schematic; corridor horizontal, bypass above, dock spur below',
  collisionEvidence: 'blender-collision-mesh-rays-only',
  fullStationCoordinatesAvailable: false,
  unrealCoordinateBasisConfirmed: false,
  runtimeNavigationVerified: false,
});

const point = (id, x, y, sector = 'outer_transit_ring') => Object.freeze({ id, x, y, sector });
const corridor = (id, x, y) => point(id, x, y, 'outer_transit_ring');
const pressureClosure = corridor('sealed-threshold', 0.50, 0.52);
const m0Direct = Object.freeze([
  corridor('corridor-entry', 0.10, 0.52),
  corridor('direct-before-seal', 0.42, 0.52),
  corridor('direct-after-seal', 0.58, 0.52),
  corridor('ring-entry', 0.90, 0.52),
]);
export const SHIFT_ROUTE = Object.freeze({
  id: 'route.salvage-cart.dock-transit',
  cartId: IDS.props.find((id) => id === 'prop.cart'),
  directEdge: 'path.dock_terminal',
  bypassEdge: 'path.ring_service_bypass',
  pressureBoundary: 'pressure.dock_isolation',
  geometryStatus: 'first-slice-blender-plan-schematic; full-station-and-runtime-navigation-unverified',
  geometry: FIRST_SLICE_GEOMETRY,
  nodes: Object.freeze([
    m0Direct[0],
    corridor('service-portal-entry', 0.254, 0.52),
    corridor('dock-junction', 0.414, 0.52),
    pressureClosure,
    corridor('service-portal-exit', 0.734, 0.52),
    m0Direct.at(-1),
    point('dock-threshold', 0.414, 0.88, 'docking_arms'),
    corridor('service-branch', 0.254, 0.28),
    corridor('service-run', 0.734, 0.28),
  ]),
  // This is the intact center-corridor route. M1 stops it at the pressure
  // boundary; the separate service bypass below is the authored detour shape.
  direct: m0Direct,
  pressureClosure,
  sealedApproach: Object.freeze([m0Direct[0], m0Direct[1], pressureClosure]),
  closedContinuation: Object.freeze([pressureClosure, m0Direct[2], m0Direct[3]]),
  dockingBranch: Object.freeze([
    corridor('dock-junction', 0.414, 0.52),
    point('dock-threshold', 0.414, 0.88, 'docking_arms'),
  ]),
  bypass: Object.freeze([
    m0Direct[0],
    corridor('service-portal-entry', 0.254, 0.52),
    corridor('service-branch', 0.254, 0.28),
    corridor('service-run', 0.734, 0.28),
    corridor('service-rejoin', 0.734, 0.52),
    m0Direct.at(-1),
  ]),
});

const stageFor = (id) => LAST_SHIFT_STAGES.find((stage) => stage.id === id) || LAST_SHIFT_STAGES[0];

export function lastShiftTime(stageId, monthValue, glassBeat = 'return') {
  const stage = stageFor(stageId);
  const month = Math.max(0, Math.min(6, Math.round(Number(monthValue) || 0)));
  if (stage.id === 'glass' && month === 6) {
    if (glassBeat === 'crossing') return 84.2;
    if (glassBeat === 'bloom') return 87;
    return 89;
  }
  return MONTH_TIMES[stage.id][month];
}

export function lastShiftJourney(routeState, elapsedSeconds) {
  const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
  if (routeState.directOpen) {
    return Object.freeze({
      cartPath: 'direct',
      cartProgress: Math.min(0.16 + elapsed * 0.12, 1),
      cartStoppedAtSeal: false,
      bypassTraceProgress: null,
    });
  }
  const cartProgress = Math.min(0.66 + elapsed * 0.30, 1);
  return Object.freeze({
    cartPath: 'sealed-approach',
    cartProgress,
    cartStoppedAtSeal: cartProgress >= 1,
    // The prop remains at the sealed threshold. A separate route trace follows
    // the surviving edge; it never teleports the cart through the blocked edge.
    bypassTraceProgress: routeState.bypassOpen ? Math.max(0, Math.min((elapsed - 1.25) / 3.5, 1)) : null,
  });
}

export function routePointAt(points, progress) {
  if (!points.length) return null;
  if (points.length === 1) return points[0];
  const u = Math.max(0, Math.min(Number(progress) || 0, 1));
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const length = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  let distance = total * u;
  for (let index = 0; index < lengths.length; index++) {
    if (distance <= lengths[index] || index === lengths.length - 1) {
      const p0 = points[index], p1 = points[index + 1];
      const along = lengths[index] === 0 ? 0 : distance / lengths[index];
      return Object.freeze({
        id: `route-progress-${index}`,
        x: p0.x + (p1.x - p0.x) * along,
        y: p0.y + (p1.y - p0.y) * along,
        sector: p0.sector,
      });
    }
    distance -= lengths[index];
  }
  return points.at(-1);
}

export function lastShiftPair(stageId, monthValue, glassBeat = 'return') {
  const stage = stageFor(stageId);
  const month = Math.max(0, Math.min(6, Math.round(Number(monthValue) || 0)));
  const intactTime = stage.intactTime;
  const historicalTime = lastShiftTime(stage.id, month, glassBeat);
  const intactState = stateAt(intactTime);
  const historicalState = stateAt(historicalTime);
  const monthZero = month === 0;
  return Object.freeze({
    stage: stage.id,
    month,
    intactTime,
    historicalTime,
    intactState,
    historicalState,
    intactHash: stateHash(intactTime),
    historicalHash: stateHash(historicalTime),
    cameraId: `cam.last-shift.${stage.id}`,
    cartId: SHIFT_ROUTE.cartId,
    route: SHIFT_ROUTE,
    monthZeroMatches: monthZero && stateHash(intactTime) === stateHash(historicalTime),
    routeState: Object.freeze({
      directOpen: historicalState.paths.dockTerminal,
      bypassOpen: historicalState.paths.ringServiceBypass,
      pressureBoundary: historicalState.pressure.dockIsolation,
      cartCasterPresent: historicalState.props.cartCasterPresent,
    }),
  });
}
