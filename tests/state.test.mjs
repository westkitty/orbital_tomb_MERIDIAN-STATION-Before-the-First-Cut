// Deterministic state tests — run: node --test tests/state.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stateAt, stateHash, chapterAt, DURATION, CAMERAS, IDS, isMonotonic } from '../src/sim.js';

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

test('three final reused component IDs present in bloom', () => {
  const s = stateAt(88);
  const ids = s.components.map(c => c.id).sort();
  assert.deepEqual(ids, ['comp.arm01', 'comp.hydro_rack', 'comp.segment02']);
  assert.ok(s.components.every(c => c.phase === 'bloom'));
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

test('three locked cameras defined', () => {
  assert.deepEqual(Object.keys(CAMERAS).sort(), ['chapel', 'docking', 'hydro']);
});

test('isMonotonic helper holds across full timeline and damage never reverses', () => {
  for (let t = 0; t < 90; t += 0.5) {
    assert.ok(isMonotonic(t, t + 0.5));
    const a = stateAt(t), b = stateAt(t + 0.5);
    assert.ok(a.scars.every(scar => b.scars.includes(scar)));
    assert.ok(b.armsIntact <= a.armsIntact);
  }
});
