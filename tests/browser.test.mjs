// Browser-level test via jsdom (sandbox has no downloadable Chromium: CDN blocked).
// Validates app wiring, controls, seeks, keyboard, subpath safety, zero console errors.
// Run: node --test tests/browser.test.mjs  (or: node tests/browser.test.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

function stubCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'canvas') return {};
      if (typeof k === 'string') return () => {};
      return undefined;
    },
    set() { return true; },
  });
}

async function boot(viewport = { width: 1280, height: 800 }) {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const errors = [];
  const dom = new JSDOM(html, { url: 'https://westkitty.github.io/orbital_tomb_MERIDIAN-STATION-Before-the-First-Cut/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.console.error = (...a) => errors.push(a.join(' '));
  window.addEventListener('error', e => errors.push(String(e.message)));
  // Canvas stub
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height });
  window.HTMLCanvasElement.prototype.getContext = () => stubCtx();
  window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ width: viewport.width, height: viewport.height, top: 0, left: 0, right: viewport.width, bottom: viewport.height });
  // rAF stub: run a few frames synchronously
  let rafCb = null;
  window.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
  // jsdom provides performance.now; leave it alone.
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {} }));
  // Load app module source manually (jsdom won't fetch file:// modules)
  const appSrc = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const simSrc = readFileSync(new URL('../src/sim.js', import.meta.url), 'utf8');
  const renderSrc = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  // Inline sim + render into a single module scope for jsdom eval
  const simBody = simSrc.replace(/^export /gm, '').replace(/import .*from.*\n/, '');
  const renderBody = renderSrc.replace(/^import .*from.*\n/gm, '').replace(/^export /gm, '');
  const combined = simBody + '\n' + renderBody + '\n' + appSrc.replace(/^import .*from.*\n/gm, '');
  window.eval(combined);
  // drive a few frames
  for (let i = 0; i < 5 && rafCb; i++) { const cb = rafCb; rafCb = null; cb(1000 + i * 16); }
  return { window, errors, getRaf: () => rafCb, setRaf: (cb) => { rafCb = cb; } };
}

test('app boots with zero console errors and exposes test API', async () => {
  const { window, errors } = await boot();
  assert.ok(window.__meridian, 'test API exposed');
  assert.deepEqual(errors, []);
});

test('start advances time; M6 jump and replay work', async () => {
  const { window } = await boot();
  const t0 = window.__meridian.t;
  assert.ok(typeof t0 === 'number');
  window.__meridian.seek(80);
  assert.equal(window.__meridian.stateAt(window.__meridian.t).month, 6);
  window.__meridian.seek(0);
  assert.ok(window.__meridian.t <= 1);
});

test('complete state hashes are identical after linear and scrambled player seeks', async () => {
  const { window } = await boot();
  const probes = [0, 6, 14, 29.9, 30, 34, 40, 44, 52, 56, 62, 66, 74, 78, 80, 83, 86, 88.5, 90];
  const linear = [];
  for (const t of probes) { window.__meridian.seek(t); linear.push(window.__meridian.stateHash(t)); }
  const scrambled = new Array(probes.length);
  for (const i of [7, 2, 15, 0, 10, 4, 18, 5, 13, 1, 9, 17, 3, 12, 6, 16, 8, 14, 11]) {
    window.__meridian.seek(probes[i]); scrambled[i] = window.__meridian.stateHash(window.__meridian.t);
  }
  assert.deepEqual(scrambled, linear);
});

test('full 90-second replay reaches end, then Replay restarts at zero', async () => {
  const { window, getRaf } = await boot();
  window.__meridian.seek(0);
  let raf = getRaf();
  let ts = 1064;
  for (let i = 0; i < 905 && window.__meridian.playing; i++) {
    assert.ok(raf, `animation callback exists at frame ${i}`);
    ts += 100; raf(ts); raf = getRaf();
  }
  assert.equal(window.__meridian.t, 90);
  assert.equal(window.__meridian.playing, false);
  assert.equal(window.document.getElementById('play').textContent, 'Replay');
  window.document.getElementById('play').click();
  assert.equal(window.__meridian.t, 0);
  assert.equal(window.__meridian.playing, true);
});

test('keyboard: space toggles play, arrows scrub, digits jump chapters', async () => {
  const { window } = await boot();
  const before = window.__meridian.playing;
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
  assert.equal(window.__meridian.playing, !before);
  window.__meridian.seek(10);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.ok(window.__meridian.t >= 11);
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true }));
  assert.equal(window.__meridian.t, 80);
});

test('chapter buttons, system select, before/after do not throw', async () => {
  const { window, errors } = await boot();
  window.document.querySelector('.chapters button[data-start="80"]').click();
  assert.equal(window.__meridian.t, 80);
  const sel = window.document.getElementById('system');
  sel.value = 'hydro'; sel.dispatchEvent(new window.Event('change'));
  assert.equal(window.__meridian.t, 18);
  window.document.getElementById('modeInspect').click();
  assert.ok(window.document.getElementById('stateOut').textContent.includes('actor.rin'));
  assert.ok(window.document.getElementById('stateOut').textContent.includes('comp.arm01'));
  const ba = window.document.getElementById('beforeAfter');
  const t = window.__meridian.t, beforeViewHash = window.__meridian.stateHash(t);
  ba.checked = true; ba.dispatchEvent(new window.Event('change'));
  window.document.getElementById('baCamera').value = 'hydro';
  window.document.getElementById('baCamera').dispatchEvent(new window.Event('change'));
  assert.equal(window.__meridian.stateHash(window.__meridian.t), beforeViewHash, 'camera and compare tools do not mutate world state');
  window.__meridian.seek(36);
  assert.deepEqual(errors, []);
});

test('subpath safety: no absolute or external runtime assets', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(!/src="\/[^"]/.test(html), 'no root-absolute src');
  assert.ok(!/href="\/[^"]/.test(html), 'no root-absolute href');
  assert.ok(!/https?:\/\/(?!www\.w3\.org|github\.com)/.test(html.replace(/https:\/\/westkitty\.github\.io[^"]*/g, '')), 'no external runtime URLs');
  assert.ok(html.includes('./src/style.css') && html.includes('./src/app.js'), 'relative asset paths');
});

test('range scrubbing and canvas tap work at a tablet-sized emulated viewport', async () => {
  const { window } = await boot({ width: 768, height: 1024 });
  const range = window.document.getElementById('scrub');
  range.value = '37.2'; range.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(window.__meridian.t, 37.2);
  const play = window.document.getElementById('play');
  const before = window.__meridian.playing;
  window.document.getElementById('film').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(window.__meridian.playing, !before);
  assert.match(readFileSync(new URL('../src/style.css', import.meta.url), 'utf8'), /max-width:760px/);
});

test('every chapter boundary renders without throwing', async () => {
  const { window } = await boot();
  for (const t of [0, ...window.__meridian.CHAPTERS.flatMap(c => [c.start, c.end]), 29.9, 83, 86, 88.5, 90]) {
    window.__meridian.seek(t);
  }
});
