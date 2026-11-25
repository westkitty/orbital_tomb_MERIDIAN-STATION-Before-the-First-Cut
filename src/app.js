// MERIDIAN STATION — player shell. Viewing tools never change story state.
import { DURATION, CHAPTERS, CAMERAS, stateAt, stateHash } from './sim.js';
import { renderScene, letterbox } from './render.js';

const canvas = document.getElementById('film');
const ctx = canvas.getContext('2d');
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

let mode = 'film'; // film | inspect
let playing = true;
let t = 0;
let lastTs = null;
let reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let frameTimes = [];
let audioCtx = null, humGain = null;

function fmt(s) { const m = Math.floor(s / 60), ss = (s % 60).toFixed(1).padStart(4, '0'); return `${String(m).padStart(2, '0')}:${ss}`; }

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1.5 : 2);
  canvas.width = Math.max(320, Math.round(r.width * dpr));
  canvas.height = Math.max(240, Math.round(r.height * dpr));
}
window.addEventListener('resize', resize);

function currentState() { return stateAt(t); }

function draw() {
  const s = currentState();
  let opts = { reduced };
  if (mode === 'inspect' && baToggle.checked) {
    const cam = CAMERAS[baCam.value] || CAMERAS.docking;
    opts.beforeAfter = { split: 0.5, intactState: stateAt(cam.intactT), cam: baCam.value };
  }
  renderScene(ctx, canvas.width, canvas.height, s, opts);
  if (mode === 'film') letterbox(ctx, canvas.width, canvas.height);
  timeEl.textContent = `${fmt(t)} / 01:30 · ${s.chapterLabel} · M${s.month}`;
  scrub.value = String(t);
  hud.innerHTML = `<b>${s.chapterLabel}</b> · Month ${s.month}<br>Arms intact: ${s.armsIntact}/12 · Scars: ${s.scars.length}<br>Hash: ${stateHash(t)}`;
  if (mode === 'inspect') {
    stateOut.textContent = JSON.stringify({
      t: +t.toFixed(2), chapter: s.chapter, month: s.month, ids: s.ids, armsIntact: s.armsIntact,
      arm01: s.arm01.phase, segment02: s.segment02.phase, hydro: s.hydroRack.phase,
      doors: s.doors, paths: s.paths, lights: s.lights, props: s.props,
      landmarks: s.landmarks, components: s.components, scars: s.scars, hash: stateHash(t),
    }, null, 1);
  }
  // chapter highlight
  document.querySelectorAll('.chapters button').forEach(b => {
    b.setAttribute('aria-current', String(b.dataset.start <= t && t < b.dataset.end));
  });
}

function loop(ts) {
  if (lastTs == null) lastTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;
  const f0 = performance.now();
  if (playing) { t += dt; if (t >= DURATION) { t = DURATION; playing = false; playBtn.textContent = 'Replay'; } }
  draw();
  const ft = performance.now() - f0;
  frameTimes.push(ft); if (frameTimes.length > 300) frameTimes.shift();
  requestAnimationFrame(loop);
}

function setPlaying(p) { playing = p; playBtn.textContent = p ? 'Pause' : (t >= DURATION ? 'Replay' : 'Play'); }
playBtn.addEventListener('click', () => {
  if (t >= DURATION && !playing) { t = 0; setPlaying(true); }
  else setPlaying(!playing);
});
document.getElementById('restart').addEventListener('click', () => { t = 0; setPlaying(true); });
document.getElementById('back').addEventListener('click', () => { t = Math.max(0, t - 1); });
document.getElementById('fwd').addEventListener('click', () => { t = Math.min(DURATION, t + 1); });
scrub.addEventListener('input', () => { t = parseFloat(scrub.value); });

document.querySelectorAll('.chapters button').forEach(b => {
  b.addEventListener('click', () => { t = parseFloat(b.dataset.start); });
});

document.getElementById('modeFilm').addEventListener('click', () => setMode('film'));
document.getElementById('modeInspect').addEventListener('click', () => setMode('inspect'));
function setMode(m) {
  mode = m;
  document.body.classList.toggle('film', m === 'film');
  document.getElementById('modeFilm').setAttribute('aria-pressed', String(m === 'film'));
  document.getElementById('modeInspect').setAttribute('aria-pressed', String(m === 'inspect'));
  resize(); draw();
}

sysSel.addEventListener('change', () => {
  const v = sysSel.value;
  const jumps = { docking: 2, transit: 10, hydro: 18, chapel: 26, relay: 44, cryo: 74, sail: 76, antenna: 75 };
  if (jumps[v] != null) t = jumps[v];
});
baToggle.addEventListener('change', draw);
baCam.addEventListener('change', draw);
reducedToggle.addEventListener('change', () => { reduced = reducedToggle.checked; resize(); draw(); });

// Optional nonverbal machinery ambience (off by default; no music/speech).
soundToggle.addEventListener('change', async () => {
  if (soundToggle.checked) {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    const osc = audioCtx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 55;
    const filt = audioCtx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 220;
    humGain = audioCtx.createGain(); humGain.gain.value = 0.015;
    osc.connect(filt); filt.connect(humGain); humGain.connect(audioCtx.destination); osc.start();
  } else if (audioCtx) { await audioCtx.suspend(); }
});

// Keyboard: space play/pause, arrows scrub, 1-9 chapters, F/I modes.
document.addEventListener('keydown', (e) => {
  if (e.target && typeof e.target.matches === 'function' && e.target.matches('input,select,textarea,button,a,[contenteditable="true"]')) return;
  if (e.code === 'Space') { e.preventDefault(); playBtn.click(); }
  else if (e.key === 'ArrowLeft') { t = Math.max(0, t - 1); }
  else if (e.key === 'ArrowRight') { t = Math.min(DURATION, t + 1); }
  else if (e.key >= '1' && e.key <= '9') { const c = CHAPTERS[+e.key - 1]; if (c) t = c.start; }
  else if (e.key === '0') { t = CHAPTERS[CHAPTERS.length - 1].start; }
  else if (e.key === 'f' || e.key === 'F') setMode('film');
  else if (e.key === 'i' || e.key === 'I') setMode('inspect');
});

// Touch scrub is native via range input; canvas tap toggles play in film mode.
canvas.addEventListener('click', () => { if (mode === 'film') playBtn.click(); });

// Expose for tests / evidence capture.
window.__meridian = {
  get t() { return t; }, set t(v) { t = v; draw(); },
  get playing() { return playing; },
  stateAt, stateHash, CHAPTERS, CAMERAS, DURATION,
  frameTimes: () => [...frameTimes],
  seek: (v) => { t = v; draw(); },
};

reducedToggle.checked = reduced;
setMode('film');
resize();
requestAnimationFrame(loop);
