// The Last Shift compares pure historical states; it does not create a second simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDS, stateAt } from '../src/sim.js';
import { LAST_SHIFT_STAGES, SHIFT_ROUTE, lastShiftJourney, lastShiftPair, lastShiftTime, routePointAt } from '../src/last-shift.js';

test('Month 0 is the exact same state, cart identity, camera, and normalized route drawing in both panes', () => {
  for (const stage of LAST_SHIFT_STAGES) {
    const pair = lastShiftPair(stage.id, 0);
    assert.equal(pair.monthZeroMatches, true, `${stage.id} Month 0 state hash`);
    assert.equal(pair.intactHash, pair.historicalHash);
    assert.equal(pair.intactTime, stage.intactTime);
    assert.equal(pair.historicalTime, stage.intactTime);
    assert.equal(pair.cartId, IDS.props.find((id) => id === 'prop.cart'));
    assert.equal(pair.cameraId, `cam.last-shift.${stage.id}`);
    assert.deepEqual(pair.intactState, pair.historicalState);
  }
  assert.equal(SHIFT_ROUTE.cartId, 'prop.cart');
  assert.deepEqual(SHIFT_ROUTE.direct.map(({ x, y }) => [x, y]), [
    [0.10, 0.52], [0.42, 0.52], [0.58, 0.52], [0.90, 0.52],
  ]);
  assert.deepEqual(SHIFT_ROUTE.dockingBranch.map(({ x, y }) => [x, y]), [
    [0.414, 0.52], [0.414, 0.88],
  ]);
  assert.deepEqual(SHIFT_ROUTE.bypass.map(({ x, y }) => [x, y]), [
    [0.10, 0.52], [0.254, 0.52], [0.254, 0.28], [0.734, 0.28], [0.734, 0.52], [0.90, 0.52],
  ]);
  assert.deepEqual(SHIFT_ROUTE.sealedApproach.at(-1), SHIFT_ROUTE.pressureClosure);
  assert.equal(SHIFT_ROUTE.geometry.collisionEvidence, 'blender-collision-mesh-rays-only');
  assert.equal(SHIFT_ROUTE.geometry.fullStationCoordinatesAvailable, false);
  assert.equal(SHIFT_ROUTE.geometry.unrealCoordinateBasisConfirmed, false);
  assert.equal(SHIFT_ROUTE.geometry.runtimeNavigationVerified, false);
});

test('M1 closes the dock terminal, retains the authored bypass state, and stops the cart at the seal', () => {
  const pair = lastShiftPair('dock', 1);
  const world = pair.historicalState;
  assert.equal(pair.historicalTime, 38);
  assert.equal(world.month, 1);
  assert.equal(world.paths.dockTerminal, false);
  assert.equal(world.paths.ringServiceBypass, true);
  assert.equal(world.pressure.dockIsolation, true);
  assert.equal(pair.routeState.directOpen, false);
  assert.equal(pair.routeState.bypassOpen, true);
  assert.equal(pair.routeState.pressureBoundary, true);
  assert.equal(pair.routeState.cartCasterPresent, false);
  assert.equal(pair.cartId, 'prop.cart');
  assert.notDeepEqual(SHIFT_ROUTE.direct, SHIFT_ROUTE.bypass);
  assert.ok(SHIFT_ROUTE.bypass.some((node) => node.id === 'service-branch'));
  assert.ok(SHIFT_ROUTE.bypass.some((node) => node.id === 'service-run'));
  assert.equal(SHIFT_ROUTE.geometryStatus, 'first-slice-blender-plan-schematic; full-station-and-runtime-navigation-unverified');

  const underway = lastShiftJourney(pair.routeState, 0);
  assert.equal(underway.cartStoppedAtSeal, false);
  assert.equal(underway.bypassTraceProgress, 0);
  const stopped = lastShiftJourney(pair.routeState, 1.2);
  assert.equal(stopped.cartStoppedAtSeal, true);
  assert.equal(stopped.cartProgress, 1);
  assert.equal(stopped.bypassTraceProgress, 0);
  const traced = lastShiftJourney(pair.routeState, 4.75);
  assert.equal(traced.cartStoppedAtSeal, true);
  assert.equal(traced.bypassTraceProgress, 1);
  assert.deepEqual(
    [routePointAt(SHIFT_ROUTE.sealedApproach, stopped.cartProgress).x, routePointAt(SHIFT_ROUTE.sealedApproach, stopped.cartProgress).y],
    [SHIFT_ROUTE.pressureClosure.x, SHIFT_ROUTE.pressureClosure.y],
  );
  const bypassEnd = routePointAt(SHIFT_ROUTE.bypass, traced.bypassTraceProgress);
  assert.ok(Math.abs(bypassEnd.x - SHIFT_ROUTE.bypass.at(-1).x) < 1e-12);
  assert.ok(Math.abs(bypassEnd.y - SHIFT_ROUTE.bypass.at(-1).y) < 1e-12);
});

test('removed modules and paths never return in any later chosen month', () => {
  for (let month = 1; month <= 6; month++) {
    const world = lastShiftPair('dock', month).historicalState;
    assert.notEqual(world.arm01.phase, 'intact', `M${month} cannot restore arm01`);
    assert.ok(world.scars.includes('scar.docking.arm01.removed'));
    assert.equal(world.paths.dockTerminal, false);
    assert.equal(world.paths.ringServiceBypass, true);
  }
  assert.equal(stateAt(89).armsIntact, 11);
});

test('hydroponics uses Month 0 and Month 4 source states, not a recolored clone', () => {
  const intact = lastShiftPair('hydro', 0);
  const ruptured = lastShiftPair('hydro', 4);
  assert.equal(intact.historicalTime, 18);
  assert.equal(intact.historicalState.hydroRack.phase, 'tended');
  assert.equal(intact.historicalState.lights.hydroPumps, true);
  assert.equal(intact.historicalState.doors.hydroFarOpen, false);
  assert.equal(ruptured.historicalTime, 63.9);
  assert.equal(ruptured.historicalState.hydroRack.phase, 'rupturing');
  assert.equal(ruptured.historicalState.lights.hydroPumps, false);
  assert.equal(ruptured.historicalState.doors.hydroFarOpen, true);
  assert.equal(ruptured.historicalState.pressure.hydroSealedEdge, true);
  assert.notEqual(intact.historicalHash, ruptured.historicalHash);
});

test('Observation Glass preserves routine, recurring M3 path, exterior ruin, and inside return times', () => {
  const routine = lastShiftPair('glass', 0);
  const recurring = lastShiftPair('glass', 3);
  assert.equal(routine.historicalTime, 26);
  assert.equal(recurring.historicalTime, 56);
  assert.equal(recurring.historicalState.landmarks.maraInLane, true);
  assert.equal(recurring.historicalState.landmarks.rinInLane, true);
  assert.equal(lastShiftTime('glass', 6, 'crossing'), 84.2);
  assert.equal(lastShiftTime('glass', 6, 'bloom'), 87);
  assert.equal(lastShiftTime('glass', 6, 'return'), 89);
  assert.equal(stateAt(lastShiftTime('glass', 6, 'bloom')).finale.bloom, true);
  assert.equal(stateAt(lastShiftTime('glass', 6, 'return')).finale.returnHands, true);
});

test('month switching and scrambled seeks always reconstruct the same state hashes', () => {
  const order = [6, 1, 4, 0, 5, 2, 3];
  const hashAt = new Map();
  for (const month of order) {
    const pair = lastShiftPair('dock', month);
    hashAt.set(month, pair.historicalHash);
  }
  for (let month = 0; month <= 6; month++) {
    assert.equal(lastShiftPair('dock', month).historicalHash, hashAt.get(month), `dock M${month}`);
    assert.equal(lastShiftPair('dock', month).historicalTime, lastShiftTime('dock', month));
  }
});
