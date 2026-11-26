// Clean, dependency-free static build. Release identity is read from the current Git checkout.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CHAPTERS, DURATION } from '../src/sim.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
cpSync(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
mkdirSync(path.join(dist, 'vendor'), { recursive: true });
cpSync(path.join(root, 'node_modules/three/build/three.module.js'), path.join(dist, 'vendor/three.module.js'));
cpSync(path.join(root, 'node_modules/three/build/three.core.js'), path.join(dist, 'vendor/three.core.js'));
cpSync(path.join(root, 'node_modules/three/LICENSE'), path.join(dist, 'vendor/three.LICENSE'));
writeFileSync(path.join(dist, '.nojekyll'), '');

const sha = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root, encoding: 'utf8' }).trim();
const info = {
  project: 'MERIDIAN STATION — Before the First Cut',
  sha,
  branch,
  builtAt: new Date().toISOString(),
  duration: DURATION,
  chapters: CHAPTERS.length,
  note: 'Static site; no external runtime requirement. Served from repo Pages subpath.',
};
writeFileSync(path.join(dist, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log('build-info.json:', JSON.stringify(info));
console.log('dist ready:', dist);
