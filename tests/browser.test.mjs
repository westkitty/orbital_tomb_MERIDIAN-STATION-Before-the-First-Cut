// Player/UI wiring checks via jsdom; real Chromium interaction lives in tools/browser-smoke.mjs.
// This suite validates controls, seeks, keyboard, subpath safety, and zero console errors.
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
  const cameraSrc = readFileSync(new URL('../src/cameras.js', import.meta.url), 'utf8');
  const renderSrc = readFileSync(new URL('../src/render.js', import.meta.url), 'utf8');
  const lastShiftSrc = readFileSync(new URL('../src/last-shift.js', import.meta.url), 'utf8');
  const lastShiftRenderSrc = readFileSync(new URL('../src/last-shift-render.js', import.meta.url), 'utf8');
  // Inline deterministic state, authored cameras, both renderers, and app for jsdom.
  const stripImports = (source) => source.replace(/^import\s+[\s\S]*?\s+from\s+['"][^'"]+['"];\r?\n/gm, '');
  const simBody = stripImports(simSrc).replace(/^export /gm, '');
  const cameraBody = stripImports(cameraSrc).replace(/^export /gm, '');
  const renderBody = stripImports(renderSrc).replace(/^export /gm, '');
  const lastShiftBody = stripImports(lastShiftSrc).replace(/^export /gm, '');
  const lastShiftRenderBody = stripImports(lastShiftRenderSrc).replace(/^export /gm, '');
  const createMeridian3D = `const createMeridian3D = () => ({ available: false, reason: 'jsdom WebGL stub', resize() {}, render() {}, metrics() { return { available: false, reason: 'jsdom WebGL stub' }; } });`;
  const combined = createMeridian3D + '\n' + simBody + '\n' + cameraBody + '\n' + renderBody + '\n' + lastShiftBody + '\n' + lastShiftRenderBody + '\n' + stripImports(appSrc);
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

test('shortcuts do not steal keystrokes from form controls or editable content', async () => {
  const { window } = await boot();
  window.document.getElementById('play').click(); // pause timeline
  window.__meridian.seek(12);
  const range = window.document.getElementById('scrub');
  range.focus();
  const playing = window.__meridian.playing;
  range.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
  range.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(window.__meridian.playing, playing);
  assert.equal(window.__meridian.t, 12);
  const editable = window.document.createElement('div');
  editable.contentEditable = 'true'; editable.tabIndex = 0; window.document.body.append(editable); editable.focus();
  editable.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'f', bubbles: true }));
  assert.equal(window.document.body.classList.contains('film'), true);
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

test('inspection A/B attention selector is inspect-only and leaves world state untouched', async () => {
  const { window, errors } = await boot();
  const selector = window.document.getElementById('attentionVariant');
  assert.equal(selector.disabled, true, 'camera review is inactive in Film mode');
  window.__meridian.seek(25.8);
  const beforeHash = window.__meridian.stateHash(25.8);
  const original = window.__meridian.attentionCameraAt(25.8, 'incumbent');
  const audience = window.__meridian.attentionCameraAt(25.8, 'audience-notices-first');
  assert.notDeepEqual(audience, original);

  window.document.getElementById('modeInspect').click();
  assert.equal(selector.disabled, false);
  selector.value = 'survivor-notices-first';
  selector.dispatchEvent(new window.Event('change'));
  let inspected = JSON.parse(window.document.getElementById('stateOut').textContent);
  assert.equal(inspected.cameraAttention, 'survivor-notices-first');
  assert.deepEqual({ ...inspected.camera }, { ...window.__meridian.attentionCameraAt(25.8, 'survivor-notices-first') });
  selector.value = 'audience-notices-first';
  selector.dispatchEvent(new window.Event('change'));
  inspected = JSON.parse(window.document.getElementById('stateOut').textContent);
  assert.equal(inspected.cameraAttention, 'audience-notices-first');
  assert.deepEqual({ ...inspected.camera }, { ...audience });
  assert.equal(window.__meridian.stateHash(25.8), beforeHash, 'camera attention never changes deterministic world state');

  window.document.getElementById('modeFilm').click();
  assert.equal(selector.disabled, true, 'review framing cannot alter the canonical film cut');
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
  assert.match(readFileSync(new URL('../src/style.css', import.meta.url), 'utf8'), /max-width: 900px/);
});

test('The Last Shift freezes and restores the playable film clock and state', async () => {
  const { window, getRaf } = await boot({ width: 1280, height: 800 });
  window.__meridian.seek(42.3);
  const before = { t: window.__meridian.t, hash: window.__meridian.stateHash(42.3), playing: window.__meridian.playing };
  window.document.getElementById('modeLastShift').click();
  assert.equal(window.__meridian.mode, 'lastshift');
  assert.equal(window.document.getElementById('lastShift').hidden, false, 'the after-film panel is revealed');
  assert.equal(window.document.getElementById('modeLastShift').getAttribute('aria-pressed'), 'true');
  assert.equal(window.__meridian.t, before.t);
  assert.equal(window.__meridian.stateHash(window.__meridian.t), before.hash);
  assert.equal(window.__meridian.playing, before.playing);
  const frame = getRaf();
  assert.ok(frame, 'Last Shift keeps its presentation frame loop');
  frame(1080);
  assert.equal(window.__meridian.t, before.t, 'the hidden film clock does not advance in the after-film experience');
  assert.equal(window.__meridian.stateHash(window.__meridian.t), before.hash);
  window.document.getElementById('shiftReturn').click();
  const nextFrame = getRaf();
  nextFrame(1096);
  assert.equal(window.document.getElementById('lastShift').hidden, true, 'return hides the after-film panel');
  assert.equal(window.__meridian.mode, 'film');
  assert.equal(window.__meridian.playing, before.playing);
  assert.ok(window.__meridian.t > before.t, 'film playback resumes from the exact saved frame');
});

test('Last Shift month and stage controls reconstruct real states and the narrow-layout toggle is accessible', async () => {
  const { window } = await boot({ width: 768, height: 1024 });
  window.__meridian.seek(51.25);
  const savedTime = window.__meridian.t;
  const savedHash = window.__meridian.stateHash(savedTime);
  window.document.getElementById('modeLastShift').click();
  assert.equal(window.document.getElementById('lastShift').hidden, false);
  assert.equal(window.document.getElementById('shiftCompareMode').hidden, false);
  assert.equal(window.document.getElementById('shiftDivider').disabled, true);

  const routeDetails = window.document.getElementById('shiftDetails');
  routeDetails.open = true;
  routeDetails.dispatchEvent(new window.Event('toggle'));
  assert.equal(window.document.getElementById('shiftRouteDetails').hidden, false);
  assert.equal(window.document.getElementById('shiftClosedPath').hidden, false, 'M1 shows the closed continuation beyond the pressure seal');
  assert.equal(window.document.getElementById('shiftBypassPath').hidden, false, 'M1 shows the separate surviving bypass');
  assert.equal(window.document.getElementById('shiftDockBranchPath').classList.contains('unavailable'), true);

  const month = window.document.getElementById('shiftMonth');
  month.value = '0'; month.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(window.__meridian.lastShift.pair('dock', 0).monthZeroMatches, true);
  assert.equal(window.document.getElementById('shiftSealMark').hidden, true, 'M0 leaves the route seal marker inactive');
  assert.equal(window.document.getElementById('shiftClosedPath').hidden, true);
  assert.equal(window.document.getElementById('shiftDockBranchPath').classList.contains('unavailable'), false);
  window.document.querySelector('[data-shift-stage="hydro"]').click();
  assert.equal(window.__meridian.lastShift.selection.stage, 'hydro');
  assert.equal(window.__meridian.lastShift.selection.month, 4);
  assert.equal(window.__meridian.lastShift.pair('hydro', 4).historicalState.t, 63.9);
  window.document.querySelector('[data-shift-stage="glass"]').click();
  assert.equal(window.__meridian.lastShift.selection.month, 3);
  assert.equal(window.__meridian.lastShift.pair('glass', 3).historicalState.landmarks.maraInLane, true);
  window.document.getElementById('shiftCompareMode').click();
  assert.equal(window.__meridian.lastShift.selection.pane, 'intact');
  assert.equal(window.__meridian.t, savedTime);
  assert.equal(window.__meridian.stateHash(window.__meridian.t), savedHash);
});

test('Last Shift divider range and touch pointer keep a single normalized comparison', async () => {
  const { window } = await boot({ width: 1280, height: 800 });
  window.document.getElementById('modeLastShift').click();
  const slider = window.document.getElementById('shiftDivider');
  slider.value = '64'; slider.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(window.__meridian.lastShift.selection.divider, 0.64);
  const canvas = window.document.getElementById('shiftCanvas');
  canvas.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, clientX: 819 }));
  canvas.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 720 }));
  assert.ok(window.__meridian.lastShift.selection.divider < 0.64, 'pointer-drag moves the divider without changing time');
});

test('every chapter boundary renders without throwing', async () => {
  const { window } = await boot();
  for (const t of [0, ...window.__meridian.CHAPTERS.flatMap(c => [c.start, c.end]), 29.9, 83, 86, 88.5, 90]) {
    window.__meridian.seek(t);
  }
});
