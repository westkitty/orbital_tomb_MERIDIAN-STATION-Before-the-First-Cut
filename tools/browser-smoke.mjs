// Real Chromium smoke/review for the static Pages subpath. In CI, the same
// script tests a fresh dist server before deploy and the public URL after deploy.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpus, platform, release } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const artifactDir = path.join(root, process.env.BROWSER_ARTIFACT_DIR || 'artifacts/browser');
const sitePrefix = '/orbital_tomb_MERIDIAN-STATION-Before-the-First-Cut/';
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

async function startSubpathServer() {
  assert.ok(existsSync(path.join(dist, 'index.html')), 'run npm run build before browser smoke');
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      if (!pathname.startsWith(sitePrefix)) { response.writeHead(404).end('not found'); return; }
      const relative = decodeURIComponent(pathname.slice(sitePrefix.length)).replace(/^\/+/, '') || 'index.html';
      const filename = path.resolve(dist, relative);
      if (filename !== dist && !filename.startsWith(dist + path.sep)) { response.writeHead(403).end('forbidden'); return; }
      const body = await readFile(filename);
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      });
      response.end(body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}${sitePrefix}` };
}

async function waitForLiveSha(baseUrl, expectedSha) {
  if (!expectedSha) return null;
  let last = 'no response';
  for (let attempt = 0; attempt < 18; attempt++) {
    try {
      const response = await fetch(new URL(`build-info.json?verify=${Date.now()}`, baseUrl), { cache: 'no-store' });
      if (response.ok) {
        const info = await response.json();
        last = info.sha || 'build-info has no sha';
        if (info.sha === expectedSha) return info;
      } else last = `HTTP ${response.status}`;
    } catch (error) { last = error.message; }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  assert.fail(`Live build-info.json did not report expected SHA ${expectedSha}; last response: ${last}`);
}

function watchDiagnostics(page, errors, failedRequests) {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText || 'failed'}`));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
}

async function setTime(page, time) {
  await page.locator('#scrub').evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, time);
  await page.waitForFunction((expected) => Math.abs(window.__meridian.t - expected) < 0.001, time);
}

async function stableFilmFrameData(page, time) {
  return page.locator('#film').evaluate((canvas, expected) => {
    // Chromium's Canvas gradient raster can vary for its first couple of redraws
    // on a reused backing store. Force the paused frame through the renderer a
    // few times, then compare the settled image—not a transient first paint.
    for (let pass = 0; pass < 3; pass++) window.__meridian.seek(expected);
    return canvas.toDataURL();
  }, time);
}

async function setShiftStage(page, stage) {
  await page.locator(`[data-shift-stage="${stage}"]`).click();
  await page.waitForFunction((expected) => window.__meridian.lastShift.selection.stage === expected, stage);
}

async function setShiftMonth(page, month) {
  await page.locator('#shiftMonth').evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, month);
  await page.waitForFunction((expected) => window.__meridian.lastShift.selection.month === expected, month);
}

async function matchedPanePixelStats(page) {
  return page.locator('#shiftCanvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d');
    const half = Math.floor(canvas.width / 2);
    const margin = 10;
    const sampleWidth = half - margin * 2;
    const sampleHeight = canvas.height - margin * 2;
    const left = ctx.getImageData(margin, margin, sampleWidth, sampleHeight).data;
    const right = ctx.getImageData(half + margin, margin, sampleWidth, sampleHeight).data;
    let differentPixels = 0;
    let maxChannelDelta = 0;
    let totalChannelDelta = 0;
    for (let i = 0; i < left.length; i += 4) {
      let pixelDelta = 0;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(left[i + channel] - right[i + channel]);
        pixelDelta = Math.max(pixelDelta, delta);
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        totalChannelDelta += delta;
      }
      if (pixelDelta > 0) differentPixels++;
    }
    const pixelCount = sampleWidth * sampleHeight;
    return {
      width: sampleWidth, height: sampleHeight,
      differentPixels, pixelCount,
      differentPixelRatio: differentPixels / pixelCount,
      maxChannelDelta,
      meanChannelDelta: totalChannelDelta / left.length,
    };
  });
}

async function captureShiftCanvas(page, basename, artifactDir) {
  const selection = await page.evaluate(() => window.__meridian.lastShift.selection);
  const canvas = page.locator('#shiftCanvas');
  if (selection.quality === 'fallback' || selection.quality === 'single-pane') {
    if (selection.pane !== 'intact') await page.locator('#shiftCompareMode').click();
    await canvas.screenshot({ path: path.join(artifactDir, `${basename}-intact.png`), animations: 'disabled' });
    await page.locator('#shiftCompareMode').click();
    await canvas.screenshot({ path: path.join(artifactDir, `${basename}-month.png`), animations: 'disabled' });
    return { selection, captures: [`${basename}-intact.png`, `${basename}-month.png`] };
  }
  const filename = `${basename}-comparison.png`;
  await canvas.screenshot({ path: path.join(artifactDir, filename), animations: 'disabled' });
  return { selection, captures: [filename] };
}

await mkdir(artifactDir, { recursive: true });
let server;
let baseUrl = process.env.MERIDIAN_BASE_URL;
if (!baseUrl) {
  const local = await startSubpathServer();
  server = local.server;
  baseUrl = local.baseUrl;
}
if (!baseUrl.endsWith('/')) baseUrl += '/';
const expectedSha = process.env.EXPECTED_SHA || '';
let liveInfo = null;
let browser;
let lastShiftPerformance = null;
let lastShiftCaptures = [];
let lastShiftWalkErrors = [];
let lastShiftWalkFailures = [];
try {
  liveInfo = await waitForLiveSha(baseUrl, expectedSha);
  const browserLaunchOptions = { headless: true };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    browserLaunchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  if (process.env.PLAYWRIGHT_CHROMIUM_ARGS) {
    browserLaunchOptions.args = JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS);
  }
  browser = await chromium.launch(browserLaunchOptions);
  const browserVersion = browser.version();
  const errors = [];
  const failedRequests = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  watchDiagnostics(page, errors, failedRequests);
  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), `site root should load, got ${response?.status()}`);
  await page.waitForFunction(() => !!window.__meridian);
  const initialRenderer = await page.evaluate(() => window.__meridian.render3d());
  assert.ok(initialRenderer.available, `WebGL renderer should initialize in Chromium: ${initialRenderer.reason || 'unavailable'}`);
  assert.equal(initialRenderer.renderer, 'three.js WebGLRenderer');
  await page.waitForTimeout(250);

  // A genuine user control start/pause cycle, then a chapter jump to M6.
  await page.locator('#restart').click();
  await page.locator('#play').click();
  const pausedAt = await page.evaluate(() => window.__meridian.t);
  await page.locator('#play').click();
  await page.waitForTimeout(1000);
  await page.locator('#play').click();
  const timeAfterStart = await page.evaluate(() => window.__meridian.t);
  assert.ok(timeAfterStart >= pausedAt + 0.35, 'play advances the authored timeline');

  await page.locator('#modeInspect').click();
  await page.locator('.chapters button[data-start="80"]').click();
  const m6 = await page.evaluate(() => ({ t: window.__meridian.t, chapter: window.__meridian.stateAt(window.__meridian.t).chapter }));
  assert.equal(m6.t, 80);
  assert.equal(m6.chapter, 'm6');

  // Exact cut boundary, physical system selection, and matched-camera immutability.
  await setTime(page, 29.9);
  assert.equal(await page.evaluate(() => window.__meridian.stateAt(window.__meridian.t).armsIntact), 12);
  await setTime(page, 30.0);
  assert.equal(await page.evaluate(() => window.__meridian.stateAt(window.__meridian.t).arm01.phase), 'peeling');
  const beforeHash = await page.evaluate(() => window.__meridian.stateHash(window.__meridian.t));
  const cameraCuts = await page.evaluate(() => window.__meridian.MATCH_CUTS.map((cut) => ({
    at: cut.at,
    before: window.__meridian.shotAt(cut.at - 0.001),
    after: window.__meridian.shotAt(cut.at),
  })));
  assert.deepEqual(cameraCuts.map((cut) => cut.at), [30, 40, 60]);
  for (const cut of cameraCuts) assert.deepEqual(cut.before.camera, cut.after.camera, `matched camera at ${cut.at}s`);

  await page.locator('#beforeAfter').check();
  await page.locator('#baCamera').selectOption('hydro');
  assert.equal(await page.evaluate(() => window.__meridian.stateHash(window.__meridian.t)), beforeHash);
  await page.locator('#system').selectOption('hydro');
  assert.equal(await page.evaluate(() => window.__meridian.t), 18);

  // Keyboard shortcuts work from the page, not from focused native controls.
  await page.evaluate(() => document.activeElement?.blur());
  const playingBeforeSpace = await page.evaluate(() => window.__meridian.playing);
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.__meridian.playing), !playingBeforeSpace);
  await page.keyboard.press('0');
  assert.ok(await page.evaluate(() => window.__meridian.t >= 80 && window.__meridian.t < 81), '0 jumps into M6 even while playback is running');
  await page.keyboard.press('ArrowRight');
  assert.ok(await page.evaluate(() => window.__meridian.t >= 81));

  // Capture actual Chromium stills from the clean, production Canvas at key beats.
  // The attention variants are an Inspect-only camera study; they never alter the cut.
  await page.evaluate(() => { if (window.__meridian.playing) document.getElementById('play').click(); });
  await page.locator('#beforeAfter').uncheck();
  await setTime(page, 26);
  const attentionHash = await page.evaluate(() => window.__meridian.stateHash(window.__meridian.t));
  const attentionCaptures = [];
  for (const [variant, label] of [
    ['survivor-notices-first', 'survivor-first'],
    ['audience-notices-first', 'audience-first'],
  ]) {
    await page.locator('#attentionVariant').selectOption(variant);
    const activeAttention = await page.evaluate(() => JSON.parse(document.getElementById('stateOut').textContent).cameraAttention);
    assert.equal(activeAttention, variant);
    const filename = `browser-attention-${label}-00m26.png`;
    await page.locator('#film').screenshot({ path: path.join(artifactDir, filename), animations: 'disabled' });
    attentionCaptures.push(filename);
  }
  assert.equal(await page.evaluate(() => window.__meridian.stateHash(window.__meridian.t)), attentionHash, 'attention cameras do not alter world state');
  await page.locator('#attentionVariant').selectOption('incumbent');
  await page.locator('#modeFilm').click();
  const filmGeometry = await page.evaluate(() => {
    const stage = document.getElementById('stage').getBoundingClientRect();
    const canvas = document.getElementById('film').getBoundingClientRect();
    return { stage: { width: stage.width, height: stage.height }, canvas: { width: canvas.width, height: canvas.height } };
  });
  assert.ok(Math.abs(filmGeometry.stage.width - filmGeometry.canvas.width) < 1, 'film Canvas fills the stage width after leaving Inspect');
  assert.ok(Math.abs(filmGeometry.stage.height - filmGeometry.canvas.height) < 1, 'film Canvas stays contained by the stage after leaving Inspect');

  // The additional frames document recurring actors and all three same-camera damage cuts.
  const captures = [
    ['browser-intact-docking.png', 6], ['browser-hydro-handoff.png', 18],
    ['browser-observation-crossing-opening.png', 26], ['browser-m1-match-before.png', 29.9],
    ['browser-m1-match-after.png', 33], ['browser-middle-hesh.png', 44],
    ['browser-m2-match-before.png', 39.9], ['browser-m2-match-after.png', 43.9],
    ['browser-m3-viewport-lane.png', 56], ['browser-m4-match-before.png', 59.9],
    ['browser-m4-rin-service-cut.png', 60.5], ['browser-m4-match-after.png', 63.9],
    ['browser-middle-hydro.png', 66], ['browser-m6-hands.png', 81],
    ['browser-m6-glass-crossing.png', 84], ['browser-m6-exterior.png', 85],
    ['browser-m6-bloom.png', 87], ['browser-return-hands.png', 89],
  ];
  await page.locator('#beforeAfter').uncheck();
  await page.evaluate(() => { if (window.__meridian.playing) document.getElementById('play').click(); });
  await page.locator('#modeFilm').click();
  const filmCanvas = page.locator('#film');
  let firstHandsFrame = '';
  for (const [filename, time] of captures) {
    await setTime(page, time);
    if (filename === 'browser-m6-hands.png') firstHandsFrame = await stableFilmFrameData(page, time);
    if (filename === 'browser-return-hands.png') {
      const returnHandsFrame = await stableFilmFrameData(page, time);
      assert.equal(returnHandsFrame, firstHandsFrame, 'settled Chromium M6 return hands are pixel-identical to M6 opening hands');
    }
    await filmCanvas.screenshot({ path: path.join(artifactDir, filename), animations: 'disabled' });
  }

  // Let playback reach its real end, verify Replay state, then restart with the button.
  await setTime(page, 89.8);
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__meridian.t === 90 && !window.__meridian.playing, null, { timeout: 10000 });
  assert.equal(await page.locator('#play').textContent(), 'Replay');
  await page.locator('#play').click();
  await page.waitForFunction(() => window.__meridian.t < 0.1 && window.__meridian.playing);

  // A touch-capable tablet-sized viewport is an emulation, not a hardware claim.
  const touchContext = await browser.newContext({
    viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  });
  const touchPage = await touchContext.newPage();
  const touchErrors = [], touchFailures = [];
  watchDiagnostics(touchPage, touchErrors, touchFailures);
  const touchResponse = await touchPage.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.ok(touchResponse?.ok());
  await touchPage.waitForFunction(() => !!window.__meridian);
  await touchPage.locator('#restart').click();
  const canvasBox = await touchPage.locator('#film').boundingBox();
  assert.ok(canvasBox && canvasBox.width > 600 && canvasBox.height > 300, 'film canvas remains usable at tablet-sized viewport');
  await touchPage.touchscreen.tap(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  assert.equal(await touchPage.evaluate(() => window.__meridian.playing), false);
  await touchPage.locator('#modeInspect').tap();
  await setTime(touchPage, 37.2);
  assert.equal(await touchPage.evaluate(() => window.__meridian.t), 37.2);
  await touchPage.screenshot({ path: path.join(artifactDir, 'browser-tablet-inspect-emulated.png'), animations: 'disabled' });

  await touchPage.locator('#modeLastShift').tap();
  await touchPage.locator('#lastShift').waitFor({ state: 'visible' });
  await touchPage.waitForFunction(() => window.__meridian.lastShift.selection.quality === 'single-pane');
  assert.equal(await touchPage.locator('#shiftCompareMode').isVisible(), true, 'narrow layout exposes the accessible comparison toggle');
  assert.equal(await touchPage.locator('#shiftDivider').isVisible(), false, 'narrow layout hides the drag divider range');
  await touchPage.locator('#shiftCompareMode').tap();
  assert.equal(await touchPage.evaluate(() => window.__meridian.lastShift.selection.pane), 'intact');
  await touchPage.locator('[data-shift-stage="hydro"]').tap();
  await setShiftMonth(touchPage, 4);
  assert.equal(await touchPage.evaluate(() => window.__meridian.lastShift.pair('hydro', 4).historicalState.lights.hydroPumps), false);
  await touchPage.screenshot({ path: path.join(artifactDir, 'browser-tablet-last-shift-emulated.png'), animations: 'disabled' });
  await touchPage.locator('#shiftReturn').tap();
  assert.equal(await touchPage.evaluate(() => window.__meridian.mode), 'film');

  await touchContext.close();
  await page.bringToFront();
  const performanceScenes = [
    [6, 'docking'], [18, 'hydroponics'], [26, 'observation chapel'],
    [33, 'M1 arm peel'], [43.9, 'M2 segment peel'], [56, 'M3 vent lane'],
    [63.9, 'M4 hydro rupture'], [74, 'M5 reliquary'], [81, 'M6 hands'],
    [84, 'M6 glass crossing'], [87, 'M6 bloom'],
  ];
  const performanceData = await page.evaluate(async (scenes) => {
    const percentile = (values, fraction) => {
      if (!values.length) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      return +sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(2);
    };
    const intervals = [];
    const renderWork = [];
    const sceneSamples = [];
    const play = document.getElementById('play');
    if (window.__meridian.playing) play.click();

    for (const [time, label] of scenes) {
      window.__meridian.seek(time);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.__meridian.resetMetrics();
      play.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (window.__meridian.playing) play.click();

      const sceneIntervals = window.__meridian.frameIntervals();
      const sceneRenderWork = window.__meridian.frameTimes();
      intervals.push(...sceneIntervals);
      renderWork.push(...sceneRenderWork);
      sceneSamples.push({
        scene: label,
        sampleCount: sceneIntervals.length,
        p95FrameIntervalMs: percentile(sceneIntervals, 0.95),
        p95RenderWorkMs: percentile(sceneRenderWork, 0.95),
      });
    }

    return {
      sampleCount: intervals.length,
      p50FrameIntervalMs: percentile(intervals, 0.50),
      p95FrameIntervalMs: percentile(intervals, 0.95),
      maxFrameIntervalMs: +Math.max(0, ...intervals).toFixed(2),
      p50RenderWorkMs: percentile(renderWork, 0.50),
      p95RenderWorkMs: percentile(renderWork, 0.95),
      maxRenderWorkMs: +Math.max(0, ...renderWork).toFixed(2),
      measurement: 'active playback; 300 ms per authored scene',
      sceneSamples,
      renderer3d: window.__meridian.render3d(),
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      documentVisibility: document.visibilityState,
      pageFocused: document.hasFocus(),
      scenesMeasured: scenes.map(([, label]) => label),
    };
  }, performanceScenes);

  // Record and exercise the complete optional after-film in a real browser.
  const walkthroughDir = path.join(artifactDir, 'last-shift-recording');
  await mkdir(walkthroughDir, { recursive: true });
  const walkthroughContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1,
    recordVideo: { dir: walkthroughDir, size: { width: 1440, height: 900 } },
  });
  const walkthroughPage = await walkthroughContext.newPage();
  watchDiagnostics(walkthroughPage, lastShiftWalkErrors, lastShiftWalkFailures);
  const walkthroughResponse = await walkthroughPage.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.ok(walkthroughResponse?.ok(), `Last Shift walkthrough page should load, got ${walkthroughResponse?.status()}`);
  await walkthroughPage.waitForFunction(() => !!window.__meridian);
  await walkthroughPage.evaluate(() => {
    if (window.__meridian.playing) document.getElementById('play').click();
    window.__meridian.resetMetrics();
  });
  const savedFilm = await walkthroughPage.evaluate(() => ({
    t: window.__meridian.t,
    playing: window.__meridian.playing,
    hash: window.__meridian.stateHash(window.__meridian.t),
  }));
  await walkthroughPage.locator('#modeLastShift').focus();
  await walkthroughPage.keyboard.press('Enter');
  await walkthroughPage.locator('#lastShift').waitFor({ state: 'visible' });
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.mode), 'lastshift');
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.t), savedFilm.t);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.playing), savedFilm.playing);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.stateHash(window.__meridian.t)), savedFilm.hash);

  // Keyboard-operable month range and real pointer divider on the wide layout.
  await walkthroughPage.locator('#shiftMonth').focus();
  await walkthroughPage.keyboard.press('Home');
  await walkthroughPage.waitForFunction(() => window.__meridian.lastShift.selection.month === 0);
  await walkthroughPage.keyboard.press('ArrowRight');
  await walkthroughPage.waitForFunction(() => window.__meridian.lastShift.selection.month === 1);
  let wideSelection = await walkthroughPage.evaluate(() => window.__meridian.lastShift.selection);
  if (!['fallback', 'single-pane'].includes(wideSelection.quality)) {
    const box = await walkthroughPage.locator('#shiftCanvas').boundingBox();
    assert.ok(box);
    await walkthroughPage.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await walkthroughPage.mouse.down();
    await walkthroughPage.mouse.move(box.x + box.width * 0.56, box.y + box.height * 0.5, { steps: 4 });
    await walkthroughPage.mouse.up();
    assert.ok((await walkthroughPage.evaluate(() => window.__meridian.lastShift.selection.divider)) > 0.5, 'pointer drag moves the real Canvas divider');
    await walkthroughPage.locator('#shiftDivider').evaluate((input) => {
      input.value = '50'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // Near-exact rendered pixel equality at Month 0 is checked before the measured
  // full-cost probe can switch this machine to its safe single-pane fallback.
  // Chromium may differ by a couple of channel values at antialiased edges, so
  // compare with a strict bounded per-pixel tolerance rather than raw FNV hashes.
  await setShiftMonth(walkthroughPage, 0);
  await walkthroughPage.evaluate(() => new Promise(requestAnimationFrame));
  const monthZeroPixelStats = await matchedPanePixelStats(walkthroughPage);
  const firstSelection = await walkthroughPage.evaluate(() => window.__meridian.lastShift.selection);
  if (firstSelection.quality !== 'fallback' && firstSelection.quality !== 'single-pane') {
    assert.ok(
      monthZeroPixelStats.differentPixelRatio <= 0.001 && monthZeroPixelStats.maxChannelDelta <= 3,
      `dock Month 0 panes diverged beyond raster tolerance: ${monthZeroPixelStats.differentPixels}/${monthZeroPixelStats.pixelCount} pixels; max channel delta ${monthZeroPixelStats.maxChannelDelta}`,
    );
    lastShiftCaptures.push(
      `dock Month 0 dual-pane raster match: ${monthZeroPixelStats.differentPixels}/${monthZeroPixelStats.pixelCount} changed pixels, max channel delta ${monthZeroPixelStats.maxChannelDelta}`,
    );
  } else {
    assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('dock', 0).monthZeroMatches), true);
    lastShiftCaptures.push('dock Month 0 state-hash match on single-pane fallback');
  }
  await walkthroughPage.locator('#shiftCanvas').screenshot({ path: path.join(artifactDir, 'browser-last-shift-dock-month0.png'), animations: 'disabled' });

  await setShiftMonth(walkthroughPage, 1);
  await walkthroughPage.locator('#shiftDetails summary').click();
  await walkthroughPage.locator('#shiftRouteMap').waitFor({ state: 'visible' });
  await walkthroughPage.waitForTimeout(1700); // cart reaches the seal; bypass trace starts separately
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('dock', 1).routeState.directOpen), false);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('dock', 1).routeState.bypassOpen), true);
  const routeDesc = await walkthroughPage.locator('#shiftRouteDesc').textContent();
  assert.match(routeDesc, /pressure closure/);
  assert.match(routeDesc, /separate service bypass open/);
  const dockCapture = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-dock-month1', artifactDir);
  lastShiftCaptures.push(...dockCapture.captures);

  await setShiftStage(walkthroughPage, 'hydro');
  await setShiftMonth(walkthroughPage, 0);
  const hydro0 = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-hydro-month0', artifactDir);
  lastShiftCaptures.push(...hydro0.captures);
  await setShiftMonth(walkthroughPage, 4);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('hydro', 4).historicalState.lights.hydroPumps), false);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('hydro', 4).historicalState.doors.hydroFarOpen), true);
  const hydro4 = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-hydro-month4', artifactDir);
  lastShiftCaptures.push(...hydro4.captures);

  await setShiftStage(walkthroughPage, 'glass');
  await setShiftMonth(walkthroughPage, 0);
  const glass0 = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-glass-month0', artifactDir);
  lastShiftCaptures.push(...glass0.captures);
  await setShiftMonth(walkthroughPage, 3);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('glass', 3).historicalState.landmarks.maraInLane), true);
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.lastShift.pair('glass', 3).historicalState.landmarks.rinInLane), true);
  const glass3 = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-glass-month3', artifactDir);
  lastShiftCaptures.push(...glass3.captures);

  await setShiftMonth(walkthroughPage, 6);
  await walkthroughPage.waitForTimeout(350);
  const glassCrossing = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-glass-month6-crossing', artifactDir);
  lastShiftCaptures.push(...glassCrossing.captures);
  await walkthroughPage.waitForTimeout(1150);
  const glassBloom = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-glass-month6-bloom', artifactDir);
  lastShiftCaptures.push(...glassBloom.captures);
  await walkthroughPage.waitForTimeout(1350);
  const glassReturn = await captureShiftCanvas(walkthroughPage, 'browser-last-shift-glass-month6-return', artifactDir);
  lastShiftCaptures.push(...glassReturn.captures);

  await walkthroughPage.waitForFunction(() => ['verified', 'fallback'].includes(window.__meridian.lastShift.selection.quality), null, { timeout: 10000 });
  const finalShiftSelection = await walkthroughPage.evaluate(() => window.__meridian.lastShift.selection);
  if (finalShiftSelection.quality === 'fallback') {
    assert.equal(await walkthroughPage.locator('#shiftCompareMode').isVisible(), true, 'measured fallback keeps the accessible pane toggle');
  } else {
    const metrics = await walkthroughPage.evaluate(() => window.__meridian.metrics().lastShiftProbe);
    assert.ok(metrics.p95FullRenderWorkMs < 22 && metrics.p95FullFrameIntervalMs < 33, 'two-pane rendering is enabled only after the full-cost probe passes');
  }
  lastShiftPerformance = await walkthroughPage.evaluate(() => ({
    selection: window.__meridian.lastShift.selection,
    metrics: window.__meridian.metrics(),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    userAgent: navigator.userAgent,
  }));
  await walkthroughPage.keyboard.press('Escape');
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.mode), 'film', 'Escape returns keyboard users from The Last Shift');
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.t), savedFilm.t, 'The Last Shift leaves film time untouched');
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.playing), savedFilm.playing, 'The Last Shift leaves playback state untouched');
  assert.equal(await walkthroughPage.evaluate(() => window.__meridian.stateHash(window.__meridian.t)), savedFilm.hash);
  await walkthroughPage.waitForTimeout(250);
  const walkthroughVideo = walkthroughPage.video();
  assert.ok(walkthroughVideo, 'Playwright records the actual dock walkthrough');
  await walkthroughPage.close();
  await walkthroughVideo.saveAs(path.join(artifactDir, 'browser-last-shift-dock-walkthrough.webm'));
  await walkthroughContext.close();

  const softwareWebGL = performanceData.renderer3d.softwareRenderer === true;
  const frameRateCertified = !softwareWebGL && performanceData.p95FrameIntervalMs < 33;
  const deviceData = {
    measuredAt: new Date().toISOString(),
    mode: expectedSha ? 'live-pages' : 'built-dist-subpath',
    url: baseUrl,
    expectedSha: expectedSha || null,
    liveBuildInfo: liveInfo,
    os: { platform: platform(), release: release() },
    cpu: cpus()[0]?.model || 'unknown',
    logicalCpuCount: cpus().length,
    browser: { name: 'Chromium', version: browserVersion },
    deviceClass: 'headless CI desktop viewport; not physical desktop or tablet hardware',
    performance: performanceData,
    attentionCameraEvidence: attentionCaptures,
    lastShiftPerformance,
    lastShiftEvidence: lastShiftCaptures,
    performanceTarget: {
      p95FrameIntervalBelow33ms: performanceData.p95FrameIntervalMs < 33,
      mainFilmFrameRateApplicable: !softwareWebGL,
      mainFilmFrameRateCertified: frameRateCertified,
      mainFilmFrameRateNote: softwareWebGL
        ? `not certified on software WebGL backend: ${performanceData.renderer3d.gpuRenderer}`
        : frameRateCertified ? 'passed on hardware-backed WebGL' : 'failed on hardware-backed WebGL',
      lastShiftDualRenderVerified: lastShiftPerformance.selection.quality === 'verified',
      lastShiftAccessibleFallback: lastShiftPerformance.selection.quality === 'fallback',
    },
    tabletViewport: { width: 768, height: 1024, isEmulated: true },
    consoleErrors: [...errors, ...touchErrors, ...lastShiftWalkErrors],
    failedRequests: [...failedRequests, ...touchFailures, ...lastShiftWalkFailures],
  };
  await writeFile(path.join(artifactDir, 'browser-metrics.json'), JSON.stringify(deviceData, null, 2) + '\n');
  assert.deepEqual([...errors, ...touchErrors, ...lastShiftWalkErrors], [], 'no browser console/page errors or HTTP failures');
  assert.deepEqual([...failedRequests, ...touchFailures, ...lastShiftWalkFailures], [], 'no failed browser asset requests');
  assert.ok(performanceData.sampleCount > 0, 'collected active-playback requestAnimationFrame samples');
  if (!softwareWebGL) {
    assert.ok(performanceData.sampleCount >= 30, 'collected enough hardware-backed frame samples');
    assert.ok(performanceData.p95FrameIntervalMs < 33, `95th percentile frame interval must remain below 33ms, measured ${performanceData.p95FrameIntervalMs}ms`);
  }

  const p95 = performanceData.p95FrameIntervalMs;
  console.log(`CHROMIUM PASS: ${browserVersion}; 1440×900; ${captures.length + attentionCaptures.length} review frames; ${errors.length} console/HTTP errors; ${failedRequests.length} failed requests`);
  console.log(softwareWebGL
    ? `FRAME METRICS: p95 RAF interval ${p95} ms; not certified because WebGL uses software backend ${performanceData.renderer3d.gpuRenderer}`
    : `FRAME METRICS: p95 RAF interval ${p95} ms (goal <33 ms); p95 synchronous render ${performanceData.p95RenderWorkMs} ms`);
  console.log(`BROWSER DEVICE: ${cpus()[0]?.model || 'unknown'}; ${cpus().length} logical CPUs; ${platform()} ${release()}; DPR ${performanceData.viewport.devicePixelRatio}`);
  console.log(`LAST SHIFT: ${lastShiftPerformance.selection.quality}; ${lastShiftCaptures.length} still/hash entries; dock walkthrough browser-last-shift-dock-walkthrough.webm`);
  if (expectedSha) console.log(`LIVE SHA PASS: ${liveInfo.sha} at ${baseUrl}`);
  await context.close();
} finally {
  try {
    if (browser) await browser.close();
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}
