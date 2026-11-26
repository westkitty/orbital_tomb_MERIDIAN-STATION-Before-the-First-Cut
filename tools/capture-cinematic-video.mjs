// Capture genuine-browser, canvas-only motion excerpts for before/after review.
// The WebM is produced by Chromium's MediaRecorder from the live film canvas;
// it contains no player chrome, narration, music, or post-rendered animation.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const label = process.argv[2] || 'review';
const outputDir = path.resolve(root, process.argv[3] || 'evidence/cinematic3d');
const excerpts = [
  { id: 'opening', start: 0, end: 20 },
  { id: 'first-cut', start: 28, end: 40 },
  { id: 'finale', start: 80, end: 90 },
];

assert.ok(existsSync(path.join(dist, 'index.html')), 'run npm run build before capture');
await mkdir(outputDir, { recursive: true });
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const relative = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname).replace(/^\/+/, '') || 'index.html';
    const filename = path.resolve(dist, relative);
    if (filename !== dist && !filename.startsWith(dist + path.sep)) { response.writeHead(403).end('forbidden'); return; }
    const body = await readFile(filename);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404).end('not found'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/`;

const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (process.env.PLAYWRIGHT_CHROMIUM_ARGS) launchOptions.args = JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS);
const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });

try {
  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), `site load failed: ${response?.status()}`);
  await page.waitForFunction(() => !!window.__meridian);
  await page.locator('#modeFilm').click();
  await page.waitForTimeout(300);

  for (const { id, start, end } of excerpts) {
    await page.evaluate(() => {
      if (window.__meridian.playing) document.getElementById('play').click();
    });
    await page.evaluate((time) => window.__meridian.seek(time), start);
    await page.waitForTimeout(150);
    const canvas = await page.evaluate(() => {
      const preferred = document.getElementById('film3d');
      return preferred && getComputedStyle(preferred).display !== 'none' ? preferred.id : 'film';
    });
    const dimensions = await page.locator(`#${canvas}`).evaluate((node) => ({ width: node.width, height: node.height }));
    const setup = await page.evaluate(({ canvasId, filename }) => {
      const target = document.getElementById(canvasId);
      if (!target?.captureStream) throw new Error('Canvas captureStream is unavailable in this Chromium build.');
      const stream = target.captureStream(30);
      const mimeType = ['video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error('No WebM MediaRecorder codec is available.');
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2600000 });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.__captureResult = { mimeType, bytes: blob.size };
        setTimeout(() => { URL.revokeObjectURL(url); stream.getTracks().forEach((track) => track.stop()); }, 1000);
      };
      window.__captureRecorder = recorder;
      window.__captureResult = null;
      window.__captureFilename = filename;
      recorder.start(250);
      return { mimeType };
    }, { canvasId: canvas, filename: `${label}-${id}.webm` });

    const targetTime = end;
    const downloadPromise = page.waitForEvent('download', { timeout: (end - start) * 1000 + 20000 });
    await page.locator('#play').click();
    await page.waitForFunction((finish) => window.__meridian.t >= finish || !window.__meridian.playing, targetTime, {
      timeout: (end - start) * 1000 + 20000,
    });
    if (await page.evaluate(() => window.__meridian.playing)) await page.locator('#play').click();
    const resultPromise = page.evaluate(() => {
      window.__captureRecorder.stop();
      return new Promise((resolve, reject) => {
        const started = performance.now();
        const poll = () => {
          if (window.__captureResult) resolve(window.__captureResult);
          else if (performance.now() - started > 5000) reject(new Error('Recorder did not flush on stop.'));
          else setTimeout(poll, 20);
        };
        poll();
      });
    });
    const [download, result] = await Promise.all([downloadPromise, resultPromise]);
    const destination = path.join(outputDir, `${label}-${id}.webm`);
    await download.saveAs(destination);
    console.log(JSON.stringify({ file: path.relative(root, destination), start, end, canvas, ...dimensions, ...setup, ...result }));
  }

  assert.deepEqual(errors, [], `browser diagnostics: ${errors.join('; ')}`);
  console.log(JSON.stringify({ browser: browser.version(), viewport: { width: 1440, height: 900 }, errors }));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
