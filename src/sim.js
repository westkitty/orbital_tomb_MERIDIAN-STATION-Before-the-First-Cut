// MERIDIAN STATION — Before the First Cut
// Deterministic world simulation. Pure functions of time; no wall-clock, no unseeded random.
// World state is separate from cameras and rendering.

export const DURATION = 90;
export const LIFE_END = 30;
export const GEOMETRY = Object.freeze({
  ringDiameterKm: 8.7,
  ringRadialThicknessKm: 1.3,
  spireAboveRingKm: 10.4,
  spineBelowRingKm: 6.9,
  initialDockingArms: 12,
  observationBays: 3,
  panesPerObservationBay: 2,
});

export const CHAPTERS = [
  { id: 'life-dock',    label: 'Life — Docking',      start: 0,  end: 8,  month: 0 },
  { id: 'life-habitat', label: 'Life — Habitat',      start: 8,  end: 14, month: 0 },
  { id: 'life-hydro',   label: 'Life — Hydroponics',  start: 14, end: 20, month: 0 },
  { id: 'life-chapel',  label: 'Life — Observation',  start: 20, end: 30, month: 0 },
  { id: 'm1', label: 'Month 1 — First Arm',    start: 30, end: 40, month: 1 },
  { id: 'm2', label: 'Month 2 — Ring & Hesh',  start: 40, end: 50, month: 2 },
  { id: 'm3', label: 'Month 3 — North Vent',   start: 50, end: 60, month: 3 },
  { id: 'm4', label: 'Month 4 — Hydroponics',  start: 60, end: 70, month: 4 },
  { id: 'm5', label: 'Month 5 — Reliquary',    start: 70, end: 80, month: 5 },
  { id: 'm6', label: 'Month 6 — The Bloom',    start: 80, end: 90, month: 6 },
];

export const IDS = Object.freeze(Object.fromEntries(Object.entries({
  actors: ['actor.rin','actor.mara','actor.hesh','actor.kira','actor.jalen','actor.safi','actor.survivor','actor.worker','actor.crew2'],
  doors: ['door.dock_collar','door.transit_seal','door.hydro_far','door.chapel_glass','door.hab_north'],
  props: ['prop.cart','prop.cart_caster','prop.tool_rin','prop.mug','prop.hydro_rack','prop.cryo_pod','prop.antenna','prop.sail'],
  modules: ['mod.arm01','mod.segment02','mod.hydro_spine','mod.chapel','mod.relay','mod.antenna_grid','mod.thermal_sail','mod.cryo_vault','mod.hab_north'],
  landmarks: ['landmark.virgil','landmark.hesh','landmark.mara','landmark.rin','landmark.kira','landmark.jalen','landmark.safi'],
  components: ['comp.arm01','comp.segment02','comp.hydro_rack'],
}).map(([kind, ids]) => [kind, Object.freeze(ids)])));

export function chapterAt(t) {
  for (const c of CHAPTERS) if (t >= c.start && t < c.end) return c;
  return CHAPTERS[CHAPTERS.length - 1];
}
export function monthAt(t) { return chapterAt(t).month; }

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
function smooth(x) { const u = clamp01(x); return u * u * (3 - 2 * u); }
function seg(t, a, b) { return smooth((t - a) / (b - a)); }

// Seeded PRNG (mulberry32) — fixed seed so stars/debris are identical every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Starfield + debris are precomputed once from the fixed seed.
const _rng = mulberry32(8700);
export const STARS = Array.from({ length: 220 }, () => ({ x: _rng(), y: _rng(), r: 0.4 + _rng() * 1.4, tw: _rng() * Math.PI * 2 }));
export const DEBRIS = Array.from({ length: 60 }, (_, i) => ({ id: 'debris.' + i, x: _rng(), y: _rng(), vx: (_rng() - 0.5) * 0.02, vy: (_rng() - 0.5) * 0.02, s: 1 + _rng() * 3 }));

// Core state: pure function of t. Scrubbing reconstructs the exact historical state.
export function stateAt(tRaw) {
  const t = Math.min(Math.max(tRaw, 0), DURATION);
  const ch = chapterAt(t);

  // --- Docking arm 01 (comp.arm01) ---
  let arm01;
  if (t < 30) arm01 = { phase: 'intact', peel: 0, drift: 0 };
  else if (t < 34) arm01 = { phase: 'peeling', peel: seg(t, 30, 34), drift: 0 };
  else if (t < 40) arm01 = { phase: 'detached', peel: 1, drift: seg(t, 34, 40) * 0.15 };
  else if (t < 80) arm01 = { phase: 'transit', peel: 1, drift: 0.15 + seg(t, 40, 80) * 0.45 };
  else if (t < 86) arm01 = { phase: 'transit', peel: 1, drift: 0.6 + seg(t, 80, 86) * 0.4 };
  else arm01 = { phase: 'placed', peel: 1, drift: 1 };

  // --- Ring segment 02 (comp.segment02) ---
  let segment02;
  if (t < 40) segment02 = { phase: 'intact', peel: 0, drift: 0 };
  else if (t < 44) segment02 = { phase: 'peeling', peel: seg(t, 40, 44), drift: 0 };
  else if (t < 50) segment02 = { phase: 'detached', peel: 1, drift: seg(t, 44, 50) * 0.2 };
  else if (t < 86) segment02 = { phase: 'transit', peel: 1, drift: 0.2 + seg(t, 50, 86) * 0.8 };
  else segment02 = { phase: 'placed', peel: 1, drift: 1 };

  // --- Hydroponics rack (comp.hydro_rack) ---
  let hydroRack;
  if (t < 60) hydroRack = { phase: 'tended', rupture: 0, drift: 0 };
  else if (t < 64) hydroRack = { phase: 'rupturing', rupture: seg(t, 60, 64), drift: 0 };
  else if (t < 70) hydroRack = { phase: 'detached', rupture: 1, drift: seg(t, 64, 70) * 0.45 };
  else if (t < 86) hydroRack = { phase: 'transit', rupture: 1, drift: 0.45 + seg(t, 70, 86) * 0.55 };
  else hydroRack = { phase: 'placed', rupture: 1, drift: 1 };

  const armsIntact = t < 30 ? GEOMETRY.initialDockingArms : GEOMETRY.initialDockingArms - 1; // arm01 removed at M1; never returns

  const doors = {
    dockCollarLocked: t >= 6,          // collar locks -> crew crossing possible
    transitSealClosed: t >= 34,        // inner seal closes -> direct route lost
    hydroFarOpen: t >= 62,             // far passage opens to vacuum
    habNorthVented: t >= 52,
    chapelGlassIntact: true,           // surviving glass holds to the end
  };

  const paths = {
    crewCollarCrossing: t >= 6, // collar lock physically enables passage
    dockTerminal: t < 34,
    ringServiceBypass: t >= 34,
    transitDirect: t < 42,
    relayService: t >= 42,
    hydroDirect: t < 62,
    hydroMaintenance: t >= 62,
    habNorthInterior: t < 52,
    habSafePerimeter: t >= 52,
  };

  // Lighting circuits: relay severed at M2 -> only relay-connected fixtures fail.
  const lights = {
    relayPrimary: t < 42,
    relayConnected: t < 42,   // fixtures on relay circuit
    habNorth: t < 52,
    hydroPumps: t < 62,
    chapelPrimary: t < 80 ? true : true, // chapel keeps surviving light
    chapelSurviving: true,
  };

  const props = {
    cartCasterPresent: t < 36,   // loose caster lost in M1, never returns
    cartScarred: t >= 36,
    toolWithRin: true,           // Rin holds the same tool throughout
    mugWithCrew: t >= 10 && t < 14,
    hydroFarDoorwayPresent: t < 62,
  };

  const landmarks = {
    heshVisible: t >= 44,
    maraInLane: t >= 54 && t < 60,
    rinInLane: t >= 54 && t < 60,
    kiraPlaced: t >= 73,
    jalenPlaced: t >= 75,
    safiPlaced: t >= 77,
  };

  // Actor positions are deterministic functions of t (0..1 across their scenes).
  const actors = {
    rin: { x: t < 30 ? 0.35 + seg(t, 12, 16) * 0.1 : 0.5, y: 0.62, tool: true },
    mara: { x: 0.3 + seg(t, 54, 58) * 0.4, y: 0.45, hair: true },
    survivor: { handsOnGlass: t >= 80, faceVisible: t >= 80 },
    worker: { x: 0.2 + seg(t, 0, 8) * 0.3, y: 0.5 },
  };

  // Tiger: deliberate silhouette; never before 30, backlit in finale.
  const tiger = {
    present: t >= 30,
    backlit: t >= 83,
    silhouette: t >= 30,
  };

  // Finale sub-beats within M6 (80-90): hands -> exterior -> bloom -> same hands.
  const finale = {
    hands: t >= 80 && t < 83,
    exterior: t >= 83 && t < 86,
    bloom: t >= 86 && t < 88.5,
    returnHands: t >= 88.5,
  };

  // Damage monotonicity: count of active scars only grows forward.
  const scars = [
    t >= 30 ? 'scar.docking.arm01.removed' : null,
    t >= 40 ? 'scar.transit.relay.segment02.removed' : null,
    t >= 50 ? 'scar.habitation.north.vented' : null,
    t >= 60 ? 'scar.hydroponics.spine.cut' : null,
    t >= 70 ? 'scar.relay.sail.integration' : null,
    t >= 80 ? 'scar.monument.radial.resolution' : null,
  ].filter(Boolean);

  return {
    t, chapter: ch.id, chapterLabel: ch.label, month: ch.month,
    ids: IDS,
    armsIntact, arm01, segment02, hydroRack,
    doors, paths, lights, props, landmarks, actors, tiger, finale, scars,
    // Identity, phase, and destination persist from the intact station through
    // release, transit, and final bloom placement in radial slots 0, 2, and 7.
    components: [
      { id: 'comp.arm01', phase: arm01.phase, drift: arm01.drift, destination: 'radial-bloom', placementSector: 0 },
      { id: 'comp.segment02', phase: segment02.phase, drift: segment02.drift, destination: 'radial-bloom', placementSector: 2 },
      { id: 'comp.hydro_rack', phase: hydroRack.phase, drift: hydroRack.drift, destination: 'radial-bloom', placementSector: 7 },
    ],

    pressure: {
      dockIsolation: t >= 34,
      habNorthSealedEdge: t >= 52,
      hydroSealedEdge: t >= 62,
    },
  };
}

// Stable hash of a state for determinism tests (scrub vs linear must match).
export function stateHash(t) {
  // Hash the complete serialized state, not a hand-picked subset: this catches
  // regressions in actors, doors, props, landmarks, components, and finale beats.
  const str = JSON.stringify(stateAt(t));
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Forward-play monotonic check helper: scars never shrink, arms never regrow.
export function isMonotonic(t1, t2) {
  if (t2 < t1) return true;
  const a = stateAt(t1), b = stateAt(t2);
  return a.scars.every(scar => b.scars.includes(scar)) && b.armsIntact <= a.armsIntact;
}
