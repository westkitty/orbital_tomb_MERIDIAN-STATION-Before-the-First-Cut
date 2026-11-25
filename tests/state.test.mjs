// Deterministic state tests — run: node --test tests/state.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateAt, stateHash, chapterAt, DURATION, GEOMETRY, IDS, isMonotonic } from '../src/sim.js';
import { CAMERAS, MATCH_CUTS, shotAt, shotCount } from '../src/cameras.js';

test('runtime is exactly 90s with 30/60 split', () => {
  assert.equal(DURATION, 90);
  assert.equal(chapterAt(0).month, 0);
  assert.equal(chapterAt(29.9).month, 0);
  assert.equal(chapterAt(30.0).month, 1);
  assert.equal(chapterAt(89.9).month, 6);
});

test('no Tiger, alarm, or irreversible damage is present before 00:30', () => {
  for (const t of [0, 8, 14, 20, 29.9]) {
    const s = stateAt(t);
    assert.equal(s.tiger.present, false);
    assert.deepEqual(s.scars, []);
  }
});

test('12 intact arms at start, 11 after M1, never regrows', () => {
  assert.equal(stateAt(0).armsIntact, 12);
  assert.equal(stateAt(29.9).armsIntact, 12);
  assert.equal(stateAt(30).armsIntact, 11);
  assert.equal(stateAt(90).armsIntact, 11);
});

test('locked station dimensions and observation-bay geometry are explicit', () => {
  assert.deepEqual(GEOMETRY, {
    ringDiameterKm: 8.7, ringRadialThicknessKm: 1.3,
    spireAboveRingKm: 10.4, spineBelowRingKm: 6.9,
    initialDockingArms: 12, observationBays: 3, panesPerObservationBay: 2,
  });
});

test('no damage reversal in forward play (monotonic scars)', () => {
  let prev = -1;
  for (let t = 0; t <= 90; t += 0.5) {
    const n = stateAt(t).scars.length;
    assert.ok(n >= prev, `scar count decreased at t=${t}`);
    prev = n;
  }
  assert.equal(prev, 6);
});

test('complete state hash is invariant under ordered and scrambled time queries', () => {
  const probes = [0, 5, 12, 29.9, 30, 36, 44, 54, 62, 66, 74, 80, 84, 88.5, 90];
  const linear = probes.map(stateHash);
  // scrambled order
  const order = [7, 2, 13, 0, 9, 4, 11, 1, 14, 3, 12, 5, 10, 6, 8];
  const scrambled = new Array(probes.length);
  for (const i of order) scrambled[i] = stateHash(probes[i]);
  assert.deepEqual(scrambled, linear);
});

test('boundary 00:29.9 vs 00:30.0 differs only by M1 onset', () => {
  const a = stateAt(29.9), b = stateAt(30.0);
  assert.equal(a.month, 0); assert.equal(b.month, 1);
  assert.equal(a.arm01.phase, 'intact'); assert.equal(b.arm01.phase, 'peeling');
  assert.equal(a.scars.length, 0); assert.equal(b.scars.length, 1);
});

test('named landmark continuity: Hesh, Kira, Jalen, Safi persist once placed', () => {
  assert.equal(stateAt(43).landmarks.heshVisible, false);
  assert.equal(stateAt(44).landmarks.heshVisible, true);
  assert.equal(stateAt(90).landmarks.heshVisible, true);
  assert.equal(stateAt(90).landmarks.kiraPlaced, true);
  assert.equal(stateAt(90).landmarks.jalenPlaced, true);
  assert.equal(stateAt(90).landmarks.safiPlaced, true);
});

test('persistent IDs are stable and exposed for every world-entity category', () => {
  assert.deepEqual(Object.keys(IDS).sort(), ['actors', 'components', 'doors', 'landmarks', 'modules', 'props']);
  for (const t of [0, 30, 44, 66, 88]) assert.deepEqual(stateAt(t).ids, IDS);
  assert.ok(Object.isFrozen(IDS) && Object.values(IDS).every(Object.isFrozen));
});

test('three persistent components progress from attachment through transit to named bloom slots', () => {
  const component = (time, id) => stateAt(time).components.find((item) => item.id === id);
  const paths = [
    ['comp.arm01', [[0, 'intact'], [30, 'peeling'], [34, 'detached'], [40, 'transit'], [86, 'placed']], 0],
    ['comp.segment02', [[39.9, 'intact'], [40, 'peeling'], [44, 'detached'], [50, 'transit'], [86, 'placed']], 2],
    ['comp.hydro_rack', [[59.9, 'tended'], [60, 'rupturing'], [64, 'detached'], [70, 'transit'], [86, 'placed']], 7],
  ];
  for (const [id, phases, placementSector] of paths) {
    for (const [time, phase] of phases) assert.equal(component(time, id).phase, phase, `${id} at ${time}s`);
    for (const time of [0, 30, 40, 60, 70, 86, 90]) {
      const item = component(time, id);
      assert.equal(item.destination, 'radial-bloom');
      assert.equal(item.placementSector, placementSector);
    }
  }
  const final = stateAt(90).components;
  assert.deepEqual(final.map((item) => item.id).sort(), ['comp.arm01', 'comp.hydro_rack', 'comp.segment02']);
  assert.ok(final.every((item) => item.phase === 'placed' && item.drift === 1));
});

test('cause and effect: collar locks, seal reroutes, relay kills only its fixtures', () => {
  assert.equal(stateAt(5).doors.dockCollarLocked, false);
  assert.equal(stateAt(5).paths.crewCollarCrossing, false);
  assert.equal(stateAt(6).doors.dockCollarLocked, true);
  assert.equal(stateAt(6).paths.crewCollarCrossing, true);
  assert.equal(stateAt(33).paths.dockTerminal, true);
  assert.equal(stateAt(34).paths.dockTerminal, false);
  assert.equal(stateAt(34).paths.ringServiceBypass, true);
  assert.equal(stateAt(41).lights.relayConnected, true);
  assert.equal(stateAt(42).lights.relayConnected, false);
  assert.equal(stateAt(42).lights.chapelSurviving, true); // unaffected circuit survives
  assert.equal(stateAt(51).doors.habNorthVented, false);
  assert.equal(stateAt(52).doors.habNorthVented, true);
  assert.equal(stateAt(61).doors.hydroFarOpen, false);
  assert.equal(stateAt(62).doors.hydroFarOpen, true);
  assert.equal(stateAt(62).paths.hydroDirect, false);
  assert.equal(stateAt(62).paths.hydroMaintenance, true);
});

test('cart caster lost in M1 and never returns', () => {
  assert.equal(stateAt(35).props.cartCasterPresent, true);
  assert.equal(stateAt(36).props.cartCasterPresent, false);
  assert.equal(stateAt(90).props.cartCasterPresent, false);
});

test('finale sequence: hands -> exterior -> bloom -> same hands', () => {
  assert.equal(stateAt(81).finale.hands, true);
  assert.equal(stateAt(84).finale.exterior, true);
  assert.equal(stateAt(87).finale.bloom, true);
  assert.equal(stateAt(89).finale.returnHands, true);
  assert.equal(stateAt(89).tiger.backlit, true);
});

test('three locked comparison cameras and 22 authored film shots are separate from world state', () => {
  assert.deepEqual(Object.keys(CAMERAS).sort(), ['chapel', 'docking', 'hydro']);
  assert.equal(shotCount(), 22);
  for (const t of [0, 2, 8, 14, 20, 28, 30, 34, 38, 39.2, 40, 42, 50, 58, 60, 64, 70, 80, 83, 84.6, 86, 88.5, 90]) {
    const shot = shotAt(t);
    assert.ok(shot.id && shot.scene);
    assert.ok(shot.camera.zoom > 0 && Number.isFinite(shot.camera.focusX));
  }
  assert.equal(shotAt(0).scene, 'exterior');
  assert.equal(shotAt(80).scene, 'chapel');
  assert.equal(shotAt(83).scene, 'window-crossing');
  assert.equal(shotAt(84.6).scene, 'exterior');
  assert.equal(shotAt(86).scene, 'bloom');
  assert.equal(shotAt(88.5).scene, 'chapel');
});

test('three authored damage boundaries are actual same-camera match cuts', () => {
  assert.deepEqual(MATCH_CUTS.map((cut) => cut.at), [30, 40, 60]);
  for (const cut of MATCH_CUTS) {
    const intact = shotAt(cut.at - 0.001);
    const damaged = shotAt(cut.at);
    assert.equal(intact.id, cut.intactShot);
    assert.equal(damaged.id, cut.damageShot);
    assert.equal(intact.scene, damaged.scene, cut.system);
    assert.deepEqual(intact.camera, damaged.camera, `${cut.system} camera changes at ${cut.at}s`);
  }
  assert.equal(stateAt(29.9).arm01.phase, 'intact');
  assert.equal(stateAt(30).arm01.phase, 'peeling');
  assert.equal(stateAt(39.9).segment02.phase, 'intact');
  assert.equal(stateAt(40).segment02.phase, 'peeling');
  assert.equal(stateAt(59.9).hydroRack.phase, 'tended');
  assert.equal(stateAt(60).hydroRack.phase, 'rupturing');
});

test('isMonotonic helper holds across full timeline and damage never reverses', () => {
  for (let t = 0; t < 90; t += 0.5) {
    assert.ok(isMonotonic(t, t + 0.5));
    const a = stateAt(t), b = stateAt(t + 0.5);
    assert.ok(a.scars.every(scar => b.scars.includes(scar)));
    assert.ok(b.armsIntact <= a.armsIntact);
  }
});
