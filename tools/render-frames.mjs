// Offline evidence renderer: runs the REAL src/render.js against a pure-JS canvas.
// Produces committed review frames (approximate pixel output; real browsers may differ slightly).
// Run: npm run frames
import pureimage from 'pureimage';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateAt } from '../src/sim.js';
import { CAMERAS, attentionCameraAt, shotAt } from '../src/cameras.js';
import { renderScene } from '../src/render.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'evidence');
fs.mkdirSync(out, { recursive: true });

const W = 960, H = 600; // 16:10 review frames

function renderTo(file, state, opts = {}) {
  const img = pureimage.make(W, H);
  const ctx = img.getContext('2d');
  renderScene(ctx, W, H, state, opts);
  return new Promise((res, rej) => {
    const stream = fs.createWriteStream(path.join(out, file));
    pureimage.encodePNGToStream(img, stream).then(() => { console.log('rendered evidence/' + file); res(); }, rej);
  });
}

const shots = [
  ['intact-00m01-station-wide.png', 1, {}],
  ['intact-00m06-docking.png', 6, {}],
  ['intact-00m14-interior-mug.png', 12, {}],
  ['intact-00m18-hydro.png', 18, {}],
  ['intact-00m26-chapel.png', 26, {}],
  ['match-m1-before-00m29.9.png', 29.9, {}],
  ['match-m1-after-00m33.png', 33, {}],
  ['mid-00m33-arm01-peeling.png', 33, {}],
  ['mid-00m36-seal-cart.png', 36, {}],
  ['mid-00m38-arm-detached.png', 38, {}],
  ['match-m2-before-00m39.9.png', 39.9, {}],
  ['match-m2-after-00m43.9.png', 43.9, {}],
  ['mid-00m44-hesh.png', 44, {}],
  ['mid-00m56-viewport-lane.png', 56, {}],
  ['match-m4-before-00m59.9.png', 59.9, {}],
  ['mid-01m00-rin-service-cut.png', 60.5, {}],
  ['match-m4-after-01m03.9.png', 63.9, {}],
  ['mid-01m06-hydro-ruptured.png', 66, {}],
  ['mid-01m14-reliquary.png', 74, {}],
  ['mid-01m18-orbital-arrangement.png', 78, {}],
  ['final-01m21-hands.png', 81, {}],
  ['final-01m24-glass-crossing.png', 84, {}],
  ['final-01m24-exterior.png', 84.6, {}],
  ['final-01m25-orbit.png', 85.5, {}],
  ['final-01m27-bloom.png', 87, {}],
  ['final-01m29-return-hands.png', 89, {}],
];
for (const [file, t, opts] of shots) await renderTo(file, stateAt(t), opts);

const attentionReviewTime = 26;
const attentionShot = shotAt(attentionReviewTime);
for (const [variant, label] of [
  ['survivor-notices-first', 'survivor-first'],
  ['audience-notices-first', 'audience-first'],
]) {
  await renderTo(`review-attention-${label}-00m26.png`, stateAt(attentionReviewTime), {
    shot: attentionShot,
    camera: attentionCameraAt(attentionReviewTime, variant),
  });
}

for (const cam of ['docking', 'hydro', 'chapel']) {
  const c = CAMERAS[cam];
  const dmgT = c.damagedT;
  await renderTo(`before-after-${cam}.png`, stateAt(dmgT), { beforeAfter: { split: 0.5, intactState: stateAt(c.intactT), cam } });
}
const firstHands = fs.readFileSync(path.join(out, 'final-01m21-hands.png'));
const returnHands = fs.readFileSync(path.join(out, 'final-01m29-return-hands.png'));
if (!firstHands.equals(returnHands)) throw new Error('M6 return-hands frame diverged from the opening hands frame');
console.log('FINAL MATCH PASS: opening and return hands are pixel-identical');
console.log('FRAMES PASS:', fs.readdirSync(out).length, 'files');
