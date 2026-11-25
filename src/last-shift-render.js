// Cinematic renderer for the read-only after-film comparison.
// Both panes reuse the production simulation and the existing Canvas art.
import {
  drawInterior, drawHydro, drawChapel, drawViewportLane,
  drawViewportCrossing, drawBloom,
} from './render.js';
import { shotAt } from './cameras.js';
import { lastShiftJourney, lastShiftPair, routePointAt, SHIFT_ROUTE } from './last-shift.js';

const clampShift = (value, low, high) => Math.max(low, Math.min(high, value));

function drawDockSocket(ctx, width, height, state) {
  const x = width * 0.235, y = height * 0.285;
  const plateW = width * 0.13, plateH = height * 0.18;
  const cx = x + plateW * 0.5, cy = y + plateH * 0.5;
  const radius = Math.min(plateW, plateH) * 0.34;
  const connected = state.paths.dockTerminal;
  ctx.save();
  ctx.fillStyle = 'rgba(5,10,15,0.82)'; ctx.fillRect(x - 5, y - 4, plateW + 10, plateH + 8);
  if (connected && state.t < 8) {
    const shipW = plateW * 0.92, shipH = plateH * 0.34;
    const shipX = cx - shipW, shipY = cy - shipH / 2;
    const hull = ctx.createLinearGradient(shipX, shipY, shipX, shipY + shipH);
    hull.addColorStop(0, '#a8bac9'); hull.addColorStop(0.5, '#60788c'); hull.addColorStop(1, '#2b3d4e');
    ctx.fillStyle = hull; ctx.fillRect(shipX, shipY, shipW, shipH);
    ctx.fillStyle = '#d9e7f2'; ctx.fillRect(shipX + shipW * 0.16, shipY + shipH * 0.14, shipW * 0.48, shipH * 0.12);
    ctx.fillStyle = '#61d8e8'; ctx.fillRect(shipX + shipW * 0.70, shipY + shipH * 0.28, shipW * 0.18, shipH * 0.35);
  }
  ctx.fillStyle = '#263543'; ctx.fillRect(x, y, plateW, plateH);
  ctx.strokeStyle = 'rgba(186,207,224,0.42)'; ctx.lineWidth = 1.4; ctx.strokeRect(x + 0.5, y + 0.5, plateW - 1, plateH - 1);
  ctx.strokeStyle = '#111923'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = connected ? 'rgba(121,215,226,0.9)' : 'rgba(255,176,120,0.9)';
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = connected ? '#3d5868' : '#090f15';
  ctx.beginPath(); ctx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2); ctx.fill();
  if (connected) {
    ctx.fillStyle = '#b7eaf0'; ctx.beginPath(); ctx.arc(cx, cy, radius * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(121,215,226,0.3)'; ctx.beginPath(); ctx.arc(cx, cy, radius * 0.52, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = 'rgba(255,176,120,0.82)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(cx - radius * 0.35, cy - radius * 0.35); ctx.lineTo(cx + radius * 0.35, cy + radius * 0.35);
    ctx.moveTo(cx + radius * 0.35, cy - radius * 0.35); ctx.lineTo(cx - radius * 0.35, cy + radius * 0.35); ctx.stroke();
  }
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.fillStyle = '#9aabb9'; ctx.beginPath(); ctx.arc(cx + dx * plateW * 0.40, cy + dy * plateH * 0.38, 1.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawRouteMap(ctx, w, h, state, journey, labels) {
  const x = w * 0.045, y = h * 0.055, mapW = w * 0.38, mapH = h * 0.23;
  ctx.save();
  ctx.fillStyle = 'rgba(3,8,13,0.84)';
  ctx.fillRect(x, y, mapW, mapH);
  ctx.strokeStyle = 'rgba(167,196,218,0.34)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, mapW - 1, mapH - 1);
  const xy = (p) => [x + p.x * mapW, y + p.y * mapH];
  const { direct, sealedApproach, closedContinuation, dockingBranch, bypass, pressureClosure } = SHIFT_ROUTE;

  function path(points, color, width, dash = []) {
    if (points.length < 2) return;
    ctx.beginPath();
    const [sx, sy] = xy(points[0]);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < points.length; i++) {
      const [px, py] = xy(points[i]);
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (ctx.setLineDash) ctx.setLineDash(dash);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
  }

  const origin = direct[0], junction = dockingBranch[0], ring = direct.at(-1);
  const dock = dockingBranch.at(-1);
  const directOpen = state.paths.dockTerminal;
  if (directOpen) {
    path(direct, 'rgba(121,215,226,0.86)', 2.2);
    path(dockingBranch, 'rgba(121,215,226,0.86)', 2.2);
  } else {
    path(sealedApproach, 'rgba(121,215,226,0.82)', 2.2);
    path(closedContinuation, 'rgba(190,135,103,0.58)', 2, [3, 5]);
    path(dockingBranch, 'rgba(190,135,103,0.58)', 1.8, [3, 5]);
    const [sx, sy] = xy(pressureClosure);
    ctx.strokeStyle = '#ffb078';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx - 5, sy - 7); ctx.lineTo(sx + 5, sy + 7); ctx.moveTo(sx + 5, sy - 7); ctx.lineTo(sx - 5, sy + 7); ctx.stroke();
    if (state.paths.ringServiceBypass) path(bypass, 'rgba(121,215,226,0.92)', 2.8, [4, 3]);
  }

  for (const node of [origin, junction, pressureClosure, ring, dock]) {
    const [nx, ny] = xy(node);
    const unavailable = (!directOpen && (node === pressureClosure || node === dock));
    ctx.fillStyle = unavailable ? '#ffb078' : '#d7e8f3';
    ctx.beginPath(); ctx.arc(nx, ny, 3.2, 0, Math.PI * 2); ctx.fill();
  }

  const cartPath = directOpen ? direct : sealedApproach;
  const cartPoint = routePointAt(cartPath, journey.cartProgress);
  const [cx, cy] = xy(cartPoint);
  ctx.fillStyle = '#f1d2a0'; ctx.fillRect(cx - 4, cy - 3, 8, 5);
  ctx.fillStyle = '#071018'; ctx.fillRect(cx - 3, cy + 2, 2, 2); ctx.fillRect(cx + 1, cy + 2, 2, 2);

  if (journey.bypassTraceProgress != null && state.paths.ringServiceBypass) {
    const trace = routePointAt(bypass, journey.bypassTraceProgress);
    const [tx, ty] = xy(trace);
    ctx.strokeStyle = 'rgba(121,215,226,0.42)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#d6fbff'; ctx.beginPath(); ctx.arc(tx, ty, 2.5, 0, Math.PI * 2); ctx.fill();
  }

  if (labels) {
    ctx.font = `${Math.max(8, Math.round(h * 0.018))}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(229,238,244,0.92)';
    ctx.fillText('CORRIDOR', x + 3, y + mapH - 5);
    ctx.fillText('DOCK ARM', x + mapW * 0.31, y + mapH - 3);
    ctx.fillText('TRANSIT RING', x + mapW * 0.66, y + mapH - 5);
    if (state.paths.ringServiceBypass) ctx.fillText('SERVICE BYPASS', x + mapW * 0.42, y + mapH * 0.21);
    if (state.pressure.dockIsolation) ctx.fillText('SEALED', x + mapW * 0.47, y + mapH * 0.72);
  }
  ctx.restore();
}

function drawPane(ctx, width, height, state, pair, options, isMonthPane) {
  const { stage, month, elapsed, reduced, showRoute, labels, glassBeat } = options;
  const baseVisualTime = pair.intactTime + elapsed;

  if (stage === 'dock') {
    const journey = lastShiftJourney({
      directOpen: state.paths.dockTerminal,
      bypassOpen: state.paths.ringServiceBypass,
    }, elapsed);
    const routeClosed = !state.paths.dockTerminal;
    const sealContact = 0.455 - 24 / Math.max(1, width);
    const cartXFactor = routeClosed
      ? 0.24 + journey.cartProgress * (sealContact - 0.24)
      : 0.24 + journey.cartProgress * 0.50;
    const visualTime = pair.intactTime + elapsed;
    drawInterior(ctx, width, height, state, visualTime, reduced, { cartXFactor });
    drawDockSocket(ctx, width, height, state);
    if (showRoute) drawRouteMap(ctx, width, height, state, journey, labels);
    return;
  }

  if (stage === 'hydro') {
    // The intact pump cycle is purely presentational; the historical state stays
    // fixed at stateAt(monthTime), so it cannot advance the film or alter scars.
    const visualTime = pair.intactTime + elapsed;
    drawHydro(ctx, width, height, state, visualTime, reduced, { matchCamera: true });
    return;
  }

  let t = state.t;
  if (isMonthPane && month === 3 && t >= 54 && t < 60) t = 54 + Math.min(elapsed, 4);
  if (stage === 'glass' && isMonthPane && month === 6) {
    if (glassBeat === 'crossing') {
      const crossing = shotAt(84.2);
      drawViewportCrossing(ctx, width, height, state, 84.2, reduced, crossing.progress, crossing.camera);
      return;
    }
    if (glassBeat === 'bloom') {
      drawBloom(ctx, width, height, state, 87, reduced);
      return;
    }
  }
  if (isMonthPane && t >= 86 && t < 88.5) {
    drawBloom(ctx, width, height, state, t, reduced);
  } else if (isMonthPane && t >= 83 && t < 86) {
    const shot = shotAt(t);
    drawViewportCrossing(ctx, width, height, state, t, reduced, shot.progress, shot.camera);
  } else if (isMonthPane && t >= 50 && t < 60) {
    drawViewportLane(ctx, width, height, { ...state, t }, t, reduced);
  } else {
    drawChapel(ctx, width, height, state, t, reduced);
  }
}

function drawCaption(ctx, x, y, text, align = 'left') {
  ctx.save();
  ctx.font = '600 10px ui-monospace, monospace';
  ctx.textAlign = align;
  ctx.fillStyle = 'rgba(225,236,243,0.72)';
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function drawLastShift(ctx, width, height, options) {
  const {
    stage = 'dock', month = 1, layout = 'split', activePane = 'month',
    divider = 0.5, elapsed = 0, reduced = false, showRoute = false,
    labels = false, glassBeat = 'return',
  } = options;
  const pair = lastShiftPair(stage, month, glassBeat);
  ctx.fillStyle = '#02050a';
  ctx.fillRect(0, 0, width, height);

  if (layout === 'toggle') {
    const isMonthPane = activePane === 'month';
    const state = isMonthPane ? pair.historicalState : pair.intactState;
    drawPane(ctx, width, height, state, pair, { ...options, stage, month, elapsed, reduced, showRoute, labels, glassBeat }, isMonthPane);
    return pair;
  }

  const splitX = width * clampShift(divider, 0.25, 0.75);
  const leftWidth = splitX;
  const rightWidth = width - splitX;
  const matchedPaneWidth = Math.min(leftWidth, rightWidth);
  const leftInset = (leftWidth - matchedPaneWidth) / 2;
  const rightInset = (rightWidth - matchedPaneWidth) / 2;
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, leftWidth, height); ctx.clip();
  ctx.translate(leftInset, 0);
  drawPane(ctx, matchedPaneWidth, height, pair.intactState, pair, { ...options, stage, month, elapsed, reduced, showRoute, labels, glassBeat }, false);
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(splitX, 0, rightWidth, height); ctx.clip();
  ctx.translate(splitX + rightInset, 0);
  drawPane(ctx, matchedPaneWidth, height, pair.historicalState, pair, { ...options, stage, month, elapsed, reduced, showRoute, labels, glassBeat }, true);
  ctx.restore();

  // A physical divider, not a camera move: both images keep their local pose.
  ctx.fillStyle = 'rgba(5,10,15,0.88)';
  ctx.fillRect(splitX - 1.5, 0, 3, height);
  ctx.fillStyle = 'rgba(218,232,241,0.82)';
  ctx.fillRect(splitX - 2, height * 0.44, 4, height * 0.12);
  ctx.strokeStyle = 'rgba(121,215,226,0.72)'; ctx.lineWidth = 1;
  ctx.strokeRect(splitX - 7, height * 0.44, 14, height * 0.12);
  if (labels) {
    drawCaption(ctx, width * 0.018, height * 0.96, `INTACT SHIFT · ${pair.intactTime.toFixed(1)}s`);
    drawCaption(ctx, width * 0.982, height * 0.96, `MONTH ${pair.month} · ${pair.historicalTime.toFixed(1)}s`, 'right');
  }
  return pair;
}
