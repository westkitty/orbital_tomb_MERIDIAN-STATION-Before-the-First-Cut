// Verifies the generated Pages artifact is complete, subpath-safe, and stamped with HEAD.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS, DURATION } from '../src/sim.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const required = [
  'index.html', 'build-info.json', '.nojekyll',
  'src/style.css', 'src/app.js', 'src/sim.js', 'src/cameras.js', 'src/cameras3d.js', 'src/scene3d.js', 'src/render.js',
  'src/last-shift.js', 'src/last-shift-render.js', 'vendor/three.module.js', 'vendor/three.core.js', 'vendor/three.LICENSE',
];
for (const file of required) assert.ok(existsSync(path.join(dist, file)), `missing dist/${file}`);
for (const file of ['index.html', 'src/style.css', 'src/app.js', 'src/sim.js', 'src/cameras.js', 'src/cameras3d.js', 'src/scene3d.js', 'src/render.js', 'src/last-shift.js', 'src/last-shift-render.js']) {
  assert.equal(readFileSync(path.join(dist, file), 'utf8'), readFileSync(path.join(root, file), 'utf8'), `dist/${file} is stale`);
}
for (const file of ['three.module.js', 'three.core.js']) {
  assert.equal(
    readFileSync(path.join(dist, 'vendor', file), 'utf8'),
    readFileSync(path.join(root, 'node_modules/three/build', file), 'utf8'),
    `dist/vendor/${file} is stale`,
  );
}
assert.equal(
  readFileSync(path.join(dist, 'vendor/three.LICENSE'), 'utf8'),
  readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8'),
  'dist/vendor/three.LICENSE is stale',
);

const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
assert.match(html, /href="\.\/src\/style\.css"/);
assert.match(html, /src="\.\/src\/app\.js"/);
assert.doesNotMatch(html, /(?:src|href)="\/(?!\/)/, 'asset URLs must remain relative for Pages subpaths');
assert.doesNotMatch(html, /https?:\/\//, 'HTML must not require any remote runtime resource');

const app = readFileSync(path.join(dist, 'src/app.js'), 'utf8');
assert.match(app, /from '\.\/sim\.js'/);
assert.match(app, /from '\.\/cameras\.js'/);
assert.match(app, /from '\.\/render\.js'/);
assert.match(app, /from '\.\/scene3d\.js'/);
assert.match(app, /from '\.\/last-shift\.js'/);
assert.match(app, /from '\.\/last-shift-render\.js'/);
const scene3d = readFileSync(path.join(dist, 'src/scene3d.js'), 'utf8');
assert.match(scene3d, /from '\.\.\/vendor\/three\.module\.js'/);
for (const file of ['src/style.css', 'src/app.js', 'src/sim.js', 'src/cameras.js', 'src/cameras3d.js', 'src/scene3d.js', 'src/render.js', 'src/last-shift.js', 'src/last-shift-render.js']) {
  assert.doesNotMatch(readFileSync(path.join(dist, file), 'utf8'), /https?:\/\//, `${file} must not request a remote runtime asset`);
}
const info = JSON.parse(readFileSync(path.join(dist, 'build-info.json'), 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(info.sha, head, 'build-info SHA must match the checked-out release');
assert.equal(info.duration, DURATION);
assert.equal(info.chapters, CHAPTERS.length);
console.log(`BUILD CHECK PASS: ${required.length} files, ${info.chapters} chapters, SHA ${info.sha}`);
