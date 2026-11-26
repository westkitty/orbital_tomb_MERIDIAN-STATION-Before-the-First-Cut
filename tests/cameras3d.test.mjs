import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authoredPose3d, comparePose3d, orbitPose3d, ORBIT_STOPS } from '../src/cameras3d.js';
import { shotAt } from '../src/cameras.js';

test('each authored shot has a finite 3D perspective pose', () => {
  const boundaries = [0, 2, 8, 14, 20, 28, 30, 39.2, 40, 44, 50, 58, 60, 64, 70, 80, 83, 84.6, 86, 88.5, 90];
  for (const time of boundaries) {
    const shot = shotAt(time);
    const pose = authoredPose3d(time, shot.id);
    assert.ok(pose.position.every(Number.isFinite), `${shot.id} position at ${time}s`);
    assert.ok(pose.target.every(Number.isFinite), `${shot.id} target at ${time}s`);
    assert.ok(Number.isFinite(pose.fov) && pose.fov > 0 && pose.fov < 180, `${shot.id} FOV at ${time}s`);
  }
});

test('M1/M2/M4 3D cut cameras hold continuously across each damage boundary', () => {
  for (const [before, at, beforeId, afterId] of [
    [30, 30, 'm1-match-setup', 'arm01-peel'],
    [40, 40, 'm2-match-setup', 'segment02-peel'],
    [60, 60, 'm4-match-setup', 'hydroponic-breach'],
  ]) {
    const beforePose = authoredPose3d(before, beforeId);
    const afterPose = authoredPose3d(at, afterId);
    for (const key of ['position', 'target']) {
      for (let axis = 0; axis < 3; axis++) {
        assert.ok(Math.abs(beforePose[key][axis] - afterPose[key][axis]) < 1e-6, `${key}[${axis}] differs at ${at}s`);
      }
    }
    assert.ok(Math.abs(beforePose.fov - afterPose.fov) < 1e-6, `FOV differs at ${at}s`);
  }
});

test('hydro comparison reuses its authored interior camera and stays finite', () => {
  const hydro = comparePose3d('hydro', 63.9, 'hydroponic-breach');
  assert.equal(hydro[3], 58);
  assert.ok(hydro[1].every(Number.isFinite));
  assert.ok(hydro[2].every(Number.isFinite));
});

test('inspection orbit clamps to the authored 240-degree path and keeps a fixed target', () => {
  assert.deepEqual(ORBIT_STOPS.map((stop) => stop.angle), [0, 90, 180, 240]);
  const start = orbitPose3d(-20);
  const end = orbitPose3d(260);
  assert.equal(start.orbitDegrees, 0);
  assert.equal(end.orbitDegrees, 240);
  assert.deepEqual(start.target, [0, 0, 0]);
  assert.deepEqual(end.target, [0, 0, 0]);
  assert.ok(start.position.every(Number.isFinite) && end.position.every(Number.isFinite));
});
