// MERIDIAN STATION — film and inspection player.
// Playback clock, authored shot cues, and world state stay independent.
import { DURATION, CHAPTERS, stateAt, stateHash } from './sim.js';
import { CAMERAS, MATCH_CUTS, shotAt } from './cameras.js';
import { renderScene, letterbox } from './render.js';
import { LAST_SHIFT_STAGES, SHIFT_ROUTE, lastShiftJourney, lastShiftPair, lastShiftTime, routePointAt } from './last-shift.js';
import { drawLastShift } from './last-shift-render.js';

const canvas = document.getElementById('film');
const ctx = canvas.getContext('2d');
const shiftCanvas = document.getElementById('shiftCanvas');
const shiftCtx = shiftCanvas.getContext('2d');
const timeEl = document.getElementById('time');
const scrub = document.getElementById('scrub');
const playBtn = document.getElementById('play');
const stateOut = document.getElementById('stateOut');
const hud = document.getElementById('hud');
const sysSel = document.getElementById('system');
const baToggle = document.getElementById('beforeAfter');
const baCam = document.getElementById('baCamera');
const reducedToggle = document.getElementById('reduced');
const soundToggle = document.getElementById('sound');
const chapterButtons = [...document.querySelectorAll('.chapters button')];
const shiftModeButton = document.getElementById('modeLastShift');
const shiftStageButtons = [...document.querySelectorAll('[data-shift-stage]')];
const shiftMonthInput = document.getElementById('shiftMonth');
const shiftMonthLabel = document.getElementById('shiftMonthLabel');
const shiftDividerInput = document.getElementById('shiftDivider');
const shiftCompareButton = document.getElementById('shiftCompareMode');
const shiftAnnouncement = document.getElementById('shiftAnnouncement');
const shiftReadout = document.getElementById('shiftReadout');
const shiftExplanation = document.getElementById('shiftExplanation');
const shiftRouteDetails = document.getElementById('shiftRouteDetails');
const shiftDetails = document.getElementById('shiftDetails');
const shiftSound = document.getElementById('shiftSound');
const shiftStageCaptions = {
  intact: document.getElementById('shiftIntactCaption'),
  month: document.getElementById('shiftMonthCaption'),
};

let mode = 'film';
let playing = true;
let t = 0;
let lastTs = null;
let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let audioCtx = null;
let ambience = null;
let modeBeforeLastShift = 'film';
let shiftStage = 'dock';
let shiftMonth = 1;
let shiftDivider = 0.5;
let shiftActivePane = 'month';
let shiftStartedAt = 0;
let shiftGlassStartedAt = 0;
let shiftDraggingDivider = false;
let shiftQuality = 'idle'; // idle -> probing -> full, or accessible single-pane fallback
let shiftProbe = { intervals: [], renders: [] };
let shiftProbeResult = null;
let shiftLastGlassBeat = '';
const frameSamples = { intervals: [], render: [] };
const SAMPLE_LIMIT = 360;

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const ss = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${String(m).padStart(2, '0')}:${ss}`;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1.5 : 2);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.round(r.width * dpr));
  canvas.height = Math.max(240, Math.round(r.height * dpr));

  const shiftRect = shiftCanvas.getBoundingClientRect();
  const shiftDpr = shiftQuality === 'probing'
    ? Math.min(window.devicePixelRatio || 1, 1)
    : Math.min(window.devicePixelRatio || 1, reduced ? 1.5 : 2);
  shiftCanvas.width = Math.max(320, Math.round(shiftRect.width * shiftDpr));
  shiftCanvas.height = Math.max(240, Math.round(shiftRect.height * shiftDpr));
}
window.addEventListener('resize', () => {
  if (mode === 'lastshift') {
    if (window.innerWidth <= 900 && shiftQuality !== 'fallback') shiftQuality = 'single-pane';
    else if (window.innerWidth > 900 && shiftQuality === 'single-pane') {
      shiftQuality = 'probing';
      shiftProbe = { intervals: [], renders: [] };
      shiftProbeResult = null;
      shiftStartedAt = performance.now();
      shiftGlassStartedAt = shiftStartedAt;
    }
  }
  resize();
  if (mode === 'lastshift') { updateShiftControls(); draw(); }
});

function pushSample(key, value) {
  if (!Number.isFinite(value) || value < 0) return;
  const list = frameSamples[key];
  list.push(value);
  if (list.length > SAMPLE_LIMIT) list.shift();
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function performanceSummary() {
  return {
    sampleCount: frameSamples.intervals.length,
    p50FrameIntervalMs: +percentile(frameSamples.intervals, 0.50).toFixed(2),
    p95FrameIntervalMs: +percentile(frameSamples.intervals, 0.95).toFixed(2),
    maxFrameIntervalMs: +Math.max(0, ...frameSamples.intervals).toFixed(2),
    p50RenderWorkMs: +percentile(frameSamples.render, 0.50).toFixed(2),
    p95RenderWorkMs: +percentile(frameSamples.render, 0.95).toFixed(2),
    maxRenderWorkMs: +Math.max(0, ...frameSamples.render).toFixed(2),
    lastShiftQuality: shiftQuality,
    lastShiftProbe: shiftProbeResult,
  };
}

function shiftLayout() {
  return window.innerWidth <= 900 || shiftQuality === 'fallback' || shiftQuality === 'single-pane'
    ? 'toggle' : 'split';
}

function shiftGlassBeat(now = performance.now()) {
  if (shiftStage !== 'glass' || shiftMonth !== 6) return 'return';
  const elapsed = Math.max(0, (now - shiftGlassStartedAt) / 1000);
  if (elapsed < 1.35) return 'crossing';
  if (elapsed < 2.7) return 'bloom';
  return 'return';
}

function svgRoutePath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${(point.x * 100).toFixed(2)} ${(point.y * 56).toFixed(2)}`).join(' ');
}

function shiftNarrative(pair) {
  const state = pair.historicalState;
  if (shiftStage === 'dock') {
    if (shiftMonth === 0) return 'Month 0 reconstructs the same ordinary cart run in both panes. The route remains open, with one shared camera, cart identity and normalized local-plan schematic.';
    const route = state.paths.ringServiceBypass
      ? 'The recorded state marks the ring-service bypass open as a separate route.'
      : 'The ring-service bypass is not marked open in this recorded state.';
    const boundary = state.pressure.dockIsolation
      ? 'The surviving dock-isolation boundary contains the pressure loss and protects the connected transit volume.'
      : 'The dock-isolation boundary has not yet closed in this historical frame.';
    return `At ${fmt(pair.historicalTime)}, the original dock-terminal path is ${state.paths.dockTerminal ? 'open' : 'closed at the sealed threshold'}. ${route} ${boundary} The same cart ID, ${pair.cartId}, remains visible; its missing caster is not restored.`;
  }
  if (shiftStage === 'hydro') {
    if (shiftMonth === 0) return 'Both panes reconstruct the same planted rack, pump console and far opening. The intact irrigation cycle is animated in place.';
    return `At ${fmt(pair.historicalTime)}, the same hydroponic rack and far opening are reconstructed from Month ${shiftMonth}. The irrigation feed is ${state.lights.hydroPumps ? 'still powered' : 'unpowered'}, the rack is ${state.hydroRack.phase}, and the far opening is ${state.doors.hydroFarOpen ? 'exposed to vacuum' : 'still closed'}. The cut manifold and dark pump console show why the irrigation cycle is absent.`;
  }
  if (shiftMonth === 0) return 'The ordinary watch uses the same fixed observation-glass sightline on both sides.';
  if (shiftMonth === 3) return 'Month 3 returns to that sightline as Mara and Rin cross the viewport lane on their recurring path.';
  if (shiftMonth === 6) return 'The Month 6 passage leaves the glass, faces the assembled ruin, then returns inside to the film’s final hands-at-the-pane frame.';
  return `The Observation Glass view is reconstructed from the actual Month ${shiftMonth} state at ${fmt(pair.historicalTime)}. No character, route or damage is added by the comparison.`;
}

function updateShiftRouteMarkers(now = performance.now()) {
  if (shiftStage !== 'dock') return;
  const pair = lastShiftPair(shiftStage, shiftMonth, shiftGlassBeat(now));
  const elapsed = Math.max(0, (now - shiftStartedAt) / 1000);
  const journey = lastShiftJourney(pair.routeState, elapsed);
  const cartPath = pair.routeState.directOpen ? SHIFT_ROUTE.direct : SHIFT_ROUTE.sealedApproach;
  const cartPoint = routePointAt(cartPath, journey.cartProgress);
  const cartNode = document.getElementById('shiftCartNode');
  cartNode.setAttribute('cx', String(cartPoint.x * 100));
  cartNode.setAttribute('cy', String(cartPoint.y * 56));

  const traceNode = document.getElementById('shiftBypassTrace');
  traceNode.hidden = !pair.routeState.bypassOpen;
  if (pair.routeState.bypassOpen) {
    const trace = routePointAt(SHIFT_ROUTE.bypass, journey.bypassTraceProgress ?? 0);
    traceNode.setAttribute('cx', String(trace.x * 100));
    traceNode.setAttribute('cy', String(trace.y * 56));
  }
}

function updateShiftControls(now = performance.now()) {
  const glassBeat = shiftGlassBeat(now);
  const pair = lastShiftPair(shiftStage, shiftMonth, glassBeat);
  const stage = LAST_SHIFT_STAGES.find((item) => item.id === shiftStage) || LAST_SHIFT_STAGES[0];
  const monthLabel = shiftMonth === 0 ? 'Month 0 · ordinary shift' : `Month ${shiftMonth} · ${fmt(pair.historicalTime)}`;
  shiftMonthInput.value = String(shiftMonth);
  shiftMonthLabel.textContent = monthLabel;
  shiftMonthInput.setAttribute('aria-valuetext', monthLabel);
  shiftStageButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.shiftStage === shiftStage)));
  shiftStageCaptions.intact.textContent = `INTACT SHIFT · ${fmt(pair.intactTime)}`;
  shiftStageCaptions.month.textContent = shiftMonth === 0 ? 'MONTH 0 · MATCHED STATE' : `MONTH ${shiftMonth} · ${fmt(pair.historicalTime)}`;
  shiftExplanation.textContent = shiftNarrative(pair);

  const layout = shiftLayout();
  shiftCompareButton.hidden = layout !== 'toggle';
  shiftCompareButton.textContent = shiftActivePane === 'month' ? 'Show intact view' : `Show Month ${shiftMonth}`;
  shiftCompareButton.setAttribute('aria-label', shiftCompareButton.textContent);
  shiftCompareButton.setAttribute('aria-pressed', String(shiftActivePane === 'month'));
  shiftDividerInput.disabled = layout === 'toggle';
  shiftDividerInput.value = String(Math.round(shiftDivider * 100));
  document.body.classList.toggle('shift-fallback', shiftQuality === 'fallback');
  document.body.classList.toggle('shift-toggle-layout', layout === 'toggle');

  shiftRouteDetails.hidden = !(shiftDetails.open && shiftStage === 'dock');
  const directPath = document.getElementById('shiftDirectPath');
  const bypassPath = document.getElementById('shiftBypassPath');
  const sealMark = document.getElementById('shiftSealMark');
  const seal = SHIFT_ROUTE.pressureClosure;
  const dockBranch = document.getElementById('shiftDockBranchPath');
  directPath.setAttribute('d', svgRoutePath(pair.routeState.directOpen ? SHIFT_ROUTE.direct : SHIFT_ROUTE.sealedApproach));
  const closedPath = document.getElementById('shiftClosedPath');
  closedPath.setAttribute('d', svgRoutePath(SHIFT_ROUTE.closedContinuation));
  closedPath.hidden = pair.routeState.directOpen;
  dockBranch.setAttribute('d', svgRoutePath(SHIFT_ROUTE.dockingBranch));
  dockBranch.classList.toggle('unavailable', !pair.routeState.directOpen);
  bypassPath.setAttribute('d', svgRoutePath(SHIFT_ROUTE.bypass));
  bypassPath.hidden = !pair.routeState.bypassOpen;
  const sealX = seal.x * 100, sealY = seal.y * 56;
  sealMark.hidden = !pair.routeState.pressureBoundary;
  sealMark.setAttribute('x1', String(sealX - 3.2)); sealMark.setAttribute('y1', String(sealY - 3.2));
  sealMark.setAttribute('x2', String(sealX + 3.2)); sealMark.setAttribute('y2', String(sealY + 3.2));
  const dockNode = SHIFT_ROUTE.dockingBranch.at(-1);
  const ringNode = SHIFT_ROUTE.direct.at(-1);
  for (const [id, node] of [['shiftDockNode', dockNode], ['shiftRingNode', ringNode]]) {
    const marker = document.getElementById(id);
    marker.setAttribute('cx', String(node.x * 100));
    marker.setAttribute('cy', String(node.y * 56));
  }
  document.getElementById('shiftBypassLabel').hidden = !pair.routeState.bypassOpen;
  document.getElementById('shiftSealLabel').hidden = !pair.routeState.pressureBoundary;
  document.getElementById('shiftRouteDesc').textContent = pair.routeState.bypassOpen
    ? 'The intact center route ends at the pressure closure and the docking spur is marked unavailable. The recorded state marks a separate service bypass open; the diagram is not a traversal test.'
    : 'The intact center route and docking spur are open in the recorded state. This local plan schematic is not a surveyed whole-station map.';
  updateShiftRouteMarkers(now);

  const routeSummary = shiftStage === 'dock'
    ? `${pair.routeState.directOpen ? 'Original route open' : 'Original route sealed'}; service bypass ${pair.routeState.bypassOpen ? 'marked open in state' : 'not marked open'}.`
    : '';
  shiftCanvas.setAttribute('aria-label', layout === 'toggle'
    ? `${stage.label} comparison. Showing ${shiftActivePane === 'month' ? `Month ${shiftMonth}` : 'the intact shift'} only. Use the comparison button to change panes.`
    : 'The Last Shift comparison. The intact shift is on the left and the selected month is on the right. Drag the divider to reveal more of either matched view.');
  shiftAnnouncement.textContent = `${stage.label}; ${monthLabel}. Intact frame ${fmt(pair.intactTime)}. Historical frame ${fmt(pair.historicalTime)}.${routeSummary ? ` ${routeSummary}` : ''} The film clock is unchanged.`;
  shiftReadout.textContent = shiftStage === 'dock'
    ? `${stage.label}, ${monthLabel}; shared cart ${pair.cartId}; ${routeSummary}`
    : shiftNarrative(pair);
  return pair;
}

function drawLastShiftFrame(now = performance.now()) {
  const elapsed = Math.max(0, (now - shiftStartedAt) / 1000);
  return drawLastShift(shiftCtx, shiftCanvas.width, shiftCanvas.height, {
    stage: shiftStage,
    month: shiftMonth,
    layout: shiftLayout(),
    activePane: shiftActivePane,
    divider: shiftDivider,
    elapsed,
    reduced: reduced || shiftQuality === 'probing',
    showRoute: false,
    labels: false,
    glassBeat: shiftGlassBeat(now),
  });
}

function finishShiftProbe(now = performance.now()) {
  const p95Render = percentile(shiftProbe.renders, 0.95);
  const p95Interval = percentile(shiftProbe.intervals.filter((value) => value > 0), 0.95);
  const result = {
    probeSamples: shiftProbe.renders.length,
    p95ProbeRenderWorkMs: +p95Render.toFixed(2),
    p95ProbeFrameIntervalMs: +p95Interval.toFixed(2),
    decision: 'single-pane-fallback',
  };
  if (shiftQuality === 'probing' && p95Render < 18 && p95Interval < 33) {
    shiftQuality = 'full-check';
    result.decision = 'test-full-two-pane-render';
    shiftProbe = { intervals: [], renders: [] };
  } else {
    shiftQuality = 'fallback';
    result.decision = 'accessible-single-pane-fallback';
  }
  shiftProbeResult = result;
  resize();
  updateShiftControls(now);
}

function verifyFullShiftRender(now = performance.now()) {
  const p95Render = percentile(shiftProbe.renders, 0.95);
  const p95Interval = percentile(shiftProbe.intervals.filter((value) => value > 0), 0.95);
  shiftProbeResult = {
    ...shiftProbeResult,
    fullSamples: shiftProbe.renders.length,
    p95FullRenderWorkMs: +p95Render.toFixed(2),
    p95FullFrameIntervalMs: +p95Interval.toFixed(2),
    decision: p95Render < 22 && p95Interval < 33 ? 'full-two-pane-verified' : 'accessible-single-pane-fallback',
  };
  shiftQuality = shiftProbeResult.decision === 'full-two-pane-verified' ? 'verified' : 'fallback';
  if (shiftQuality === 'fallback') resize();
  updateShiftControls(now);
}

function draw() {
  if (mode === 'lastshift') {
    drawLastShiftFrame();
    return;
  }
  const s = stateAt(t);
  const shot = shotAt(t);
  const opts = { reduced, shot, camera: shot.camera };
  if (mode === 'inspect' && baToggle.checked) {
    const cam = CAMERAS[baCam.value] || CAMERAS.docking;
    opts.beforeAfter = { split: 0.5, intactState: stateAt(cam.intactT), cam: baCam.value };
  }
  renderScene(ctx, canvas.width, canvas.height, s, opts);
  if (mode === 'film') letterbox(ctx, canvas.width, canvas.height);

  timeEl.textContent = `${fmt(t)} / 01:30 · ${s.chapterLabel} · M${s.month}`;
  scrub.value = String(t);

  if (mode === 'inspect') {
    hud.innerHTML = `<b>${shot.id}</b> · ${s.chapterLabel}<br>Arms intact: ${s.armsIntact}/12 · Scars: ${s.scars.length}<br>Hash: ${stateHash(t)}`;
    stateOut.textContent = JSON.stringify({
      t: +t.toFixed(2), chapter: s.chapter, month: s.month, shot: shot.id,
      ids: s.ids, armsIntact: s.armsIntact, arm01: s.arm01.phase,
      segment02: s.segment02.phase, hydro: s.hydroRack.phase,
      doors: s.doors, paths: s.paths, lights: s.lights, props: s.props,
      landmarks: s.landmarks, components: s.components, scars: s.scars,
      stateHash: stateHash(t),
    }, null, 1);
  }
  for (const button of chapterButtons) {
    button.setAttribute('aria-current', String(+button.dataset.start <= t && t < +button.dataset.end));
  }
}

function loop(ts) {
  if (lastTs == null) lastTs = ts;
  const interval = Math.max(0, ts - lastTs);
  lastTs = ts;
  if (interval > 0) pushSample('intervals', interval);
  const start = performance.now();
  if (playing && mode !== 'lastshift') {
    t += interval / 1000;
    if (t >= DURATION) {
      t = DURATION;
      setPlaying(false);
    }
  }
  if (mode === 'lastshift') {
    const beat = shiftGlassBeat(performance.now());
    if (beat !== shiftLastGlassBeat) {
      shiftLastGlassBeat = beat;
      updateShiftControls();
    }
    updateShiftRouteMarkers();
    drawLastShiftFrame();
  } else draw();
  const renderMs = performance.now() - start;
  pushSample('render', renderMs);
  if (mode === 'lastshift' && (shiftQuality === 'probing' || shiftQuality === 'full-check')) {
    if (interval > 0) shiftProbe.intervals.push(interval);
    shiftProbe.renders.push(renderMs);
    if (shiftProbe.renders.length >= 60) {
      if (shiftQuality === 'probing') finishShiftProbe();
      else verifyFullShiftRender();
    }
  }
  requestAnimationFrame(loop);
}

function setPlaying(value) {
  playing = !!value;
  playBtn.textContent = playing ? 'Pause' : (t >= DURATION ? 'Replay' : 'Play');
  playBtn.setAttribute('aria-label', playing ? 'Pause film' : (t >= DURATION ? 'Replay film' : 'Play film'));
}

playBtn.addEventListener('click', () => {
  if (t >= DURATION && !playing) {
    t = 0;
    setPlaying(true);
  } else {
    setPlaying(!playing);
  }
});
document.getElementById('restart').addEventListener('click', () => { t = 0; setPlaying(true); draw(); });
document.getElementById('back').addEventListener('click', () => { t = Math.max(0, t - 1); draw(); });
document.getElementById('fwd').addEventListener('click', () => { t = Math.min(DURATION, t + 1); draw(); });
scrub.addEventListener('input', () => { t = Math.min(DURATION, Math.max(0, Number.parseFloat(scrub.value) || 0)); draw(); });

for (const button of chapterButtons) {
  button.addEventListener('click', () => { t = Number(button.dataset.start); draw(); });
}

document.getElementById('modeFilm').addEventListener('click', () => setMode('film'));
document.getElementById('modeInspect').addEventListener('click', () => setMode('inspect'));
shiftModeButton.addEventListener('click', () => setMode('lastshift'));
document.getElementById('shiftReturn').addEventListener('click', () => setMode('film'));

function setMode(nextMode) {
  if (!['film', 'inspect', 'lastshift'].includes(nextMode)) return;
  if (nextMode === 'lastshift' && mode !== 'lastshift') {
    modeBeforeLastShift = mode;
    shiftStartedAt = performance.now();
    shiftGlassStartedAt = shiftStartedAt;
    shiftActivePane = 'month';
    shiftQuality = window.innerWidth <= 900 ? 'single-pane' : 'probing';
    shiftProbe = { intervals: [], renders: [] };
    shiftProbeResult = null;
    shiftLastGlassBeat = shiftGlassBeat(shiftStartedAt);
  }
  mode = nextMode;
  const lastShiftPanel = document.getElementById('lastShift');
  lastShiftPanel.hidden = mode !== 'lastshift';
  document.body.classList.toggle('film', mode === 'film');
  document.body.classList.toggle('lastshift', mode === 'lastshift');
  document.body.classList.toggle('shift-fallback', mode === 'lastshift' && shiftQuality === 'fallback');
  document.body.classList.toggle('shift-toggle-layout', mode === 'lastshift' && shiftLayout() === 'toggle');
  document.getElementById('modeFilm').setAttribute('aria-pressed', String(mode === 'film'));
  document.getElementById('modeInspect').setAttribute('aria-pressed', String(mode === 'inspect'));
  shiftModeButton.setAttribute('aria-pressed', String(mode === 'lastshift'));
  resize();
  if (mode === 'lastshift') updateShiftControls();
  draw();
}

for (const button of shiftStageButtons) {
  button.addEventListener('click', () => {
    const nextStage = LAST_SHIFT_STAGES.some((item) => item.id === button.dataset.shiftStage)
      ? button.dataset.shiftStage : 'dock';
    if (nextStage === shiftStage) return;
    shiftStage = nextStage;
    shiftMonth = { dock: 1, hydro: 4, glass: 3 }[shiftStage];
    shiftStartedAt = performance.now();
    shiftGlassStartedAt = shiftStartedAt;
    shiftLastGlassBeat = shiftGlassBeat(shiftStartedAt);
    updateShiftControls();
    draw();
  });
}
shiftMonthInput.addEventListener('input', () => {
  shiftMonth = Math.max(0, Math.min(6, Number(shiftMonthInput.value) || 0));
  shiftStartedAt = performance.now();
  shiftGlassStartedAt = shiftStartedAt;
  shiftLastGlassBeat = shiftGlassBeat(shiftGlassStartedAt);
  updateShiftControls();
  draw();
});
shiftDividerInput.addEventListener('input', () => {
  shiftDivider = Math.max(25, Math.min(75, Number(shiftDividerInput.value) || 50)) / 100;
  draw();
});
shiftCompareButton.addEventListener('click', () => {
  shiftActivePane = shiftActivePane === 'month' ? 'intact' : 'month';
  updateShiftControls();
  draw();
});
shiftDetails.addEventListener('toggle', () => { updateShiftControls(); draw(); });

function setShiftDividerFromPointer(event) {
  const rect = shiftCanvas.getBoundingClientRect();
  if (!rect.width) return;
  const ratio = (event.clientX - rect.left) / rect.width;
  shiftDivider = Math.max(0.25, Math.min(0.75, ratio));
  shiftDividerInput.value = String(Math.round(shiftDivider * 100));
  draw();
}
shiftCanvas.addEventListener('pointerdown', (event) => {
  if (shiftLayout() !== 'split') return;
  const rect = shiftCanvas.getBoundingClientRect();
  const localX = (event.clientX - rect.left) / Math.max(1, rect.width);
  if (Math.abs(localX - shiftDivider) > 0.065) return;
  shiftDraggingDivider = true;
  if (shiftCanvas.setPointerCapture) shiftCanvas.setPointerCapture(event.pointerId);
  setShiftDividerFromPointer(event);
});
shiftCanvas.addEventListener('pointermove', (event) => { if (shiftDraggingDivider) setShiftDividerFromPointer(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  shiftCanvas.addEventListener(type, () => { shiftDraggingDivider = false; });
}

shiftSound.checked = soundToggle.checked;
shiftSound.addEventListener('change', () => {
  soundToggle.checked = shiftSound.checked;
  soundToggle.dispatchEvent(new Event('change', { bubbles: true }));
});
soundToggle.addEventListener('change', () => { shiftSound.checked = soundToggle.checked; });

sysSel.addEventListener('change', () => {
  const jumps = { docking: 2, transit: 34, hydro: 18, chapel: 26, relay: 44, cryo: 74, sail: 76, antenna: 75 };
  if (jumps[sysSel.value] != null) { t = jumps[sysSel.value]; draw(); }
});
baToggle.addEventListener('change', draw);
baCam.addEventListener('change', draw);
reducedToggle.addEventListener('change', () => { reduced = reducedToggle.checked; resize(); draw(); });

// Optional generated ambience: one low fan-like tone plus filtered deterministic
// noise, created only after an explicit user gesture and reused on later toggles.
function createAmbience() {
  if (ambience) return ambience;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Web Audio is not available in this browser.');
  audioCtx = new Audio();
  const output = audioCtx.createGain();
  output.gain.value = 0.012;
  output.connect(audioCtx.destination);

  const fan = audioCtx.createOscillator();
  fan.type = 'sine';
  fan.frequency.value = 47;
  const fanGain = audioCtx.createGain();
  fanGain.gain.value = 0.68;
  fan.connect(fanGain).connect(output);
  fan.start();

  const sampleRate = audioCtx.sampleRate;
  const buffer = audioCtx.createBuffer(1, sampleRate * 2, sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x4d455249;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = ((seed / 4294967296) * 2 - 1) * 0.22;
  }
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 175;
  const noiseGain = audioCtx.createGain();
  noiseGain.gain.value = 0.045;
  noise.connect(filter).connect(noiseGain).connect(output);
  noise.start();
  ambience = { output, fan, noise };
  return ambience;
}

soundToggle.addEventListener('change', async () => {
  try {
    if (soundToggle.checked) {
      createAmbience();
      await audioCtx.resume();
    } else if (audioCtx) {
      await audioCtx.suspend();
    }
  } catch (error) {
    soundToggle.checked = false;
    shiftSound.checked = false;
    soundToggle.setAttribute('aria-describedby', 'soundStatus');
    const status = document.getElementById('soundStatus');
    if (status) status.textContent = 'Audio is unavailable in this browser.';
    console.warn('Optional ambience unavailable:', error.message);
  }
});

// Global shortcuts avoid stealing native control and text-editing behavior.
document.addEventListener('keydown', (event) => {
  if (mode === 'lastshift' && event.key === 'Escape' && !event.repeat) {
    event.preventDefault();
    setMode(modeBeforeLastShift === 'lastshift' ? 'film' : modeBeforeLastShift);
    return;
  }
  const target = event.target;
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (target && typeof target.matches === 'function' && target.matches('input,select,textarea,button,a,[contenteditable],[role="textbox"]')) return;
  if (mode === 'lastshift') {
    if (event.key.toLowerCase() === 'f') setMode('film');
    else if (event.key.toLowerCase() === 'i') setMode('inspect');
    return;
  }
  if (event.code === 'Space') { event.preventDefault(); playBtn.click(); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); t = Math.max(0, t - 1); draw(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); t = Math.min(DURATION, t + 1); draw(); }
  else if (event.key >= '1' && event.key <= '9') { const chapter = CHAPTERS[Number(event.key) - 1]; if (chapter) { t = chapter.start; draw(); } }
  else if (event.key === '0') { t = CHAPTERS.at(-1).start; draw(); }
  else if (event.key.toLowerCase() === 'f') setMode('film');
  else if (event.key.toLowerCase() === 'i') setMode('inspect');
});

canvas.addEventListener('click', () => { if (mode === 'film') playBtn.click(); });

// Visible to deterministic QA; this surface does not mutate story state.
window.__meridian = {
  get t() { return t; }, set t(value) { t = Math.min(DURATION, Math.max(0, Number(value) || 0)); draw(); },
  get playing() { return playing; },
  get mode() { return mode; },
  stateAt, stateHash, CHAPTERS, CAMERAS, MATCH_CUTS, shotAt, DURATION,
  lastShift: {
    pair: lastShiftPair,
    time: lastShiftTime,
    journey: lastShiftJourney,
    routePointAt,
    route: SHIFT_ROUTE,
    get selection() { return { stage: shiftStage, month: shiftMonth, pane: shiftActivePane, divider: shiftDivider, quality: shiftQuality }; },
  },
  frameTimes: () => [...frameSamples.render],
  metrics: performanceSummary,
  resetMetrics: () => { frameSamples.intervals.length = 0; frameSamples.render.length = 0; lastTs = null; },
  seek: (value) => { t = Math.min(DURATION, Math.max(0, Number(value) || 0)); draw(); },
};

reducedToggle.checked = reduced;
setMode('film');
resize();
requestAnimationFrame(loop);
