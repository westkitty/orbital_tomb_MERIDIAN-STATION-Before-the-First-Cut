// MERIDIAN STATION — rendering layer. Reads world state; never mutates it.
// Layered canvas art: stars, Virgil, station, interiors, crew. Bounded particles.
// Same camera/geometry reused for intact/damaged match cuts.

import { STARS, DEBRIS, GEOMETRY, OBSERVATION_GLASS_TRACK, observationGlassCrossingAt } from './sim.js';
import { CAMERAS, shotAt } from './cameras.js';

const CYAN = '#37e6ff', WARM = '#ffd9a0';

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

// ---------- shared layers ----------

export function drawStars(ctx, w, h, t, reduced) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#050a12'); g.addColorStop(0.6, '#04070d'); g.addColorStop(1, '#02040a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // faint nebula wash
  const neb = ctx.createRadialGradient(w * 0.82, h * 0.18, 10, w * 0.82, h * 0.18, w * 0.5);
  neb.addColorStop(0, 'rgba(60,80,120,0.20)'); neb.addColorStop(1, 'rgba(60,80,120,0)');
  ctx.fillStyle = neb; ctx.fillRect(0, 0, w, h);
  for (const s of STARS) {
    const tw = reduced ? 0.72 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.4 + s.tw));
    ctx.globalAlpha = 0.3 + 0.6 * tw;
    ctx.fillStyle = s.r > 1.2 ? '#eaf3ff' : '#b9cfe8';
    const x = s.x * w, y = s.y * h;
    ctx.fillRect(x, y, s.r, s.r);
    if (s.r > 1.3 && !reduced) { ctx.globalAlpha *= 0.35; ctx.fillRect(x - s.r, y + s.r / 2 - 0.25, s.r * 3, 0.5); ctx.fillRect(x + s.r / 2 - 0.25, y - s.r, 0.5, s.r * 3); }
  }
  ctx.globalAlpha = 1;
}

export function drawVirgil(ctx, w, h, t, reduced) {
  const cx = w * 0.74, cy = h * 0.82, r = Math.min(w, h) * 0.68;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.08, cx, cy, r);
  g.addColorStop(0, '#b8cfe2'); g.addColorStop(0.35, '#7d9cbd'); g.addColorStop(0.75, '#46607f'); g.addColorStop(1, '#1e2c3f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  // banded atmosphere, slightly sheared
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const bands = [['rgba(216,231,246,0.20)', 0.10], ['rgba(23,36,54,0.28)', 0.035], ['rgba(180,200,220,0.12)', 0.16], ['rgba(30,45,66,0.30)', 0.05], ['rgba(210,226,242,0.10)', 0.08], ['rgba(18,30,46,0.34)', 0.09]];
  let y = cy - r * 0.95;
  bands.forEach(([col, hh], i) => {
    ctx.fillStyle = col;
    const shear = Math.sin(t * 0.03 + i * 1.7) * r * 0.01;
    ctx.beginPath();
    ctx.moveTo(cx - r, y + shear);
    ctx.bezierCurveTo(cx - r * 0.4, y + r * 0.05 + shear, cx + r * 0.4, y - r * 0.05 + shear, cx + r, y + shear);
    ctx.lineTo(cx + r, y + r * (hh * 2.1));
    ctx.bezierCurveTo(cx + r * 0.4, y + r * (hh * 2.1) - r * 0.06, cx - r * 0.4, y + r * (hh * 2.1) + r * 0.06, cx - r, y + r * (hh * 2.1));
    ctx.closePath(); ctx.fill();
    y += r * (hh * 2.4);
  });
  // faint storm oval
  ctx.fillStyle = 'rgba(224,236,248,0.16)';
  ctx.beginPath(); ctx.ellipse(cx - r * 0.25, cy - r * 0.15, r * 0.18, r * 0.07, 0.1, 0, Math.PI * 2); ctx.fill();
  // limb highlight + terminator
  const rim = ctx.createRadialGradient(cx + r * 0.35, cy - r * 0.35, r * 0.55, cx, cy, r * 1.02);
  rim.addColorStop(0, 'rgba(8,13,21,0)'); rim.addColorStop(0.82, 'rgba(8,13,21,0)'); rim.addColorStop(1, 'rgba(230,242,252,0.35)');
  ctx.fillStyle = rim; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const sg = ctx.createLinearGradient(cx - r, cy + r * 0.15, cx + r, cy - r * 0.35);
  sg.addColorStop(0, 'rgba(5,9,15,0)'); sg.addColorStop(1, 'rgba(5,9,15,0.62)');
  ctx.fillStyle = sg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function vignette(ctx, w, h, strength = 0.55) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.45, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function panel(ctx, x, y, w, h, fillTop, fillBot) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, fillTop); g.addColorStop(1, fillBot);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(150,185,215,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function rivetRow(ctx, x1, y1, x2, y2, n) {
  ctx.fillStyle = 'rgba(170,200,228,0.4)';
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    ctx.beginPath(); ctx.arc(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, 1.1, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- exterior station ----------

export function drawStationExterior(ctx, w, h, state, t, reduced, camera = {}) {
  drawStars(ctx, w, h, t, reduced);
  drawVirgil(ctx, w, h, t, reduced);

  const cx = w * (camera.centerX ?? 0.40), cy = h * 0.50;
  const R = Math.min(w, h) * 0.30; // proxy scale for the 8.7 km ring diameter
  const ringOuter = 1;
  const ringInner = ringOuter * (1 - (2 * GEOMETRY.ringRadialThicknessKm) / GEOMETRY.ringDiameterKm);
  const armCount = GEOMETRY.initialDockingArms;
  const squish = 0.42; // orbit-tilt ellipse
  const arm01Gone = state.arm01.phase !== 'intact';
  const seg02Gone = ['detached', 'transit', 'placed'].includes(state.segment02.phase);
  const segmentGap = state.segment02.phase === 'peeling' ? state.segment02.peel : (seg02Gone ? 1 : 0);

  // Source proportions: 10.4 km above and 6.9 km below the 8.7 km outer diameter.
  // The proxy scales those extents to the same radius used by the station ring.
  const ringRadiusKm = GEOMETRY.ringDiameterKm / 2;
  const upperTip = R * GEOMETRY.spireAboveRingKm / ringRadiusKm;
  const lowerTip = R * GEOMETRY.spineBelowRingKm / ringRadiusKm;
  const spireBase = upperTip - R * 0.18;
  const spineBase = lowerTip - R * 0.18;
  const spireG = ctx.createLinearGradient(0, cy - spireBase, 0, cy + spineBase);
  spireG.addColorStop(0, '#6a8296'); spireG.addColorStop(0.5, '#3d5164'); spireG.addColorStop(1, '#2b3a4a');
  ctx.strokeStyle = spireG; ctx.lineCap = 'round';
  ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(cx, cy - spireBase); ctx.lineTo(cx, cy + spineBase); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, cy - upperTip); ctx.lineTo(cx, cy - spireBase); ctx.stroke(); // antenna mast
  ctx.beginPath(); ctx.moveTo(cx, cy + spineBase); ctx.lineTo(cx, cy + lowerTip); ctx.stroke(); // lower mast
  // truss struts at spire base
  ctx.lineWidth = 2; ctx.strokeStyle = '#4a6076';
  for (const dir of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dir * R * 0.55, cy - R * 0.62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dir * R * 0.55, cy + R * 0.62); ctx.stroke();
  }
  // bridge highlight
  ctx.strokeStyle = 'rgba(200,225,245,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - 1.5, cy - spireBase); ctx.lineTo(cx - 1.5, cy + spineBase); ctx.stroke();
  // A quiet navigation lamp in the intact years; a red warning pulse begins only with M1.
  const blink = state.t >= 30 && Math.sin(t * 2.4) > 0.55;
  ctx.fillStyle = state.t < 30 ? '#e4bd82' : (blink ? '#ff5a4a' : '#5a1f18');
  ctx.beginPath(); ctx.arc(cx, cy - upperTip, 3.2, 0, Math.PI * 2); ctx.fill();
  if (blink && !reduced) { ctx.fillStyle = 'rgba(255,90,74,0.18)'; ctx.beginPath(); ctx.arc(cx, cy - upperTip, 9, 0, Math.PI * 2); ctx.fill(); }

  // Inspection cameras operate on the complete station view in renderCam().
  // Annulus thickness follows the 1.3 km / 8.7 km geometry-lock ratio.
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, squish);
  const ringG = ctx.createRadialGradient(0, 0, R * ringInner, 0, 0, R * ringOuter);
  ringG.addColorStop(0, '#1b2733'); ringG.addColorStop(0.35, '#55697e'); ringG.addColorStop(0.5, '#8ca3b9'); ringG.addColorStop(0.65, '#415062'); ringG.addColorStop(1, '#141d28');
  ctx.fillStyle = ringG;
  ctx.beginPath(); ctx.arc(0, 0, R * ringOuter, 0, Math.PI * 2); ctx.arc(0, 0, R * ringInner, 0, Math.PI * 2); ctx.fill('evenodd');
  // three structural seams per fixed docking arm
  ctx.strokeStyle = 'rgba(10,16,24,0.65)'; ctx.lineWidth = 2;
  for (let i = 0; i < armCount * 3; i++) {
    const a = (i / (armCount * 3)) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * (ringInner + 0.02), Math.sin(a) * R * (ringInner + 0.02)); ctx.lineTo(Math.cos(a) * R * (ringOuter - 0.01), Math.sin(a) * R * (ringOuter - 0.01)); ctx.stroke();
  }
  // running lights along outer rim
  for (let i = 0; i < armCount; i++) {
    const a = (i / armCount) * Math.PI * 2 + Math.PI / armCount;
    const relayCircuit = i % 3 === 0;
    ctx.fillStyle = relayCircuit && !state.lights.relayConnected ? '#1b2733' : (relayCircuit ? CYAN : 'rgba(220,235,250,0.75)');
    ctx.beginPath(); ctx.arc(Math.cos(a) * R * (ringOuter + 0.005), Math.sin(a) * R * (ringOuter + 0.005), 2.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // 12 fixed arms at the initial state (one later detaches, never regrows).
  for (let i = 0; i < armCount; i++) {
    const a = (i / armCount) * Math.PI * 2 - Math.PI / 2;
    const isArm01 = i === 0;
    let hinge = 0;
    if (isArm01 && arm01Gone) {
      if (state.arm01.peel < 1) hinge = state.arm01.peel; // still attached, hinging away
      else continue; // fully gone
    }
    const x1 = cx + Math.cos(a) * R * 0.94, y1 = cy + Math.sin(a) * R * squish * 0.94;
    const x2 = cx + Math.cos(a) * R * 1.48, y2 = cy + Math.sin(a) * R * squish * 1.48;
    let hx = x2, hy = y2;
    if (hinge > 0) { // rotate outer end outward/down about the collar
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.hypot(x2 - x1, y2 - y1);
      const bend = ang - hinge * 1.15; // swings away from station
      hx = x1 + Math.cos(bend) * len * (1 + hinge * 0.12);
      hy = y1 + Math.sin(bend) * len * (1 + hinge * 0.12);
    }
    const armG = ctx.createLinearGradient(x1, y1, hx, hy);
    armG.addColorStop(0, '#54697e'); armG.addColorStop(0.6, '#7d97b2'); armG.addColorStop(1, '#333f4e');
    ctx.strokeStyle = armG; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
    // truss detail
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(12,20,30,0.7)';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(hx, hy); ctx.stroke();
    // socket head: hex-ish housing + collar
    ctx.fillStyle = isArm01 ? '#a8bdd2' : '#6a8296';
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(hinge > 0 ? a - hinge * 1.15 : a);
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = 'rgba(220,238,252,0.85)'; ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.fillStyle = isArm01 ? '#131c26' : '#1c2836'; ctx.fillRect(-2.5, -2.5, 5, 5); // throat
    ctx.restore();
    if (isArm01 && state.arm01.phase === 'intact' && state.doors.dockCollarLocked) {
      ctx.fillStyle = CYAN; ctx.fillRect(hx - 5, hy + 8, 4, 2); ctx.fillRect(hx + 1, hy + 8, 4, 2); // collar lock indicators
    }
  }

  // arm01 empty socket after peel (M1+): glow ring remains in place
  if (state.arm01.peel >= 1) {
    const a = -Math.PI / 2;
    const x2 = cx + Math.cos(a) * R * 1.48, y2 = cy + Math.sin(a) * R * squish * 1.48;
    const y1 = cy + Math.sin(a) * R * squish * 0.94;
    ctx.strokeStyle = 'rgba(255,170,90,0.55)'; if (ctx.setLineDash) ctx.setLineDash([4, 4]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, y1); ctx.lineTo(x2, y2); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.fillStyle = '#131c26'; ctx.fillRect(x2 - 7, y2 - 7, 14, 14);
    ctx.strokeStyle = '#ff9a6a'; ctx.strokeRect(x2 - 7, y2 - 7, 14, 14); // severed collar
  }

  // Segment 02 opens gradually during M2, then remains a permanent ring gap.
  if (segmentGap > 0) {
    const a = (2 / armCount) * Math.PI * 2 - Math.PI / 2;
    const halfGap = 0.26 * segmentGap;
    const outerGap = ringOuter + 0.01, innerGap = ringInner - 0.01;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, squish);
    ctx.fillStyle = '#04070d';
    ctx.beginPath(); ctx.arc(0, 0, R * outerGap, a - halfGap, a + halfGap); ctx.arc(0, 0, R * innerGap, a + halfGap, a - halfGap, true); ctx.fill();
    if (segmentGap > 0.04) {
      ctx.strokeStyle = 'rgba(255,154,106,0.6)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, R * outerGap, a - halfGap, a - halfGap * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * outerGap, a + halfGap * 0.85, a + halfGap); ctx.stroke();
    }
    ctx.restore();
  }

  // Persistent component identity carries each object through detached transit and final placement.
  for (const component of state.components) {
    if (!['detached', 'transit'].includes(component.phase)) continue;
    const isArm = component.id === 'comp.arm01';
    const isSegment = component.id === 'comp.segment02';
    const isHydro = component.id === 'comp.hydro_rack';
    const baseAngle = isArm ? -Math.PI / 2 : isSegment ? 0.42 : isHydro ? 1.25 : -0.25;
    const rr = R * (1.43 + component.drift * 0.24);
    const x = cx + Math.cos(baseAngle) * rr, y = cy + Math.sin(baseAngle) * rr * squish;
    const size = isArm ? 1.45 : isHydro ? 0.84 : 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.12 + component.drift * 4.2);
    ctx.fillStyle = '#8ca3b9'; ctx.fillRect(-16 * size, -5 * size, 32 * size, 10 * size);
    ctx.fillStyle = 'rgba(230,242,252,0.5)'; ctx.fillRect(-16 * size, -5 * size, 32 * size, 2 * size);
    ctx.fillStyle = '#1b2733'; ctx.fillRect(-3 * size, -5 * size, 6 * size, 10 * size);
    ctx.restore();
    if (!reduced) { ctx.fillStyle = 'rgba(255,220,150,0.9)'; ctx.fillRect(x - 1, y - 1, 2, 2); }
  }
  // landmarks
  if (state.landmarks.heshVisible) {
    // Hesh — the same small EVA figure held sunward beyond the severed relay.
    const hx = cx + R * 1.18, hy = cy - R * 0.55;
    ctx.fillStyle = 'rgba(220,238,252,0.28)'; ctx.beginPath(); ctx.arc(hx, hy, 7, 0, Math.PI * 2); ctx.fill();
    drawCrew(ctx, hx, hy + 8, 19, { suit: '#a9bacb' });
    ctx.fillStyle = '#f2f7ff'; ctx.beginPath(); ctx.arc(hx, hy - 2, 3.4, 0, Math.PI * 2); ctx.fill();
    if (!reduced) { ctx.strokeStyle = 'rgba(242,247,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + R * 1.18 - 7, cy - R * 0.55); ctx.lineTo(cx + R * 1.18 + 7, cy - R * 0.55); ctx.moveTo(cx + R * 1.18, cy - R * 0.55 - 7); ctx.lineTo(cx + R * 1.18, cy - R * 0.55 + 7); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(180,205,230,0.3)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx + R * 0.75, cy - R * 0.42); ctx.lineTo(cx + R * 1.14, cy - R * 0.55); ctx.stroke(); // broken relay truss
  }
  if (state.landmarks.jalenPlaced) {
    const ax = cx + R * 0.74, ay = cy - R * 0.84;
    ctx.strokeStyle = '#829bb1'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + R * 0.62, ay - R * 0.40); ctx.stroke();
    // folded antenna lattice; diagonal ties distinguish it from a generic orbit line
    ctx.strokeStyle = 'rgba(198,220,238,0.86)'; ctx.lineWidth = 1.35;
    for (let i = 0; i <= 4; i++) {
      const u = i / 4, x = ax + R * 0.62 * u, y = ay - R * 0.40 * u;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - R * 0.11, y - R * 0.10); ctx.stroke();
      if (i < 4) { const nx = ax + R * 0.62 * (i + 1) / 4, ny = ay - R * 0.40 * (i + 1) / 4; ctx.beginPath(); ctx.moveTo(x - R * 0.11, y - R * 0.10); ctx.lineTo(nx, ny); ctx.stroke(); }
    }
  }
  if (state.landmarks.safiPlaced) {
    ctx.globalAlpha = 0.72; ctx.strokeStyle = 'rgba(225,238,252,0.88)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const x = cx - R * (1.05 + i * 0.24), y = cy + R * (0.55 + i * 0.13), sailW = R * 0.18;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sailW * 0.28, y - R * 0.42); ctx.lineTo(x + sailW, y - R * 0.32); ctx.closePath();
      ctx.fillStyle = 'rgba(157,190,216,0.17)'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + sailW * 0.28, y - R * 0.42); ctx.lineTo(x + sailW * 0.46, y - R * 0.18); ctx.stroke();
    }
    ctx.globalAlpha = 1; // three thermal-sail facets held in orbital plane
  }
  if (state.landmarks.kiraPlaced) {
    const kx = cx - R * 0.72, ky = cy + R * 0.98;
    ctx.fillStyle = 'rgba(122,196,238,0.24)'; ctx.beginPath(); ctx.ellipse(kx, ky, 16, 7, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bfe3ff'; ctx.fillRect(kx - 10, ky - 4, 20, 8);
    ctx.fillStyle = '#edf8ff'; ctx.fillRect(kx - 5, ky - 2, 10, 4);
    ctx.strokeStyle = 'rgba(191,227,255,0.72)'; ctx.beginPath(); ctx.ellipse(kx, ky, 16, 7, 0.4, 0, Math.PI * 2); ctx.stroke(); // sealed cryo pod
  }

  // transfer craft coupling at arm01 (life chapter)
  if (state.t < 8) {
    const u = clamp01((state.t - 1) / 6);
    const ease = 1 - Math.pow(1 - u, 3);
    const a = -Math.PI / 2;
    const dist = R * (2.15 - ease * 0.67);
    const x = cx + Math.cos(a) * dist, y = cy + Math.sin(a) * dist * squish;
    const cg = ctx.createLinearGradient(x - 12, y - 7, x + 12, y + 7);
    cg.addColorStop(0, '#d9e6f2'); cg.addColorStop(0.5, '#8ca3b9'); cg.addColorStop(1, '#3d4f63');
    ctx.fillStyle = cg; ctx.fillRect(x - 12, y - 7, 24, 14);
    ctx.fillStyle = CYAN; ctx.fillRect(x - 4, y - 3, 8, 6); // lit cockpit
    if (!reduced && u < 1) { ctx.fillStyle = 'rgba(120,200,255,0.6)'; ctx.fillRect(x - 1.5, y + 7, 3, 5 + Math.sin(t * 8) * 1.5); } // engine glow
    if (u >= 1) { ctx.fillStyle = '#ffd9a0'; ctx.fillRect(x - 2, y - 1, 4, 2); } // collar kiss
  }

  // Tiger backlit silhouette (finale)
  if (state.tiger.backlit) drawTiger(ctx, w * 0.60, h * 0.30, Math.min(w, h) * 0.17, t);
  vignette(ctx, w, h, 0.5);
}

// ---------- Tiger (canonical silhouette; no pupils/nose/teeth) ----------

export function drawTiger(ctx, cx, cy, s, t) {
  ctx.save(); ctx.translate(cx, cy);
  const body = '#04060c';
  // rear torso + hips
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.30, s * 0.95); ctx.lineTo(-s * 0.24, s * 0.05); ctx.lineTo(-s * 0.33, -s * 0.45);
  ctx.lineTo(-s * 0.26, -s * 0.72); ctx.lineTo(-s * 0.14, -s * 0.88); // left shoulder->crown
  ctx.lineTo(s * 0.14, -s * 0.88); ctx.lineTo(s * 0.26, -s * 0.72); ctx.lineTo(s * 0.33, -s * 0.45);
  ctx.lineTo(s * 0.24, s * 0.05); ctx.lineTo(s * 0.30, s * 0.95); ctx.closePath(); ctx.fill();
  // long limbs
  ctx.lineWidth = s * 0.075; ctx.strokeStyle = body; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-s * 0.22, -s * 0.35); ctx.lineTo(-s * 0.34, s * 0.15); ctx.lineTo(-s * 0.30, s * 0.85); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.22, -s * 0.35); ctx.lineTo(s * 0.34, s * 0.15); ctx.lineTo(s * 0.30, s * 0.85); ctx.stroke();
  // swept-back shard crown fan
  ctx.beginPath();
  ctx.moveTo(-s * 0.30, -s * 0.66);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI * 0.78 + i * 0.34;
    ctx.lineTo(Math.cos(a) * s * 0.62, -s * 0.66 + Math.sin(a) * s * 0.52);
    ctx.lineTo(Math.cos(a + 0.16) * s * 0.30, -s * 0.66);
  }
  ctx.closePath(); ctx.fill();
  // tapering rooted tail
  ctx.strokeStyle = body; ctx.lineWidth = s * 0.085;
  ctx.beginPath(); ctx.moveTo(s * 0.26, s * 0.72); ctx.quadraticCurveTo(s * 0.68, s * 0.55, s * 0.72, s * 0.12); ctx.stroke();
  ctx.lineWidth = s * 0.035;
  ctx.beginPath(); ctx.moveTo(s * 0.72, s * 0.12); ctx.quadraticCurveTo(s * 0.74, -s * 0.1, s * 0.66, -s * 0.22); ctx.stroke();
  // cyan fissures (mineral cracks, not anatomy)
  ctx.strokeStyle = CYAN; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-s * 0.10, -s * 0.42); ctx.lineTo(-s * 0.14, -s * 0.05); ctx.lineTo(-s * 0.06, s * 0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.13, -s * 0.35); ctx.lineTo(s * 0.09, s * 0.05); ctx.lineTo(s * 0.14, s * 0.34); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 0.66); ctx.lineTo(0, -s * 0.2); ctx.stroke();
  // pupil-less solid cyan eyes
  ctx.fillStyle = CYAN; ctx.globalAlpha = 1;
  ctx.fillRect(-s * 0.175, -s * 0.545, s * 0.115, s * 0.028);
  ctx.fillRect(s * 0.06, -s * 0.545, s * 0.115, s * 0.028);
  // grin: narrow line of cyan behind dark mineral points — never teeth/gums
  ctx.lineWidth = 2.2; ctx.strokeStyle = CYAN; ctx.globalAlpha = 0.95;
  ctx.beginPath(); ctx.moveTo(-s * 0.17, -s * 0.385); ctx.lineTo(s * 0.17, -s * 0.385); ctx.stroke();
  ctx.fillStyle = '#04060c'; ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(-s * 0.17, -s * 0.385);
  for (let i = 0; i < 6; i++) { const x0 = -s * 0.17 + (i + 1) * (s * 0.34 / 6); ctx.lineTo(x0 - s * 0.028, -s * 0.33); ctx.lineTo(x0, -s * 0.385); }
  ctx.closePath(); ctx.fill();
  // backlight rim
  ctx.globalAlpha = 0.5; ctx.strokeStyle = 'rgba(200,230,255,0.8)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-s * 0.14, -s * 0.88); ctx.lineTo(-s * 0.26, -s * 0.72); ctx.lineTo(-s * 0.33, -s * 0.45); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s * 0.14, -s * 0.88); ctx.lineTo(s * 0.26, -s * 0.72); ctx.lineTo(s * 0.33, -s * 0.45); ctx.stroke();
  ctx.globalAlpha = 1; ctx.restore();
}

// ---------- crew + cart ----------

function drawCrew(ctx, x, y, s, opts) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  // Generic silhouettes remain limited to incidental background workers.
  ctx.fillStyle = 'rgba(55,230,255,0.28)';
  ctx.fillRect(-0.22, -0.5, 0.44, 0.92);
  ctx.beginPath(); ctx.arc(0.02, -0.68, 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = opts.suit || '#3a4c60';
  ctx.fillRect(-0.18, -0.5, 0.36, 0.9);
  ctx.fillStyle = 'rgba(10,16,24,0.45)'; ctx.fillRect(0.05, -0.5, 0.13, 0.9);
  ctx.fillStyle = opts.suit || '#3a4c60';
  ctx.beginPath(); ctx.arc(0, -0.68, 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(150,220,245,0.5)'; ctx.fillRect(-0.1, -0.71, 0.2, 0.045);
  if (opts.hair) { ctx.fillStyle = '#eef3f8'; ctx.beginPath(); ctx.ellipse(0, -0.72, 0.24, 0.09, 0.25, 0, Math.PI * 2); ctx.fill(); }
  if (opts.tool) { ctx.strokeStyle = '#cfdce9'; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0.18, -0.18); ctx.lineTo(0.44, 0.08); ctx.stroke(); }
  if (opts.mug) { ctx.fillStyle = WARM; ctx.fillRect(0.2, -0.36, 0.1, 0.12); }
  ctx.restore();
}

// The two recurring figures use stable visual identifiers, not generic crew
// silhouettes: Mara's pale trailing hair and Rin's dark hair plus one wrench.
function drawOpenWrench(ctx, x, y, length, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const jaw = length * 0.24;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#c4d0dc'; ctx.lineWidth = Math.max(1.7, length * 0.085);
  ctx.beginPath(); ctx.moveTo(0, length * 0.18); ctx.lineTo(0, -length * 0.28); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-jaw * 0.45, -length * 0.20);
  ctx.lineTo(-jaw * 1.45, -length * 0.48);
  ctx.lineTo(-jaw * 0.88, -length * 0.72);
  ctx.lineTo(-jaw * 0.16, -length * 0.45);
  ctx.moveTo(jaw * 0.45, -length * 0.20);
  ctx.lineTo(jaw * 1.45, -length * 0.48);
  ctx.lineTo(jaw * 0.88, -length * 0.72);
  ctx.lineTo(jaw * 0.16, -length * 0.45);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(18,29,40,0.82)'; ctx.lineWidth = Math.max(0.8, length * 0.027);
  ctx.beginPath(); ctx.moveTo(-jaw * 0.45, -length * 0.20); ctx.lineTo(0, -length * 0.28); ctx.lineTo(jaw * 0.45, -length * 0.20); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, length * 0.16, length * 0.065, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function drawMara(ctx, x, feetY, height, options = {}) {
  const gait = Number.isFinite(options.gait) ? options.gait : 0;
  const bob = Math.sin(gait * 2) * height * 0.006;
  const hairFlow = Math.sin(gait * 1.3) * height * 0.018;
  ctx.save(); ctx.translate(x, feetY + bob);

  // Long silver hair trails behind her path as three readable tapered locks.
  const hair = ctx.createLinearGradient(-height * 1.02, -height * 0.88, height * 0.04, -height * 0.76);
  hair.addColorStop(0, '#71808d'); hair.addColorStop(0.35, '#dce5ec'); hair.addColorStop(1, '#f2f5f7');
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(-height * 0.06, -height * 0.90);
  ctx.bezierCurveTo(-height * 0.30, -height * 1.03, -height * 0.66, -height * 0.99 + hairFlow, -height * 1.02, -height * 0.80 + hairFlow);
  ctx.bezierCurveTo(-height * 0.72, -height * 0.91 + hairFlow, -height * 0.35, -height * 0.86, -height * 0.08, -height * 0.80);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-height * 0.05, -height * 0.82);
  ctx.bezierCurveTo(-height * 0.36, -height * 0.87, -height * 0.68, -height * 0.71 - hairFlow, -height * 0.93, -height * 0.61 - hairFlow);
  ctx.bezierCurveTo(-height * 0.60, -height * 0.70 - hairFlow, -height * 0.32, -height * 0.68, -height * 0.02, -height * 0.75);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(247,250,252,0.76)'; ctx.lineWidth = Math.max(1, height * 0.012);
  ctx.beginPath(); ctx.moveTo(-height * 0.12, -height * 0.88); ctx.quadraticCurveTo(-height * 0.56, -height * 0.99 + hairFlow, -height * 0.94, -height * 0.81 + hairFlow); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-height * 0.12, -height * 0.80); ctx.quadraticCurveTo(-height * 0.51, -height * 0.78 - hairFlow, -height * 0.84, -height * 0.63 - hairFlow); ctx.stroke();

  // Work suit and legs, with a small walk phase but no weightless scatter.
  ctx.fillStyle = '#17222e';
  ctx.strokeStyle = '#263647'; ctx.lineWidth = height * 0.065; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-height * 0.055, -height * 0.34); ctx.lineTo(-height * 0.075, -height * 0.02 + Math.sin(gait) * height * 0.015); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(height * 0.055, -height * 0.34); ctx.lineTo(height * 0.075, -height * 0.02 - Math.sin(gait) * height * 0.015); ctx.stroke();
  ctx.fillStyle = '#546272';
  ctx.beginPath(); ctx.moveTo(-height * 0.15, -height * 0.66); ctx.lineTo(-height * 0.11, -height * 0.36); ctx.lineTo(height * 0.11, -height * 0.36); ctx.lineTo(height * 0.16, -height * 0.65); ctx.lineTo(height * 0.08, -height * 0.70); ctx.lineTo(-height * 0.08, -height * 0.70); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(190,212,230,0.20)'; ctx.fillRect(-height * 0.12, -height * 0.65, height * 0.024, height * 0.27);
  ctx.fillStyle = '#293847'; ctx.fillRect(-height * 0.09, -height * 0.39, height * 0.18, height * 0.035);

  // The open hand braces the hinge; the opposite arm swings only when walking.
  if (options.bracePoint) {
    const tx = options.bracePoint.x - x, ty = options.bracePoint.y - feetY - bob;
    ctx.strokeStyle = '#364654'; ctx.lineWidth = height * 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(height * 0.08, -height * 0.62); ctx.lineTo(height * 0.29, -height * 0.51); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.fillStyle = '#c4b6a5'; ctx.beginPath(); ctx.arc(tx, ty, height * 0.045, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(243,237,228,0.78)'; ctx.lineWidth = Math.max(1, height * 0.012);
    for (let finger = -1; finger <= 1; finger++) {
      ctx.beginPath(); ctx.moveTo(tx, ty + finger * height * 0.012); ctx.lineTo(tx + height * 0.035, ty + finger * height * 0.02); ctx.stroke();
    }
  } else {
    ctx.strokeStyle = '#364654'; ctx.lineWidth = height * 0.052; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-height * 0.08, -height * 0.62); ctx.lineTo(-height * 0.12, -height * 0.38 + Math.sin(gait + 0.8) * height * 0.04); ctx.stroke();
  }
  if (!options.bracePoint) {
    ctx.strokeStyle = '#364654'; ctx.lineWidth = height * 0.052; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(height * 0.08, -height * 0.62); ctx.lineTo(height * 0.16, -height * 0.39 + Math.sin(gait) * height * 0.04); ctx.stroke();
  }

  // Bare face and pale hair edge preserve Mara's approved silhouette cues.
  ctx.fillStyle = '#a99c91';
  ctx.beginPath(); ctx.ellipse(height * 0.005, -height * 0.79, height * 0.083, height * 0.105, 0.02, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d7c8b8';
  ctx.beginPath(); ctx.ellipse(height * 0.082, -height * 0.785, height * 0.019, height * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#342d29'; ctx.lineWidth = Math.max(1.2, height * 0.013);
  const eyeY = -height * (options.glanceToRin ? 0.805 : 0.782);
  ctx.beginPath(); ctx.moveTo(height * 0.012, eyeY); ctx.lineTo(height * 0.05, eyeY + height * 0.003); ctx.stroke();
  ctx.strokeStyle = '#e9eef2'; ctx.lineWidth = Math.max(1.4, height * 0.026);
  ctx.beginPath(); ctx.moveTo(-height * 0.064, -height * 0.87); ctx.quadraticCurveTo(height * 0.005, -height * 0.94, height * 0.085, -height * 0.865); ctx.stroke();
  ctx.restore();
}

function drawRin(ctx, x, feetY, height, options = {}) {
  const gait = Number.isFinite(options.gait) ? options.gait : 0;
  const bob = Math.sin(gait * 2 + 0.5) * height * 0.004;
  const facingLeft = options.facing === 'left';
  ctx.save(); ctx.translate(x, feetY + bob);
  if (facingLeft) ctx.scale(-1, 1);
  ctx.strokeStyle = '#18232f'; ctx.lineWidth = height * 0.07; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-height * 0.06, -height * 0.34); ctx.lineTo(-height * 0.07, -height * 0.015 + Math.sin(gait) * height * 0.015); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(height * 0.06, -height * 0.34); ctx.lineTo(height * 0.075, -height * 0.015 - Math.sin(gait) * height * 0.015); ctx.stroke();
  ctx.fillStyle = '#303b46';
  ctx.beginPath(); ctx.moveTo(-height * 0.17, -height * 0.67); ctx.lineTo(-height * 0.12, -height * 0.35); ctx.lineTo(height * 0.12, -height * 0.35); ctx.lineTo(height * 0.17, -height * 0.66); ctx.lineTo(height * 0.1, -height * 0.71); ctx.lineTo(-height * 0.1, -height * 0.71); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#596879'; ctx.fillRect(-height * 0.11, -height * 0.65, height * 0.04, height * 0.27);
  ctx.fillStyle = '#997450'; ctx.fillRect(-height * 0.11, -height * 0.40, height * 0.22, height * 0.035);

  let handX, handY;
  if (options.workPoint) {
    handX = facingLeft ? x - options.workPoint.x : options.workPoint.x - x;
    handY = options.workPoint.y - feetY - bob;
    const shoulderX = -height * 0.08;
    const shoulderY = -height * 0.63;
    const elbowX = shoulderX * 0.35 + handX * 0.65;
    const elbowY = shoulderY * 0.4 + handY * 0.6 - height * 0.04;
    ctx.strokeStyle = '#263440'; ctx.lineWidth = height * 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(shoulderX, shoulderY); ctx.lineTo(elbowX, elbowY); ctx.lineTo(handX, handY); ctx.stroke();
  } else {
    handX = height * 0.19;
    handY = -height * 0.31 + bob;
    ctx.strokeStyle = '#263440'; ctx.lineWidth = height * 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-height * 0.08, -height * 0.62); ctx.lineTo(-height * 0.15, -height * 0.38 + Math.sin(gait) * height * 0.04); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(height * 0.08, -height * 0.62); ctx.lineTo(handX, handY); ctx.stroke();
  }
  ctx.fillStyle = '#c0a68e'; ctx.beginPath(); ctx.arc(handX, handY, height * 0.035, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#a9896d';
  ctx.beginPath(); ctx.ellipse(0, -height * 0.80, height * 0.085, height * 0.102, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#171717';
  ctx.beginPath(); ctx.moveTo(-height * 0.09, -height * 0.82); ctx.lineTo(-height * 0.075, -height * 0.91); ctx.quadraticCurveTo(0, -height * 0.99, height * 0.09, -height * 0.91); ctx.lineTo(height * 0.085, -height * 0.82); ctx.lineTo(height * 0.03, -height * 0.855); ctx.lineTo(-height * 0.005, -height * 0.82); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1e1c19';
  ctx.beginPath(); ctx.ellipse(-height * 0.09, -height * 0.79, height * 0.02, height * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b211a'; ctx.lineWidth = Math.max(1.2, height * 0.013);
  const gazeY = -height * (options.glanceToMara ? 0.803 : 0.78);
  ctx.beginPath(); ctx.moveTo(height * 0.025, gazeY); ctx.lineTo(height * 0.063, gazeY - (options.glanceToMara ? height * 0.018 : 0)); ctx.stroke();

  const wrenchX = options.wrenchPoint
    ? (facingLeft ? x - options.wrenchPoint.x : options.wrenchPoint.x - x)
    : handX;
  const wrenchY = options.wrenchPoint ? options.wrenchPoint.y - feetY - bob : handY;
  const wrenchAngle = Number.isFinite(options.wrenchAngle) ? options.wrenchAngle : 0.44;
  drawOpenWrench(ctx, wrenchX, wrenchY, options.wrenchLength || height * 0.42, wrenchAngle);
  if (options.mug) {
    ctx.fillStyle = WARM; ctx.fillRect(-height * 0.24, -height * 0.45, height * 0.11, height * 0.15);
    ctx.strokeStyle = WARM; ctx.lineWidth = Math.max(0.7, height * 0.018);
    ctx.strokeRect(-height * 0.275, -height * 0.42, height * 0.04, height * 0.07);
  }
  ctx.restore();
}

function drawCart(ctx, x, y, s, casterPresent, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(55,230,255,0.18)'; ctx.fillRect(-0.54, -0.3, 1.08, 0.78); // glow underlight pass
  const body = ctx.createLinearGradient(0, -0.3, 0, 0.25);
  body.addColorStop(0, '#6d869c'); body.addColorStop(0.5, '#4a6076'); body.addColorStop(1, '#2a3646');
  ctx.fillStyle = body; ctx.fillRect(-0.5, -0.28, 1.0, 0.36);
  ctx.fillStyle = 'rgba(220,236,250,0.35)'; ctx.fillRect(-0.5, -0.28, 1.0, 0.05); // top edge worn
  ctx.fillStyle = '#1a2530'; ctx.fillRect(-0.5, 0.08, 1.0, 0.1); // lower tray
  // cargo block
  ctx.fillStyle = '#54432e'; ctx.fillRect(-0.28, -0.5, 0.56, 0.22);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.strokeRect(-0.28, -0.5, 0.56, 0.22);
  // wheels
  ctx.fillStyle = '#10161f';
  ctx.beginPath(); ctx.arc(-0.33, 0.26, 0.095, 0, Math.PI * 2); ctx.fill();
  if (casterPresent) { ctx.beginPath(); ctx.arc(0.33, 0.26, 0.095, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = 'rgba(190,215,238,0.6)'; ctx.fillRect(-0.37, 0.22, 0.08, 0.02); ctx.fillRect(0.29, 0.22, 0.08, 0.02); }
  else { ctx.fillStyle = '#6e4a2c'; ctx.fillRect(0.27, 0.24, 0.13, 0.05); ctx.fillStyle = '#ff9a6a'; ctx.fillRect(0.29, 0.17, 0.09, 0.035); } // scar + torn bracket
  ctx.restore();
}

// ---------- interiors ----------

function lightCone(ctx, x, y, w2, h2, alpha) {
  const g = ctx.createLinearGradient(0, y, 0, y + h2);
  g.addColorStop(0, `rgba(255,238,190,${alpha})`); g.addColorStop(1, 'rgba(255,238,190,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x + 16, y); ctx.lineTo(x + w2, y + h2); ctx.lineTo(x - w2, y + h2); ctx.closePath(); ctx.fill();
}

function drawHydroServicePanel(ctx, w, h, { powered = true, rupture = 0 } = {}) {
  const x = w * 0.40, y = h * 0.50, panelW = w * 0.17, panelH = h * 0.20;
  const damage = clamp01(rupture);
  ctx.fillStyle = 'rgba(2,7,10,0.72)'; ctx.fillRect(x - 8, y - 10, panelW + 16, panelH + 20);
  ctx.fillStyle = damage > 0 ? '#27332e' : '#273a34'; ctx.fillRect(x, y, panelW, panelH);
  ctx.fillStyle = '#0e1917'; ctx.fillRect(x + 8, y + 8, panelW - 16, panelH - 16);
  ctx.strokeStyle = damage > 0 ? '#66746b' : '#71877c'; ctx.lineWidth = 2.2; ctx.strokeRect(x + 2, y + 2, panelW - 4, panelH - 4);
  ctx.strokeStyle = 'rgba(176,210,190,0.48)'; ctx.lineWidth = 1;
  for (let row = 0; row < 3; row++) {
    const yy = y + panelH * (0.31 + row * 0.20);
    ctx.beginPath(); ctx.moveTo(x + panelW * 0.42, yy); ctx.lineTo(x + panelW * 0.86, yy); ctx.stroke();
  }
  ctx.fillStyle = powered ? '#7bd0a2' : '#3b5449'; ctx.fillRect(x + panelW * 0.47, y + panelH * 0.22, panelW * 0.22, 4);
  ctx.fillStyle = damage > 0.12 ? '#ff9868' : '#e5b477'; ctx.fillRect(x + panelW * 0.74, y + panelH * 0.22, 5, 4);
  if (damage > 0.12) {
    ctx.strokeStyle = `rgba(255,150,98,${0.25 + damage * 0.65})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + panelW * 0.70, y + panelH * 0.36); ctx.lineTo(x + panelW * 0.75, y + panelH * 0.42); ctx.lineTo(x + panelW * 0.70, y + panelH * 0.48); ctx.stroke();
  }
  // The cover is hinged open; Mara's hand braces its exposed edge.
  ctx.fillStyle = '#3a4e46';
  ctx.beginPath(); ctx.moveTo(x + 4, y + 5); ctx.lineTo(x - w * 0.035, y + h * 0.025); ctx.lineTo(x - w * 0.035, y + panelH - h * 0.025); ctx.lineTo(x + 4, y + panelH - 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#8ba496'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#0c1414'; ctx.fillRect(x + panelW * 0.74, y + panelH * 0.38, panelW * 0.13, panelH * 0.22);
  ctx.strokeStyle = '#bdcbd2'; ctx.lineWidth = 2;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    ctx.beginPath(); ctx.arc(x + panelW * (0.75 + dx * 0.12), y + panelH * (0.39 + dy * 0.19), 3.2, 0, Math.PI * 2); ctx.stroke();
  }
  for (const [dx, dy] of [[7, 7], [panelW - 7, 7], [7, panelH - 7], [panelW - 7, panelH - 7]]) {
    ctx.fillStyle = '#b0c2c8'; ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.1, 0, Math.PI * 2); ctx.fill();
  }
  return {
    bracePoint: { x: x + 2, y: y + panelH * 0.56 },
    workPoint: { x: x + panelW * 0.80, y: y + panelH * 0.48 },
  };
}

function drawHydroServiceHandoff(ctx, w, h, state, t, reduced, service) {
  const cooperationProgress = clamp01((t - 14) / 6);
  const turn = Math.sin((t - 14) * Math.PI * 1.25) * (reduced ? 0 : 0.035);
  drawMara(ctx, w * 0.33, h * 0.80, h * 0.27, {
    bracePoint: service.bracePoint,
    glanceToRin: state.actors.mara.glanceToRin,
    gait: reduced ? 0 : cooperationProgress * 0.2,
  });
  drawRin(ctx, w * 0.63, h * 0.80, h * 0.27, {
    facing: 'left',
    workPoint: { x: service.workPoint.x, y: service.workPoint.y + turn },
    wrenchPoint: { x: service.workPoint.x, y: service.workPoint.y + turn },
    wrenchLength: h * 0.115,
    wrenchAngle: -0.56 + (reduced ? 0 : Math.sin((t - 14) * Math.PI * 0.75) * 0.035),
    glanceToMara: state.actors.rin.glanceToMara,
    gait: reduced ? 0 : cooperationProgress * 0.16,
  });
}

function drawGlassCrossingBehindPane(ctx, pane, crossing, time, reduced) {
  if (!crossing) return;
  const [trackStart, trackEnd] = OBSERVATION_GLASS_TRACK.path;
  const xScale = pane.width / (trackEnd.x - trackStart.x);
  const xOf = (worldX) => worldX * xScale;
  const feetY = (crossing.mara.y - 0.5) * pane.height;
  const actorHeight = pane.height * 0.18;
  const pass = OBSERVATION_GLASS_TRACK.passes.find(({ id }) => id === crossing.passId);
  const gait = reduced || !pass ? 0 : (time - pass.start) * 1.2;
  drawMara(ctx, xOf(crossing.mara.x), feetY, actorHeight, { gait });
  drawRin(ctx, xOf(crossing.rin.x), feetY, actorHeight, {
    gait,
    wrenchLength: actorHeight * 0.43,
    wrenchAngle: 0.44,
  });
}

export function drawInterior(ctx, w, h, state, t, reduced, lastShift = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#171f2a'); g.addColorStop(0.55, '#24313f'); g.addColorStop(1, '#0d141d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // side walls with pilasters
  panel(ctx, 0, 0, w * 0.16, h, '#1d2833', '#141c25'); panel(ctx, w * 0.84, 0, w * 0.16, h, '#1d2833', '#141c25');
  ctx.fillStyle = '#26333f';
  for (const px of [w * 0.16, w * 0.46, w * 0.62, w * 0.84]) ctx.fillRect(px - 4, 0, 8, h * 0.86);
  rivetRow(ctx, w * 0.16, 6, w * 0.16, h * 0.85, 10); rivetRow(ctx, w * 0.84, 6, w * 0.84, h * 0.85, 10);
  // ceiling band + pipe runs
  panel(ctx, 0, 0, w, h * 0.13, '#2b3a4a', '#1c2836');
  ctx.strokeStyle = '#37485c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, h * 0.045); ctx.lineTo(w, h * 0.045); ctx.stroke();
  ctx.strokeStyle = '#222f3c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, h * 0.075); ctx.lineTo(w, h * 0.075); ctx.stroke();
  // floor with center sheen + grate lines
  const floorG = ctx.createLinearGradient(0, h * 0.86, 0, h);
  floorG.addColorStop(0, '#2c3a49'); floorG.addColorStop(0.25, '#1d2733'); floorG.addColorStop(1, '#0a1018');
  ctx.fillStyle = floorG; ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.strokeStyle = 'rgba(150,185,215,0.22)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(w * (0.2 + i * 0.075), h * 0.86); ctx.lineTo(w * (0.16 + i * 0.085), h); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(150,185,215,0.12)'; ctx.beginPath(); ctx.moveTo(0, h * 0.93); ctx.lineTo(w, h * 0.93); ctx.stroke();

  // pressure threshold door (state-driven) + hydraulic lines
  const sealed = state.doors.transitSealClosed;
  const doorG = ctx.createLinearGradient(w * 0.46, 0, w * 0.54, 0);
  if (sealed) { doorG.addColorStop(0, '#43301f'); doorG.addColorStop(0.5, '#5d4028'); doorG.addColorStop(1, '#33241a'); }
  else { doorG.addColorStop(0, '#2c4254'); doorG.addColorStop(0.5, '#3f5a72'); doorG.addColorStop(1, '#22303f'); }
  ctx.fillStyle = doorG; ctx.fillRect(w * 0.455, h * 0.19, w * 0.09, h * 0.67);
  ctx.strokeStyle = 'rgba(160,190,220,0.35)'; ctx.lineWidth = 1.5; ctx.strokeRect(w * 0.455, h * 0.19, w * 0.09, h * 0.67);
  ctx.strokeStyle = 'rgba(10,16,24,0.6)'; ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.19); ctx.lineTo(w * 0.5, h * 0.86); ctx.stroke(); // door seam
  ctx.fillStyle = sealed ? '#ff9a6a' : '#bfe3ff';
  ctx.beginPath(); ctx.arc(w * 0.5, h * 0.24, 3.4, 0, Math.PI * 2); ctx.fill(); // status pip

  // ceiling lights (relay-connected fail after M2)
  const relayOn = state.lights.relayConnected;
  for (let i = 0; i < 5; i++) {
    const x = w * (0.24 + i * 0.14);
    ctx.fillStyle = relayOn ? '#fff3cf' : '#33414f';
    ctx.fillRect(x - 17, h * 0.145, 34, 5);
    if (relayOn) lightCone(ctx, x, h * 0.155, 42, h * 0.34, reduced ? 0.10 : 0.16);
  }

  // background life (three simultaneous, purposeful, offset):
  // 1) crew2 hauling crate across to stow
  const crossU = reduced ? 0.45 : 0.5 + 0.42 * Math.sin(t * 0.32 + 1.1);
  drawCrew(ctx, w * (0.22 + crossU * 0.5), h * 0.66, 30, { suit: '#46586c' });
  const crateX = w * (0.22 + crossU * 0.5) + 26;
  ctx.fillStyle = '#54432e'; ctx.fillRect(crateX, h * 0.66, 17, 13); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.strokeRect(crateX, h * 0.66, 17, 13);
  // 2) console tech at wall panel with tools
  drawCrew(ctx, w * 0.885, h * 0.60, 29, { suit: '#5a4a3a' });
  ctx.fillStyle = '#0d1620'; ctx.fillRect(w * 0.915, h * 0.42, w * 0.06, h * 0.14);
  ctx.fillStyle = CYAN; ctx.fillRect(w * 0.925, h * 0.45, w * 0.038, 4); ctx.fillStyle = '#ffb35a'; ctx.fillRect(w * 0.925, h * 0.475, w * 0.026, 3);
  // 3) hydro tech at rack edge, checking moisture strip
  drawCrew(ctx, w * 0.115, h * 0.63, 27, { suit: '#3a5a48' });
  ctx.fillStyle = '#274035'; ctx.fillRect(w * 0.045, h * 0.5, w * 0.03, h * 0.2); ctx.fillStyle = '#4caf7d'; ctx.fillRect(w * 0.05, h * 0.52, w * 0.02, 3); ctx.fillRect(w * 0.05, h * 0.58, w * 0.02, 3);

  // foreground: linked task — the cart and Rin. Last Shift can place this same
  // persistent prop at a normalized route coordinate without changing world state.
  const cartFactor = Number.isFinite(lastShift.cartXFactor)
    ? clamp01(lastShift.cartXFactor)
    : 0.24 + clamp01((state.t - 8) / 6) * 0.18;
  const cartX = w * cartFactor;
  drawCart(ctx, cartX, h * 0.76, 46, state.props.cartCasterPresent, t);
  drawRin(ctx, cartX + 46, h * 0.70, 42, {
    gait: reduced ? 0 : t * 0.32,
    wrenchLength: 18,
    mug: state.props.mugWithCrew,
  });
  // mug handoff arc (life chapter 10-14s): crew2 passes mug to Rin
  if (state.props.mugWithCrew) {
    const u = clamp01((t - 10) / 4);
    const mx = lerpNum(cartX + 46 - 10, cartX - 30, u), my = h * (0.6 - Math.sin(u * Math.PI) * 0.09);
    ctx.fillStyle = WARM; ctx.fillRect(mx, my, 7, 9);
  }
  vignette(ctx, w, h, 0.42);
}
function lerpNum(a, b, u) { return a + (b - a) * u; }

// ---------- hydroponics ----------

export function drawHydro(ctx, w, h, state, t, reduced, options = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0f1c15'); g.addColorStop(0.6, '#17251d'); g.addColorStop(1, '#080f0b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // back wall pipe + manifold
  ctx.strokeStyle = '#233529'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, h * 0.14); ctx.lineTo(w, h * 0.14); ctx.stroke();
  ctx.strokeStyle = '#31473a'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, h * 0.135); ctx.lineTo(w, h * 0.135); ctx.stroke();
  // grow rack (persistent comp.hydro_rack)
  const rup = state.hydroRack.rupture; // 0 intact
  const ruptured = rup > 0;
  // After the breach, the same rack ID shears free and travels toward the pressure door.
  const rackDrift = options.matchCamera ? 0 : clamp01(state.hydroRack.drift);
  const rackX = w * (0.10 + rackDrift * 0.14), rackY = h * (0.24 + rackDrift * 0.05);
  const rackW = w * (0.50 - rackDrift * 0.07), rackH = h * (0.56 - rackDrift * 0.05);
  panel(ctx, rackX, rackY, rackW, rackH, '#213a2d', '#121f17');
  // The same feed manifold and emitters remain in frame. Before the cut they
  // pulse through a deterministic irrigation cycle; after the rupture the severed
  // feed and dead pump lamps explain why no water reaches the same planted rack.
  const manifoldY = rackY - h * 0.022;
  const manifoldCutX = rackX + rackW * 0.84;
  ctx.lineCap = 'round'; ctx.lineWidth = 5;
  ctx.strokeStyle = ruptured ? '#29342d' : '#49664f';
  ctx.beginPath(); ctx.moveTo(rackX + 3, manifoldY); ctx.lineTo(rackX + rackW - 3, manifoldY); ctx.stroke();
  ctx.lineWidth = 1.5; ctx.strokeStyle = ruptured ? '#4b5549' : 'rgba(150,215,170,0.68)';
  ctx.beginPath(); ctx.moveTo(rackX + 3, manifoldY - 1); ctx.lineTo(manifoldCutX - (ruptured ? 8 : 0), manifoldY - 1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(manifoldCutX + (ruptured ? 8 : 0), manifoldY - 1); ctx.lineTo(rackX + rackW - 3, manifoldY - 1); ctx.stroke();
  if (ruptured) {
    ctx.strokeStyle = 'rgba(255,166,100,0.9)'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(manifoldCutX - 6, manifoldY - 6); ctx.lineTo(manifoldCutX + 2, manifoldY + 1); ctx.lineTo(manifoldCutX - 3, manifoldY + 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(manifoldCutX + 7, manifoldY - 5); ctx.lineTo(manifoldCutX + 1, manifoldY + 1); ctx.lineTo(manifoldCutX + 6, manifoldY + 5); ctx.stroke();
  }
  for (let c = 0; c < 4; c++) {
    const nozzleX = rackX + rackW * (0.145 + c * 0.235);
    ctx.strokeStyle = ruptured ? '#3a443b' : '#57715d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(nozzleX, manifoldY); ctx.lineTo(nozzleX, rackY + rackH * 0.035); ctx.stroke();
    ctx.fillStyle = ruptured ? '#465044' : '#8fcba0';
    ctx.beginPath(); ctx.arc(nozzleX, rackY + rackH * 0.035, 2.3, 0, Math.PI * 2); ctx.fill();
    if (!reduced && state.lights.hydroPumps && rup === 0) {
      const cycle = (t * 0.72 + c * 0.23) % 1;
      const dropY = rackY + rackH * (0.07 + cycle * 0.14);
      ctx.strokeStyle = 'rgba(126,225,198,0.68)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(nozzleX, rackY + rackH * 0.055); ctx.lineTo(nozzleX, dropY); ctx.stroke();
      ctx.fillStyle = '#a3f1dc'; ctx.beginPath(); ctx.ellipse(nozzleX, dropY, 1.8, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // shelving rails
  ctx.strokeStyle = 'rgba(120,190,150,0.25)'; ctx.lineWidth = 1.5;
  for (let r = 0; r <= 3; r++) { ctx.beginPath(); ctx.moveTo(rackX + 4, rackY + rackH * (r / 3)); ctx.lineTo(rackX + rackW - 4, rackY + rackH * (r / 3)); ctx.stroke(); }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = rackX + rackW * (0.05 + c * 0.235), y = rackY + rackH * (0.09 + r * 0.295);
    const bw = rackW * 0.19, bh = rackH * 0.17;
    const glow = ruptured ? 0.1 : 0.4 + 0.15 * Math.sin(t * 1.3 + r * 2 + c);
    const pg = ctx.createLinearGradient(0, y, 0, y + bh);
    if (rup >= 1) { pg.addColorStop(0, '#3a4038'); pg.addColorStop(1, '#242a24'); }
    else if (ruptured) { pg.addColorStop(0, '#4a4a38'); pg.addColorStop(1, '#2c332a'); }
    else { pg.addColorStop(0, '#63d68f'); pg.addColorStop(1, '#2c7a4e'); }
    ctx.fillStyle = pg; ctx.fillRect(x, y, bw, bh);
    // leaf blades
    if (!ruptured || rup < 0.6) {
      ctx.strokeStyle = rup >= 1 ? '#4a5240' : '#8fe6b0'; ctx.lineWidth = 1.6;
      for (let k = 0; k < 5; k++) {
        const lx = x + bw * (0.15 + k * 0.18);
        const sway = reduced ? 0 : Math.sin(t * 0.72 + r * 1.4 + c * 0.85) * 2.2;
        ctx.beginPath(); ctx.moveTo(lx, y + bh); ctx.quadraticCurveTo(lx + (k - 2) * 2 + sway * 0.35, y + bh * 0.4, lx + (k - 2) * 3.5 + sway, y + bh * 0.1 + (ruptured ? rup * 8 : 0)); ctx.stroke();
      }
    } else {
      // desiccated blades drooping
      ctx.strokeStyle = '#5a5340'; ctx.lineWidth = 1.4;
      for (let k = 0; k < 5; k++) { const lx = x + bw * (0.15 + k * 0.18); ctx.beginPath(); ctx.moveTo(lx, y + 3); ctx.quadraticCurveTo(lx + 4, y + bh * 0.5, lx + 2, y + bh * 0.9); ctx.stroke(); }
    }
    if (!reduced && !ruptured) { ctx.fillStyle = `rgba(140,255,190,${glow * 0.35})`; ctx.fillRect(x, y - 3, bw, 3); }
  }
  // condensation streaks
  if (!reduced) { ctx.strokeStyle = 'rgba(180,230,205,0.12)'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const x = rackX + 20 + i * (rackW / 6); ctx.beginPath(); ctx.moveTo(x, rackY + 4); ctx.lineTo(x, rackY + rackH - 10); ctx.stroke(); } }

  // left console: pump manifold with live pips
  panel(ctx, w * 0.035, h * 0.55, w * 0.105, h * 0.27, '#1d2833', '#121a24');
  ctx.fillStyle = state.lights.hydroPumps ? CYAN : '#33414f'; ctx.fillRect(w * 0.047, h * 0.585, w * 0.075, 4);
  for (let i = 0; i < 3; i++) { ctx.fillStyle = state.lights.hydroPumps ? (Math.sin(t * 2 + i * 2.1) > 0 ? '#7dffb8' : '#1d4030') : '#2a323c'; ctx.fillRect(w * 0.047 + i * 12, h * 0.615, 6, 6); }
  ctx.fillStyle = 'rgba(150,185,215,0.35)'; ctx.fillRect(w * 0.047, h * 0.66, w * 0.075, 2);

  // Far pressure door: hydraulic leaves part, a retained inner frame opens to vacuum.
  // Opening is tied to hydroRack rupture, then the view settles into a still, empty breach.
  const doorX = w * 0.72, doorY = h * 0.3, doorW = w * 0.2, doorH = h * 0.5;
  const opening = clamp01((state.t - 60) / 2);
  const portalW = doorW * opening;
  if (opening > 0) {
    const portalX = doorX + (doorW - portalW) / 2;
    const space = ctx.createLinearGradient(portalX, doorY, portalX + portalW, doorY + doorH);
    space.addColorStop(0, '#02050c'); space.addColorStop(0.55, '#0a1728'); space.addColorStop(1, '#02050c');
    ctx.fillStyle = space; ctx.fillRect(portalX, doorY, portalW, doorH);
    // Virgil's cold limb in the breach; it stays aligned as the pressure door opens.
    if (portalW > 12) {
      const glow = ctx.createRadialGradient(portalX + portalW * 0.8, doorY + doorH * 0.78, 2, portalX + portalW * 0.8, doorY + doorH * 0.78, doorH * 0.72);
      glow.addColorStop(0, 'rgba(104,150,194,0.42)'); glow.addColorStop(0.7, 'rgba(57,91,130,0.18)'); glow.addColorStop(1, 'rgba(24,39,61,0)');
      ctx.fillStyle = glow; ctx.fillRect(portalX, doorY, portalW, doorH);
      ctx.fillStyle = '#dceaff';
      for (let i = 0; i < 9; i++) { const d = DEBRIS[(i * 3 + 2) % DEBRIS.length]; ctx.fillRect(portalX + d.x * portalW, doorY + d.y * doorH, 1.4, 1.4); }
    }
  } else {
    const dg = ctx.createLinearGradient(doorX, 0, doorX + doorW, 0);
    dg.addColorStop(0, '#2c4254'); dg.addColorStop(0.5, '#41607c'); dg.addColorStop(1, '#22303f');
    ctx.fillStyle = dg; ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.fillStyle = '#bfe3ff'; ctx.beginPath(); ctx.arc(doorX + doorW / 2, doorY + 8, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Door leaves slide into the wall pockets; the orange inner seal remains visible.
  if (opening < 1) {
    const leafW = doorW * (1 - opening) / 2;
    const leafG = ctx.createLinearGradient(doorX, 0, doorX + doorW, 0);
    leafG.addColorStop(0, '#283b4d'); leafG.addColorStop(0.45, '#536a7d'); leafG.addColorStop(1, '#1c2936');
    ctx.fillStyle = leafG;
    ctx.fillRect(doorX, doorY, leafW, doorH);
    ctx.fillRect(doorX + doorW - leafW, doorY, leafW, doorH);
  }
  // Pressure-frame ribs, scorched seal, and fasteners explain the opening mechanically.
  ctx.strokeStyle = opening > 0 ? 'rgba(255,166,100,0.86)' : 'rgba(120,225,255,0.35)';
  ctx.lineWidth = 3; ctx.strokeRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = 'rgba(178,202,220,0.45)'; ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const yy = doorY + 10 + i * (doorH - 20) / 5;
    ctx.beginPath(); ctx.moveTo(doorX - 7, yy); ctx.lineTo(doorX + 2, yy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(doorX + doorW - 2, yy); ctx.lineTo(doorX + doorW + 7, yy); ctx.stroke();
  }
  // Evacuation stream: loose leaves and roots move from the rack toward and past the breach.
  if (opening > 0) {
    const flow = clamp01((state.t - 60) / 5);
    const count = reduced ? 12 : 30;
    for (let i = 0; i < count; i++) {
      const d = DEBRIS[(i * 7 + 3) % DEBRIS.length];
      const sx = rackX + rackW * (0.72 + d.x * 0.26);
      const sy = rackY + rackH * d.y;
      const ex = doorX + doorW * (0.36 + d.x * 0.28) + 120;
      const ey = doorY + doorH * (0.3 + d.y * 0.4);
      const px = sx + (ex - sx) * flow;
      const py = sy + (ey - sy) * flow + Math.sin(i * 2.4 + state.t * 1.7) * flow * 13;
      ctx.strokeStyle = i % 4 === 0 ? 'rgba(183,213,185,0.72)' : 'rgba(155,190,207,0.5)';
      ctx.lineWidth = i % 4 === 0 ? 1.8 : 1.1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 5 + flow * 12, py - 1 - flow * 3); ctx.stroke();
    }
  }
  const service = drawHydroServicePanel(ctx, w, h, { powered: state.lights.hydroPumps, rupture: rup });
  if (state.t >= 14 && state.t < 20) {
    drawHydroServiceHandoff(ctx, w, h, state, t, reduced, service);
  } else if (state.t >= 60 && state.t < 61.4 && rup < 0.35) {
    // Rin returns to the same panel with the same persistent wrench at the cut.
    const torque = reduced ? 0 : Math.sin((t - 60) * Math.PI * 2) * 0.035;
    drawRin(ctx, w * 0.63, h * 0.80, h * 0.27, {
      facing: 'left',
      workPoint: { x: service.workPoint.x, y: service.workPoint.y },
      wrenchPoint: { x: service.workPoint.x, y: service.workPoint.y },
      wrenchLength: h * 0.115,
      wrenchAngle: -0.56 + torque,
      gait: reduced ? 0 : (t - 60) * 0.28,
    });
  }
  vignette(ctx, w, h, 0.45);
}


function drawSurvivor(ctx, x, h, mode) {
  // Locked observation-chapel camera: same geometry for the first watch and M6.
  const lean = mode === 'hands' ? 0.15 : mode === 'working' ? 0.17 : mode === 'noticing' ? 0.07 : mode === 'watching' ? -0.06 : 0.04;
  ctx.fillStyle = '#10151d';
  ctx.fillRect(x - 12, h * 0.80 - 54, 9, 54);
  ctx.fillRect(x + 3, h * 0.80 - 54, 9, 54);
  ctx.save(); ctx.translate(x, h * 0.80 - 52); ctx.rotate(lean);
  const torsoG = ctx.createLinearGradient(0, -58, 0, 0);
  torsoG.addColorStop(0, '#31404f'); torsoG.addColorStop(1, '#1a2230');
  ctx.fillStyle = torsoG;
  ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-11.5, -56); ctx.lineTo(11.5, -56); ctx.lineTo(15, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(200,225,245,0.14)'; ctx.fillRect(-11.5, -56, 2.5, 56);
  const hy = mode === 'working' ? -66 : -68;
  const hg = ctx.createRadialGradient(5, hy - 4, 2, 1, hy, 19);
  hg.addColorStop(0, '#c9b6a3'); hg.addColorStop(0.6, '#7a6a5a'); hg.addColorStop(1, '#241d16');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, hy, 12, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(10.8, hy - 1.2); ctx.lineTo(15.6, hy + 2.1); ctx.lineTo(10.8, hy + 4.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#171009';
  ctx.beginPath(); ctx.ellipse(-1.5, hy - 6.2, 12.4, 7.6, 0.12, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(-13, hy - 7, 4.5, 9);
  if (mode === 'working') {
    ctx.strokeStyle = 'rgba(18,13,9,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4.5, hy + 1.4); ctx.lineTo(9.2, hy + 2.2); ctx.stroke();
  } else {
    ctx.fillStyle = '#1c1712'; ctx.beginPath(); ctx.ellipse(7, hy - 1.4, 2.1, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(241,222,199,0.9)'; ctx.fillRect(8.1, hy - 2.3, 1.2, 1.2);
  }
  if (mode === 'hands') {
    ctx.strokeStyle = '#28313f'; ctx.lineCap = 'round'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(7, -45); ctx.lineTo(36, -46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, -28); ctx.lineTo(36, -30); ctx.stroke();
    for (const py of [-46, -30]) {
      const pg = ctx.createRadialGradient(37, py, 1, 37, py, 11);
      pg.addColorStop(0, '#e6d6c6'); pg.addColorStop(0.6, '#93816f'); pg.addColorStop(1, '#33291f');
      ctx.fillStyle = pg;
      ctx.beginPath(); ctx.ellipse(38.5, py, 5.0, 6.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9c6b3';
      for (let f = -1.5; f <= 1.5; f++) { ctx.beginPath(); ctx.ellipse(44, py + f * 4.1, 2.0, 3.3, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = 'rgba(215,232,246,0.16)';
      ctx.beginPath(); ctx.ellipse(41, py, 12.5, 15, 0, 0, Math.PI * 2); ctx.fill();
    }
  } else if (mode === 'working' || mode === 'noticing') {
    // One hand works the surviving console; at the notice beat it stills there.
    ctx.strokeStyle = '#28313f'; ctx.lineCap = 'round'; ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(-8, -43); ctx.quadraticCurveTo(-15, -24, -6.5, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -43); ctx.quadraticCurveTo(18, -29, 26, -16); ctx.stroke();
    ctx.fillStyle = '#a68f78'; ctx.beginPath(); ctx.arc(26, -16, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(227,211,190,0.72)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(25, -16); ctx.lineTo(29, -18); ctx.stroke();
  } else {
    ctx.strokeStyle = '#28313f'; ctx.lineCap = 'round'; ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(-8, -43); ctx.quadraticCurveTo(-15, -24, -6.5, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -43); ctx.quadraticCurveTo(13, -26, 2.5, -13); ctx.stroke();
  }
  ctx.restore();
}


function drawSurvivorClose(ctx, w, h, t = 81) {
  // Same final pane and hand composition; only a slow breath and minute palm
  // pressure shift move in the interior. A four-second cycle match-cuts at 81/89s.
  const breath = Math.sin((t - 80) * Math.PI / 2);
  const chestLift = breath * h * 0.003;
  const cx = w * 0.5, cy = h * 0.435 - chestLift * 0.16;
  // shoulders and forearms, in worn blue-steel workwear
  const coat = ctx.createLinearGradient(0, h * 0.61, 0, h * 0.98);
  coat.addColorStop(0, '#344456'); coat.addColorStop(0.45, '#202b39'); coat.addColorStop(1, '#111923');
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(w * 0.18, h); ctx.lineTo(w * 0.24, h * 0.74 - chestLift * 0.25); ctx.quadraticCurveTo(w * 0.31, h * 0.62 - chestLift, w * 0.42, h * 0.62 - chestLift); ctx.lineTo(w * 0.58, h * 0.62 - chestLift); ctx.quadraticCurveTo(w * 0.69, h * 0.62 - chestLift, w * 0.76, h * 0.74 - chestLift * 0.25); ctx.lineTo(w * 0.82, h); ctx.closePath(); ctx.fill();
  // forearms in sleeves converge toward the glass, kept below the face
  ctx.fillStyle = '#293748';
  ctx.beginPath(); ctx.moveTo(w * 0.36, h * 0.69); ctx.lineTo(w * 0.41, h * 0.66); ctx.lineTo(w * 0.35, h * 0.54); ctx.lineTo(w * 0.30, h * 0.56); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w * 0.64, h * 0.69); ctx.lineTo(w * 0.59, h * 0.66); ctx.lineTo(w * 0.65, h * 0.54); ctx.lineTo(w * 0.70, h * 0.56); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(193,218,238,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(w * 0.31, h * 0.565); ctx.lineTo(w * 0.36, h * 0.55); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w * 0.69, h * 0.565); ctx.lineTo(w * 0.64, h * 0.55); ctx.stroke();

  // face: calm, tired, breathing; lit along the glass-facing cheekbones
  const head = ctx.createRadialGradient(cx - w * 0.025, cy - h * 0.065, 3, cx, cy, w * 0.13);
  head.addColorStop(0, '#d1c0af'); head.addColorStop(0.52, '#907e6d'); head.addColorStop(0.86, '#55483f'); head.addColorStop(1, '#201a17');
  ctx.fillStyle = head;
  ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.083, h * 0.17, 0, 0, Math.PI * 2); ctx.fill();
  // ears
  ctx.fillStyle = '#897564';
  ctx.beginPath(); ctx.ellipse(cx - w * 0.083, cy + h * 0.005, w * 0.013, h * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + w * 0.083, cy + h * 0.005, w * 0.013, h * 0.035, 0, 0, Math.PI * 2); ctx.fill();
  // short dark hair, uneven at temples
  const hair = ctx.createLinearGradient(0, cy - h * 0.18, 0, cy - h * 0.10);
  hair.addColorStop(0, '#0e0c0b'); hair.addColorStop(1, '#2a211a'); ctx.fillStyle = hair;
  ctx.beginPath(); ctx.moveTo(cx - w * 0.087, cy - h * 0.015); ctx.lineTo(cx - w * 0.086, cy - h * 0.11);
  ctx.quadraticCurveTo(cx - w * 0.071, cy - h * 0.19, cx, cy - h * 0.183);
  ctx.quadraticCurveTo(cx + w * 0.088, cy - h * 0.17, cx + w * 0.087, cy - h * 0.092);
  ctx.lineTo(cx + w * 0.076, cy - h * 0.03); ctx.lineTo(cx + w * 0.055, cy - h * 0.075);
  ctx.lineTo(cx + w * 0.028, cy - h * 0.048); ctx.lineTo(cx + w * 0.002, cy - h * 0.08);
  ctx.lineTo(cx - w * 0.03, cy - h * 0.043); ctx.lineTo(cx - w * 0.057, cy - h * 0.075); ctx.closePath(); ctx.fill();
  // steady eyes toward Virgil, soft under-eye shadow, no alarm expression
  ctx.strokeStyle = 'rgba(30,22,18,0.85)'; ctx.lineWidth = Math.max(1.4, w * 0.0015);
  for (const side of [-1, 1]) {
    const ex = cx + side * w * 0.033;
    ctx.beginPath(); ctx.moveTo(ex - w * 0.013, cy - h * 0.006); ctx.quadraticCurveTo(ex, cy - h * 0.012, ex + w * 0.013, cy - h * 0.005); ctx.stroke();
    ctx.fillStyle = 'rgba(231,239,244,0.75)'; ctx.beginPath(); ctx.arc(ex + side * 3, cy - h * 0.007, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(35,25,20,0.3)'; ctx.beginPath(); ctx.moveTo(ex - w * 0.012, cy + h * 0.017); ctx.quadraticCurveTo(ex, cy + h * 0.022, ex + w * 0.012, cy + h * 0.016); ctx.stroke();
  }
  // nose bridge and mouth are quiet, not stylized or smiling
  ctx.strokeStyle = 'rgba(45,33,26,0.46)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(cx, cy + h * 0.005); ctx.quadraticCurveTo(cx + 2, cy + h * 0.045, cx - 1, cy + h * 0.052); ctx.stroke();
  ctx.strokeStyle = 'rgba(45,29,24,0.78)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - w * 0.019, cy + h * 0.092); ctx.quadraticCurveTo(cx, cy + h * 0.096, cx + w * 0.019, cy + h * 0.091); ctx.stroke();
  const breathMist = ctx.createRadialGradient(cx, cy + h * 0.16, 2, cx, cy + h * 0.16, w * 0.065);
  breathMist.addColorStop(0, `rgba(215,232,246,${0.018 + (1 - breath) * 0.009})`);
  breathMist.addColorStop(1, 'rgba(215,232,246,0)');
  ctx.fillStyle = breathMist; ctx.beginPath(); ctx.arc(cx, cy + h * 0.16, w * 0.065, 0, Math.PI * 2); ctx.fill();
  // both palms: open, fingers separated, skin lit against the dark glass
  for (const side of [-1, 1]) {
    const pressure = breath * h * 0.001;
    const px = cx + side * w * 0.177, py = h * 0.55 + pressure;
    const palm = ctx.createRadialGradient(px - side * 5, py - 9, 2, px, py, w * 0.052);
    palm.addColorStop(0, '#e0cfbd'); palm.addColorStop(0.6, '#ad9882'); palm.addColorStop(1, '#55473b');
    ctx.fillStyle = palm;
    ctx.beginPath(); ctx.ellipse(px, py, w * 0.033, h * 0.062, side * -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c5ad96';
    const fingerX = [-0.024, -0.008, 0.008, 0.024];
    const fingerH = [0.045, 0.057, 0.061, 0.05];
    for (let i = 0; i < 4; i++) {
      const fx = px + side * w * fingerX[i];
      const fy = py - h * (0.065 + fingerH[i] * 0.45);
      ctx.beginPath(); ctx.ellipse(fx, fy, w * 0.0071, h * fingerH[i], (i - 1.5) * 0.065, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(241,225,205,0.6)'; ctx.fillRect(fx - 1, fy - h * fingerH[i] * 0.8, 2, 4);
      ctx.fillStyle = '#c5ad96';
    }
    // thumb sweeps inward across the pane
    ctx.beginPath(); ctx.ellipse(px - side * w * 0.034, py + h * 0.014, w * 0.008, h * 0.027, side * 0.45, 0, Math.PI * 2); ctx.fill();
    // a soft breath/fingerprint fog on the glass around each palm
    const mist = ctx.createRadialGradient(px, py, 3, px, py, w * 0.066);
    mist.addColorStop(0, 'rgba(215,232,246,0.12)'); mist.addColorStop(1, 'rgba(215,232,246,0)');
    ctx.fillStyle = mist; ctx.beginPath(); ctx.arc(px, py, w * 0.066, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------- chapel / observation room ----------

export function drawChapel(ctx, w, h, state, t, reduced, inspectionCamera = false) {
  // dark room first; Virgil only through the panes
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0a1018'); g.addColorStop(1, '#141d28');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  const bays = GEOMETRY.observationBays;
  const baysGeom = [];
  const glassCrossing = observationGlassCrossingAt(t);
  for (let b = 0; b < bays; b++) {
    const bw = w * 0.26, bh = h * 0.5;
    const bx = w * (0.08 + b * 0.32), by = h * 0.1;
    const cant = (b - 1) * 0.055;
    baysGeom.push({ bx, by, bw, bh, cant });
    ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.transform(1, 0, cant, 1, 0, 0);
    ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
    // sky through this bay: stars + a Virgil limb (offset per bay for parallax)
    ctx.fillStyle = '#050a12'; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    for (const s of STARS) { if (s.y < 0.85) { ctx.globalAlpha = 0.35 + 0.4 * s.r / 1.8; ctx.fillStyle = '#cfe0f2'; ctx.fillRect(-bw / 2 + ((s.x * 1.7 + b * 0.33) % 1) * bw, -bh / 2 + s.y * bh, s.r, s.r); } }
    ctx.globalAlpha = 1;
    const vOff = (b - 1) * w * 0.02;
    const vg = ctx.createRadialGradient(vOff + bw * 0.28, bh * 0.62, 8, vOff + bw * 0.28, bh * 0.62, bw * 1.15);
    vg.addColorStop(0, '#b8cfe2'); vg.addColorStop(0.4, '#5d7d9e'); vg.addColorStop(1, '#1e2c3f');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(vOff + bw * 0.28, bh * 0.62, bw * 1.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(210,226,242,0.18)'; ctx.fillRect(-bw / 2, bh * 0.02, bw, bh * 0.055); ctx.fillRect(-bw / 2, bh * 0.2, bw, bh * 0.04);
    if (b === 1) drawGlassCrossingBehindPane(ctx, { width: bw, height: bh }, glassCrossing, t, reduced);
    // glass reflection sheen
    const sheen = ctx.createLinearGradient(-bw / 2, -bh / 2, bw / 2, bh / 2);
    sheen.addColorStop(0, 'rgba(200,225,248,0.22)'); sheen.addColorStop(0.35, 'rgba(200,225,248,0.03)'); sheen.addColorStop(0.6, 'rgba(200,225,248,0.1)'); sheen.addColorStop(1, 'rgba(200,225,248,0)');
    ctx.fillStyle = sheen; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.restore();
    // frame + mullion (thick, riveted)
    ctx.save(); ctx.translate(bx + bw / 2, by + bh / 2); ctx.transform(1, 0, cant, 1, 0, 0);
    ctx.strokeStyle = '#31404f'; ctx.lineWidth = 11; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeStyle = '#1a2530'; ctx.lineWidth = 3; ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, -bh / 2); ctx.lineTo(0, bh / 2); ctx.stroke();
    rivetRow(ctx, -bw / 2 + 4, -bh / 2 + 5, bw / 2 - 4, -bh / 2 + 5, 6); rivetRow(ctx, -bw / 2 + 4, bh / 2 - 5, bw / 2 - 4, bh / 2 - 5, 6);
    ctx.restore();
  }
  // canted bay shade walls between bays
  ctx.fillStyle = '#101820';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.075, h * 0.08); ctx.lineTo(w * 0.075, h * 0.62); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w * 0.965, h * 0.08); ctx.lineTo(w * 0.965, h * 0.62); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  // long console with instrument lamps (surviving light)
  panel(ctx, w * 0.12, h * 0.68, w * 0.76, h * 0.1, '#1d2833', '#0f1620');
  const handsBeat = state.finale.hands || state.finale.returnHands;
  for (let i = 0; i < 8; i++) {
    const on = !handsBeat && state.lights.chapelSurviving && (i % 3 !== 1 || t < 78);
    ctx.fillStyle = on ? (i % 4 === 2 ? '#ffb35a' : CYAN) : '#26313e';
    ctx.fillRect(w * (0.15 + i * 0.088), h * 0.7, 14, 4.5);
    if (on && !reduced) { ctx.fillStyle = 'rgba(55,230,255,0.12)'; ctx.fillRect(w * (0.15 + i * 0.088) - 3, h * 0.7 + 4.5, 20, 8); }
  }
  // floor grate
  ctx.fillStyle = '#0d141c'; ctx.fillRect(0, h * 0.82, w, h * 0.18);
  ctx.strokeStyle = 'rgba(150,185,215,0.28)'; ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(w * (0.05 + i * 0.082), h * 0.84); ctx.lineTo(w * (0.05 + i * 0.082) - 6, h); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(150,185,215,0.14)'; ctx.beginPath(); ctx.moveTo(0, h * 0.9); ctx.lineTo(w, h * 0.9); ctx.stroke();

  const closeBeat = state.finale.hands || state.finale.returnHands || state.finale.exterior;
  if (closeBeat) {
    if (inspectionCamera) drawSurvivor(ctx, w * 0.5, h * 0.80, 'watch');
    else drawSurvivorClose(ctx, w, h, t);
    // The same surviving strip light remains visible through the crossing.
    ctx.fillStyle = 'rgba(255,233,184,0.28)'; ctx.fillRect(w * 0.18, h * 0.815, w * 0.64, 10);
    ctx.fillStyle = '#ffe9b8'; ctx.fillRect(w * 0.18, h * 0.825, w * 0.64, 3);
  } else {
    drawSurvivor(ctx, w * 0.5, h * 0.80, state.actors.survivor.attention || 'watch');
    if (state.t < 30) {
      const phase = reduced ? 0.5 : 0.5 + Math.sin(t * 0.38 + 0.9) * 0.04;
      drawCrew(ctx, w * (0.84 + phase * 0.025), h * 0.78, 26, { suit: '#526476' }); // attendant checks the side console
      ctx.fillStyle = '#3b4d5e'; ctx.fillRect(w * 0.84, h * 0.72, 20, 3);
      ctx.fillStyle = Math.sin(t * 1.4) > 0 ? '#62dbe8' : '#304651'; ctx.fillRect(w * 0.85, h * 0.73, 5, 4);
    }
    // traffic crossing far below (life chapter only)
    if (state.t < 30 && !reduced) {
      const u = clamp01((t - 21.5) / 6.5);
      const x = w * (0.18 + u * 0.55), y = h * (0.33 - u * 0.05);
      ctx.fillStyle = '#e8eef5'; ctx.fillRect(x, y, 13, 6); ctx.fillStyle = 'rgba(120,200,255,0.8)'; ctx.fillRect(x + 11, y + 1, 3, 4);
    }
  }
  vignette(ctx, w, h, 0.5);
}

// The final camera literally leaves the center Chapel bay: the exterior replaces
// the glass aperture and the reveal expands until the room is behind the lens.
export function drawViewportCrossing(ctx, w, h, state, t, reduced, progress, exteriorView = {}) {
  const p = clamp01(progress);
  drawChapel(ctx, w, h, state, t, reduced);

  const left0 = w * 0.402, top0 = h * 0.102;
  const right0 = w * 0.662, bottom0 = h * 0.602;
  const left = lerpNum(left0, 0, p), right = lerpNum(right0, w, p);
  const top = lerpNum(top0, 0, p), bottom = lerpNum(bottom0, h, p);
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, right - left, bottom - top); ctx.clip();
  drawStationExterior(ctx, w, h, state, t, reduced, { centerX: 0.40, ...exteriorView });
  ctx.restore();

  if (p < 0.985) {
    const inset = 5 + (1 - p) * 13;
    ctx.save(); ctx.globalAlpha = (1 - p) * 0.78;
    ctx.strokeStyle = 'rgba(199,222,240,0.88)'; ctx.lineWidth = Math.max(1, 8 * (1 - p));
    ctx.strokeRect(left + inset, top + inset, right - left - inset * 2, bottom - top - inset * 2);
    ctx.restore();
  }
}

// ---------- M3 viewport lane ----------

export function drawViewportLane(ctx, w, h, state, t, reduced) {
  drawChapel(ctx, w, h, state, t, reduced);
  // vent streaks from north habitation breach (bounded)
  const u = clamp01((state.t - 52) / 6);
  const n = reduced ? 10 : 28;
  ctx.strokeStyle = 'rgba(205,228,246,0.5)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < n; i++) {
    const d = DEBRIS[(i * 5 + 1) % DEBRIS.length];
    const x0 = w * d.x, y0 = h * d.y;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + u * w * 0.09, y0 + u * h * 0.045); ctx.stroke();
  }
  // drawChapel paints the recurring pair on the same normalized world-space
  // track behind the center pane; this shot adds only the north-vent debris.
}

// ---------- M5 reliquary ----------

export function drawReliquary(ctx, w, h, state, t, reduced) {
  drawStationExterior(ctx, w, h, state, t, reduced);
  // cryo reliquary band arc around spine
  ctx.strokeStyle = 'rgba(150,225,255,0.55)'; ctx.lineWidth = 2.4;
  if (ctx.setLineDash) ctx.setLineDash([7, 9]);
  ctx.beginPath(); ctx.ellipse(w * 0.40, h * 0.50, Math.min(w, h) * 0.46, Math.min(w, h) * 0.185, -0.35, 0, Math.PI * 2); ctx.stroke();
  if (ctx.setLineDash) ctx.setLineDash([]);
  // Kira's pod glint on the band
  if (state.landmarks.kiraPlaced) { ctx.fillStyle = '#dff3ff'; ctx.beginPath(); ctx.arc(w * 0.295, h * 0.615, 4, 0, Math.PI * 2); ctx.fill(); }
}

// ---------- M6 bloom ----------

export function drawBloom(ctx, w, h, state, t, reduced) {
  drawStars(ctx, w, h, t, reduced);
  drawVirgil(ctx, w, h, t, reduced);
  const cx = w * 0.5, cy = h * 0.51;
  const u = clamp01((state.t - 86) / 2.5);
  const ease = 1 - Math.pow(1 - u, 3);
  const R = Math.min(w, h) * 0.285;
  const squash = 0.44;

  // Meridian's geometry-locked ring remains recognizable inside the unfolding form.
  const armCount = GEOMETRY.initialDockingArms;
  const ringOuter = 1;
  const ringInner = ringOuter * (1 - (2 * GEOMETRY.ringRadialThicknessKm) / GEOMETRY.ringDiameterKm);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, squash);
  const ring = ctx.createRadialGradient(0, 0, R * ringInner, 0, 0, R * ringOuter);
  ring.addColorStop(0, '#18222f'); ring.addColorStop(0.3, '#7890a6'); ring.addColorStop(0.52, '#a9bfd2'); ring.addColorStop(0.74, '#4b5e72'); ring.addColorStop(1, '#17212d');
  ctx.fillStyle = ring;
  ctx.beginPath(); ctx.arc(0, 0, R * ringOuter, 0, Math.PI * 2); ctx.arc(0, 0, R * ringInner, 0, Math.PI * 2); ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(14,22,32,0.66)'; ctx.lineWidth = 2;
  for (let i = 0; i < armCount * 3; i++) {
    const a = i * Math.PI * 2 / (armCount * 3);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * (ringInner + 0.02), Math.sin(a) * R * (ringInner + 0.02)); ctx.lineTo(Math.cos(a) * R * (ringOuter - 0.01), Math.sin(a) * R * (ringOuter - 0.01)); ctx.stroke();
  }
  ctx.restore();

  // Twelve structural petals open from the ring. Three are the same tracked pieces,
  // placed at their persistent radial-bloom sector by ID.
  const tracked = new Map(state.components.map((component) => [component.placementSector, component]));
  for (let i = 0; i < armCount; i++) {
    const a = i * Math.PI * 2 / armCount - Math.PI / 2 + ease * 0.18;
    const component = tracked.get(i);
    const drift = component?.drift || 0;
    const rootR = R * (0.88 + (component ? drift * 0.08 : 0));
    const len = R * (0.28 + ease * 1.05 + drift * 0.22);
    const width = R * (0.12 + ease * 0.08);
    const px = cx + Math.cos(a) * rootR, py = cy + Math.sin(a) * rootR * squash;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    const petal = ctx.createLinearGradient(0, -width, len, width);
    petal.addColorStop(0, component ? '#526c83' : '#344657');
    petal.addColorStop(0.42, component ? '#c1d4e5' : '#7890a6');
    petal.addColorStop(0.72, component ? '#718da5' : '#45596e');
    petal.addColorStop(1, '#18232f');
    ctx.fillStyle = petal;
    ctx.beginPath(); ctx.moveTo(-2, -width * 0.18);
    ctx.quadraticCurveTo(len * 0.22, -width * 0.72, len * 0.72, -width * 0.42);
    ctx.quadraticCurveTo(len, -width * 0.18, len * 1.03, 0);
    ctx.quadraticCurveTo(len * 0.8, width * 0.42, len * 0.42, width * 0.34);
    ctx.quadraticCurveTo(len * 0.12, width * 0.27, -2, width * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = component ? 'rgba(227,241,253,0.92)' : 'rgba(195,215,232,0.5)';
    ctx.lineWidth = component ? 2.2 : 1.2;
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.quadraticCurveTo(len * 0.52, -width * 0.05, len * 0.97, 0); ctx.stroke();
    ctx.fillStyle = '#d9e8f5'; ctx.fillRect(1, -2, 5, 4); // root collar / persistent ID anchor
    ctx.restore();
  }

  // Spire and lower spine keep their geometry-locked asymmetry in the final form.
  const radiusKm = GEOMETRY.ringDiameterKm / 2;
  const upperTip = R * GEOMETRY.spireAboveRingKm / radiusKm;
  const lowerTip = R * GEOMETRY.spineBelowRingKm / radiusKm;
  const spine = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0);
  spine.addColorStop(0, '#293a4a'); spine.addColorStop(0.45, '#c1d4e5'); spine.addColorStop(1, '#1b2734');
  ctx.strokeStyle = spine; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy - upperTip); ctx.lineTo(cx, cy + lowerTip); ctx.stroke();
  ctx.strokeStyle = 'rgba(220,239,255,0.48)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(cx - 1.5, cy - upperTip + R * 0.03); ctx.lineTo(cx - 1.5, cy + lowerTip - R * 0.03); ctx.stroke();

  // Tiger stays backlit by Virgil at the center: still, deliberate, never the final image.
  drawTiger(ctx, cx, cy - Math.min(w, h) * 0.025, Math.min(w, h) * 0.205, t);
  // Orbiting crew landmarks persist as small fixed lights in the same arrangement.
  ctx.fillStyle = '#eef4fb';
  for (const [px, py] of [[0.22, 0.2], [0.78, 0.24], [0.28, 0.78], [0.74, 0.74]]) { ctx.beginPath(); ctx.arc(w * px, h * py, 3, 0, Math.PI * 2); ctx.fill(); }
  vignette(ctx, w, h, 0.45);
}

// ---------- master dispatch ----------

function renderCam(ctx, w, h, state, cam, reduced) {
  const camera = CAMERAS[cam] || CAMERAS.docking;
  if (camera.scene === 'exterior') {
    const zoom = Math.max(1, camera.zoom || 1);
    const minFocus = Math.min(0.5, 0.5 / zoom + 0.003);
    const maxFocus = 1 - minFocus;
    const fx = w * Math.max(minFocus, Math.min(maxFocus, camera.centerX));
    const fy = h * Math.max(minFocus, Math.min(maxFocus, camera.focusY));
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(camera.rotation || 0); ctx.scale(zoom, zoom); ctx.translate(-fx, -fy);
    drawStationExterior(ctx, w, h, state, state.t, reduced, { centerX: camera.centerX });
    ctx.restore();
  } else if (camera.scene === 'hydro') {
    drawHydro(ctx, w, h, state, state.t, reduced);
  } else {
    drawChapel(ctx, w, h, state, state.t, reduced, true);
  }
}

function applyFilmCamera(ctx, w, h, camera) {
  if (!camera) return;
  const zoom = Math.max(1, camera.zoom || 1); // never reveal unpainted edges on a pull-back
  if (zoom === 1 && !camera.roll) return;
  // Keep enough overscan on every edge after a pan/zoom. Focus is a target, not
  // permission for the camera to expose empty pixels outside the rendered plate.
  const minFocus = Math.min(0.5, 0.5 / zoom + 0.003);
  const maxFocus = 1 - minFocus;
  const fx = w * Math.max(minFocus, Math.min(maxFocus, camera.focusX ?? 0.5));
  const fy = h * Math.max(minFocus, Math.min(maxFocus, camera.focusY ?? 0.5));
  ctx.translate(w / 2, h / 2);
  ctx.rotate(camera.roll || 0);
  ctx.scale(zoom, zoom);
  ctx.translate(-fx, -fy);
}

export function renderScene(ctx, w, h, state, opts = {}) {
  const reduced = !!opts.reduced;
  if (opts.beforeAfter) {
    const cam = opts.beforeAfter.cam || 'docking';
    const intact = opts.beforeAfter.intactState;
    const panelW = w / 2;
    const scale = Math.min((panelW - 24) / w, (h - 52) / h);
    const imageW = w * scale, imageH = h * scale;
    ctx.fillStyle = '#02050a'; ctx.fillRect(0, 0, w, h);
    for (const [side, view] of [[0, intact], [1, state]]) {
      const panelX = side * panelW;
      const x = panelX + (panelW - imageW) / 2;
      const y = (h - imageH) / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(panelX, 0, panelW, h); ctx.clip();
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      renderCam(ctx, w, h, view, cam, reduced);
      ctx.restore();
      ctx.strokeStyle = 'rgba(188,215,236,0.38)'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, imageW - 1, imageH - 1);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(232,238,244,0.75)'; ctx.fillRect(panelW - 1, 0, 2, h);
    return;
  }
  const shot = opts.shot || shotAt(state.t);
  ctx.save();
  applyFilmCamera(ctx, w, h, opts.camera || shot.camera);
  renderSingle(ctx, w, h, state, reduced, shot);
  ctx.restore();
}

function renderSingle(ctx, w, h, state, reduced, shot) {
  const t = state.t;
  switch (shot.scene) {
    case 'exterior': drawStationExterior(ctx, w, h, state, t, reduced, shot.camera || {}); break;
    case 'interior': drawInterior(ctx, w, h, state, t, reduced); break;
    case 'hydro': drawHydro(ctx, w, h, state, t, reduced); break;
    case 'chapel': drawChapel(ctx, w, h, state, t, reduced); break;
    case 'viewport-lane': drawViewportLane(ctx, w, h, state, t, reduced); break;
    case 'reliquary': drawReliquary(ctx, w, h, state, t, reduced); break;
    case 'window-crossing': drawViewportCrossing(ctx, w, h, state, t, reduced, shot.progress, shot.camera || {}); break;
    case 'bloom': drawBloom(ctx, w, h, state, t, reduced); break;
    default: drawChapel(ctx, w, h, state, t, reduced); break;
  }
}

export function letterbox(ctx, w, h) {
  const bar = Math.round(h * 0.085);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
}
