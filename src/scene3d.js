// MERIDIAN STATION — editable, deterministic perspective 3D proxy set.
// All large world dimensions use kilometres (1 world unit = 1 km). Human/Tiger
// meshes are built in metres and scaled into that same world. This is an
// identified substitute scene, not an imported or canon-certified production
// model; see ASSET_RECEIPT.md for source precedence and limits.

import * as THREE from '../vendor/three.module.js';
import { DEBRIS, GEOMETRY, STARS, OBSERVATION_GLASS_TRACK } from './sim.js';
import { authoredPose3d, comparePose3d, orbitPose3d } from './cameras3d.js';

const KM = 1;
const ARM01_ANGLE = 0; // +Z, the authored first-cut sightline
const CHAPEL_ORIGIN_Z = -GEOMETRY.ringDiameterKm / 2;
const CHAPEL_WINDOW_LOCAL_M = -45;
const CHAPEL_WINDOW_Z = CHAPEL_ORIGIN_Z + CHAPEL_WINDOW_LOCAL_M * 0.001;
const TIGER_HEIGHT_M = 2.7432; // Shard-God Visual Canon v1.0 controls over state JSON's 3.05 m.
const WORLD_IDS = Object.freeze({
  ring: 'proxy.station.ring.geometry-v002',
  arms: 'proxy.station.fixed-radial-arms.geometry-v002',
  chapel: 'proxy.chapel.shell-v003',
  survivor: 'proxy.survivor.anonymous-face-hands',
  mara: 'proxy.crew.mara.approved-ref-silhouette',
  rin: 'proxy.crew.rin.approved-ref-silhouette',
  tiger: 'proxy.tiger.visual-canon-v1-silhouette',
  virgil: 'proxy.virgil.band-sphere',
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const radians = (degrees) => degrees * Math.PI / 180;
const vec3 = (point) => new THREE.Vector3(point[0], point[1], point[2]);
const anglePoint = (radius, angle, y = 0) => new THREE.Vector3(Math.sin(angle) * radius, y, Math.cos(angle) * radius);

function material(color, options = {}) {
  const emissive = options.emissive || 0x000000;
  return new THREE.MeshStandardMaterial({
    color,
    metalness: options.metalness ?? 0.55,
    roughness: options.roughness ?? 0.58,
    emissive,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
    flatShading: options.flatShading ?? false,
  });
}

function addMesh(parent, geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], name = '') {
  const result = new THREE.Mesh(geometry, mat);
  result.position.set(position[0], position[1], position[2]);
  result.rotation.set(rotation[0], rotation[1], rotation[2]);
  result.name = name;
  parent.add(result);
  return result;
}

function addBox(parent, size, mat, position, rotation = [0, 0, 0], name = '') {
  return addMesh(parent, new THREE.BoxGeometry(size[0], size[1], size[2]), mat, position, rotation, name);
}

function addSegment(parent, from, to, radius, mat, radialSegments = 8, name = '') {
  const a = Array.isArray(from) ? vec3(from) : from.clone();
  const b = Array.isArray(to) ? vec3(to) : to.clone();
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(delta.length(), 0.000001);
  const item = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.86, radius, length, radialSegments, 1), mat);
  item.position.copy(a).add(b).multiplyScalar(0.5);
  item.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  item.name = name;
  parent.add(item);
  return item;
}

function addTube(parent, points, radius, mat, tubularSegments = 24, radialSegments = 6, closed = false, name = '') {
  const curvePoints = points.map((point) => Array.isArray(point) ? vec3(point) : point.clone());
  const curve = new THREE.CatmullRomCurve3(curvePoints, closed, 'centripetal');
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed), mat);
  tube.name = name;
  parent.add(tube);
  return tube;
}

function arcPoints(radius, startAngle, endAngle, y, samples = 18) {
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const angle = startAngle + (endAngle - startAngle) * i / samples;
    points.push(anglePoint(radius, angle, y));
  }
  return points;
}

function makeAnnulusSectorGeometry(innerRadius, outerRadius, startAngle, endAngle, halfHeight, steps = 10) {
  const positions = [];
  const pushTriangle = (a, b, c) => positions.push(...a, ...b, ...c);
  const pushQuad = (a, b, c, d, reverse = false) => {
    if (reverse) { pushTriangle(a, c, b); pushTriangle(a, d, c); }
    else { pushTriangle(a, b, c); pushTriangle(a, c, d); }
  };
  const point = (radius, angle, y) => [Math.sin(angle) * radius, y, Math.cos(angle) * radius];

  for (let i = 0; i < steps; i++) {
    const a0 = startAngle + (endAngle - startAngle) * i / steps;
    const a1 = startAngle + (endAngle - startAngle) * (i + 1) / steps;
    // Top and underside of the annular hull band.
    pushQuad(point(innerRadius, a0, halfHeight), point(outerRadius, a0, halfHeight), point(outerRadius, a1, halfHeight), point(innerRadius, a1, halfHeight));
    pushQuad(point(innerRadius, a0, -halfHeight), point(innerRadius, a1, -halfHeight), point(outerRadius, a1, -halfHeight), point(outerRadius, a0, -halfHeight));
    // Inner and outer cylindrical walls.
    pushQuad(point(outerRadius, a0, -halfHeight), point(outerRadius, a1, -halfHeight), point(outerRadius, a1, halfHeight), point(outerRadius, a0, halfHeight));
    pushQuad(point(innerRadius, a0, -halfHeight), point(innerRadius, a0, halfHeight), point(innerRadius, a1, halfHeight), point(innerRadius, a1, -halfHeight));
  }
  // Radial end caps close every individually editable sector.
  pushQuad(point(innerRadius, startAngle, -halfHeight), point(outerRadius, startAngle, -halfHeight), point(outerRadius, startAngle, halfHeight), point(innerRadius, startAngle, halfHeight));
  pushQuad(point(innerRadius, endAngle, -halfHeight), point(innerRadius, endAngle, halfHeight), point(outerRadius, endAngle, halfHeight), point(outerRadius, endAngle, -halfHeight));

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeBandTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const bands = [
    ['#384858', 0.08], ['#8194a5', 0.045], ['#5e7285', 0.07], ['#a4b3c0', 0.028],
    ['#4a5d70', 0.12], ['#9aabba', 0.05], ['#566a7e', 0.10], ['#c0c9d0', 0.032],
    ['#445668', 0.09], ['#93a3b1', 0.06], ['#536779', 0.11], ['#b0bcc6', 0.038],
  ];
  let y = 0;
  for (let i = 0; i < bands.length; i++) {
    const [color, fraction] = bands[i];
    const bandHeight = canvas.height * fraction;
    const gradient = ctx.createLinearGradient(0, y, 0, y + bandHeight);
    gradient.addColorStop(0, i % 2 ? '#334456' : color);
    gradient.addColorStop(0.38, color);
    gradient.addColorStop(1, i % 2 ? color : '#2e3d4e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, y, canvas.width, bandHeight + 1);
    ctx.strokeStyle = 'rgba(220,232,241,0.10)';
    ctx.lineWidth = 2 + (i % 3);
    ctx.beginPath();
    const drift = (i % 2 ? 1 : -1) * (8 + i * 1.7);
    ctx.moveTo(0, y + bandHeight * 0.7);
    ctx.bezierCurveTo(canvas.width * 0.28, y + bandHeight * 0.5 + drift, canvas.width * 0.72, y + bandHeight * 0.86 - drift, canvas.width, y + bandHeight * 0.62);
    ctx.stroke();
    y += bandHeight;
  }
  // The storm is a pale, soft atmospheric oval, not a terrestrial continent.
  ctx.save();
  ctx.translate(670, 278);
  ctx.rotate(-0.14);
  const storm = ctx.createRadialGradient(0, 0, 12, 0, 0, 96);
  storm.addColorStop(0, 'rgba(218,227,233,.38)');
  storm.addColorStop(0.46, 'rgba(162,180,195,.22)');
  storm.addColorStop(1, 'rgba(128,151,171,0)');
  ctx.fillStyle = storm;
  ctx.beginPath();
  ctx.ellipse(0, 0, 150, 45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function createStars(scene) {
  const positions = [];
  const colors = [];
  const seeded = [...STARS, ...DEBRIS].slice(0, 360);
  for (let index = 0; index < seeded.length; index++) {
    const star = seeded[index];
    const u = (star.x ?? 0.5) * Math.PI * 2;
    const v = (star.y ?? 0.5) * Math.PI;
    const radius = 64 + ((index * 17) % 51);
    positions.push(Math.cos(u) * Math.sin(v) * radius, Math.cos(v) * radius, Math.sin(u) * Math.sin(v) * radius);
    const tint = index % 11 === 0 ? [0.56, 0.77, 0.92] : [0.72, 0.81, 0.9];
    colors.push(...tint);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.025, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.82, depthWrite: false }));
  stars.name = 'proxy.starfield.seed-8700';
  scene.add(stars);
  return stars;
}

function createVirgil(scene, materials) {
  const radius = 7.7; // visual scale placeholder; no planetary radius is canon-locked here.
  const geometry = new THREE.SphereGeometry(radius, 64, 48);
  const texture = makeBandTexture();
  const bodyMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0.03 });
  const planet = addMesh(scene, geometry, bodyMaterial, [0, -9.2, -16.2], [0, 0, 0], 'Virgil · procedural blue-gray gas giant proxy');
  planet.userData.proxyId = WORLD_IDS.virgil;
  planet.rotation.z = -0.08;
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.016, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x7598b8, transparent: true, opacity: 0.075, side: THREE.BackSide, depthWrite: false }),
  );
  atmosphere.position.copy(planet.position);
  atmosphere.name = 'proxy.virgil.limb-atmosphere';
  scene.add(atmosphere);
  materials.planet = bodyMaterial;
  materials.atmosphere = atmosphere.material;
  return { planet, atmosphere };
}

function addSmallPanel(parent, position, size, mat, rotationY = 0) {
  const panel = addBox(parent, size, mat, position, [0, rotationY, 0]);
  return panel;
}

function createDockArm(parent, angle, index, mats) {
  const root = new THREE.Group();
  root.name = `Docking arm ${String(index + 1).padStart(2, '0')}`;
  root.userData.proxyId = `proxy.station.docking-arm-${String(index + 1).padStart(2, '0')}`;
  const radius = GEOMETRY.ringDiameterKm / 2;
  root.position.copy(anglePoint(radius, angle));
  root.rotation.y = angle;
  const moving = new THREE.Group();
  moving.name = `comp.arm${String(index + 1).padStart(2, '0')}`;
  moving.userData.proxyId = `structure.docking.arm${String(index + 1).padStart(2, '0')}`;
  root.add(moving);

  addBox(moving, [0.31, 0.20, 1.05], mats.armCore, [0, 0, 0.68], [0, 0, 0], `${moving.userData.proxyId}.keel`);
  addBox(moving, [0.37, 0.055, 0.96], mats.armPanel, [0, 0.115, 0.68]);
  addBox(moving, [0.38, 0.055, 0.96], mats.armPanel, [0, -0.115, 0.68]);
  for (const x of [-0.18, 0.18]) {
    addSegment(moving, [x, -0.12, 0.10], [x, 0.12, 1.12], 0.034, mats.edge, 7);
    addSegment(moving, [x, 0.12, 0.10], [x, -0.12, 1.12], 0.034, mats.hull);
    addBox(moving, [0.035, 0.24, 0.035], mats.edge, [x, 0, 0.10]);
    addBox(moving, [0.035, 0.24, 0.035], mats.edge, [x, 0, 1.12]);
  }
  for (const z of [0.29, 0.60, 0.91]) {
    addBox(moving, [0.4, 0.028, 0.05], mats.dark, [0, 0, z]);
  }
  addBox(moving, [0.45, 0.34, 0.25], mats.hull, [0, 0, 1.19]);
  const endCollar = addMesh(moving, new THREE.TorusGeometry(0.21, 0.035, 8, 18), mats.edge, [0, 0, 1.34], [0, 0, 0], `${moving.userData.proxyId}.end-collar`);
  endCollar.rotation.x = 0;
  addMesh(moving, new THREE.CircleGeometry(0.16, 20), mats.socketDark, [0, 0, 1.335], [0, 0, 0]);
  addBox(moving, [0.21, 0.14, 0.11], mats.dark, [0, 0.19, 0.57]);
  for (let light = 0; light < 3; light++) {
    addMesh(moving, new THREE.SphereGeometry(0.028, 8, 6), mats.markerLight, [0, 0.16, 0.40 + light * 0.20]);
  }
  parent.add(root);
  return { root, moving, angle };
}

function createSocket(parent, angle, mats, index) {
  const socketRoot = new THREE.Group();
  socketRoot.position.copy(anglePoint(GEOMETRY.ringDiameterKm / 2, angle));
  socketRoot.rotation.y = angle;
  socketRoot.name = `Empty-capable socket ${String(index + 1).padStart(2, '0')}`;
  socketRoot.userData.proxyId = `proxy.station.socket-${String(index + 1).padStart(2, '0')}`;
  const collarMaterial = index === 0 ? mats.cutEmissive : mats.socketRim;
  const collar = addMesh(socketRoot, new THREE.TorusGeometry(0.30, 0.055, 10, 24), collarMaterial, [0, 0, 0.04], [0, 0, 0]);
  collar.name = `socket.rim.${String(index + 1).padStart(2, '0')}`;
  addMesh(socketRoot, new THREE.CircleGeometry(0.245, 24), mats.socketDark, [0, 0, 0.039]);
  addMesh(socketRoot, new THREE.TorusGeometry(0.17, 0.014, 6, 24), mats.socketInner, [0, 0, 0.055]);
  for (let bolt = 0; bolt < 8; bolt++) {
    const a = bolt * Math.PI / 4;
    addMesh(socketRoot, new THREE.SphereGeometry(0.018, 6, 4), mats.edge, [Math.sin(a) * 0.26, Math.cos(a) * 0.26, 0.08]);
  }
  parent.add(socketRoot);
  return { root: socketRoot, collar };
}

function createStation(scene, mats) {
  const station = new THREE.Group();
  station.name = 'Meridian · geometry lock v002 editable proxy';
  station.userData.proxyId = WORLD_IDS.ring;
  scene.add(station);

  const ringRadius = GEOMETRY.ringDiameterKm / 2;
  const ringInnerRadius = ringRadius - GEOMETRY.ringRadialThicknessKm;
  const halfDepth = 0.055; // 110 m axial depth is an editable proxy, not part of the radial-dimension lock.
  const ringSegments = [];
  for (let index = 0; index < 12; index++) {
    const start = index * Math.PI / 6 - Math.PI / 12;
    const end = start + Math.PI / 6;
    const segment = new THREE.Group();
    segment.name = `Outer transit ring sector ${String(index + 1).padStart(2, '0')}`;
    segment.userData.proxyId = index === 2 ? 'comp.segment02' : `proxy.station.ring.sector-${String(index + 1).padStart(2, '0')}`;
    const surface = addMesh(segment, makeAnnulusSectorGeometry(ringInnerRadius, ringRadius, start, end, halfDepth, 12), index === 2 ? mats.segment02 : mats.ring, [0, 0, 0], [0, 0, 0], segment.userData.proxyId);
    surface.material.side = THREE.DoubleSide;
    addTube(segment, arcPoints(ringRadius - 0.025, start, end, halfDepth + 0.015, 16), 0.024, mats.edge, 32, 6, false, `${segment.userData.proxyId}.outer-rib`);
    addTube(segment, arcPoints(ringInnerRadius + 0.025, start, end, halfDepth + 0.015, 16), 0.022, mats.edge, 32, 6, false, `${segment.userData.proxyId}.inner-rib`);
    const middle = (start + end) / 2;
    const pOuter = anglePoint(ringRadius - 0.04, middle, halfDepth + 0.02);
    const pInner = anglePoint(ringInnerRadius + 0.04, middle, halfDepth + 0.02);
    addSegment(segment, pInner, pOuter, 0.025, mats.dark, 6);
    for (let rib = 1; rib <= 4; rib++) {
      const radius = ringInnerRadius + GEOMETRY.ringRadialThicknessKm * rib / 5;
      const point = anglePoint(radius, middle, halfDepth + 0.033);
      addBox(segment, [0.055, 0.018, 0.24], mats.panel, [point.x, point.y, point.z], [0, middle, 0]);
    }
    station.add(segment);
    ringSegments.push(segment);
  }
  station.userData.ringSegments = ringSegments;

  // Twelve fixed structural spokes remain beneath the replaceable outer arm ring.
  const hub = addMesh(station, new THREE.CylinderGeometry(0.42, 0.55, 0.30, 18), mats.hull, [0, 0, 0], [0, 0, 0], 'central hub');
  hub.userData.proxyId = 'proxy.station.central-hub';
  const spokes = new THREE.Group();
  spokes.name = 'Twelve radial spine trusses';
  spokes.userData.proxyId = 'proxy.station.twelve-radial-trusses';
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const tip = anglePoint(ringInnerRadius, angle, 0);
    addSegment(spokes, [0, 0, 0], tip, 0.055, mats.edge, 8, `fixed-radial-truss-${index + 1}`);
    addSegment(spokes, [0, 0.09, 0], [tip.x, 0.09, tip.z], 0.021, mats.hull, 6);
    addSegment(spokes, [0, -0.09, 0], [tip.x, -0.09, tip.z], 0.021, mats.hull, 6);
    addBox(spokes, [0.12, 0.12, 0.10], mats.panel, [tip.x * 0.66, 0.08, tip.z * 0.66], [0, angle, 0]);
  }
  station.add(spokes);

  // The explicit kilometre-scale axis is part of the locked geometry silhouette.
  const upperSpire = addMesh(station, new THREE.CylinderGeometry(0.055, 0.19, GEOMETRY.spireAboveRingKm, 12, 1), mats.spire, [0, GEOMETRY.spireAboveRingKm / 2, 0], [0, 0, 0], 'upper spire · 10.4 km');
  upperSpire.userData.proxyId = 'proxy.station.spire.upper-10.4km';
  const lowerSpine = addMesh(station, new THREE.CylinderGeometry(0.13, 0.22, GEOMETRY.spineBelowRingKm, 12, 1), mats.spire, [0, -GEOMETRY.spineBelowRingKm / 2, 0], [0, 0, 0], 'lower spine · 6.9 km');
  lowerSpine.userData.proxyId = 'proxy.station.spine.lower-6.9km';
  for (const y of [1.1, 2.25, 4.0, 6.0, 8.1, 9.7]) {
    const taper = 0.22 * (1 - y / 11);
    addMesh(station, new THREE.CylinderGeometry(taper * 0.34, taper, 0.06, 12), mats.edge, [0, y, 0]);
  }
  for (const y of [-1.0, -2.4, -4.0, -5.7, -6.6]) {
    const taper = 0.21 * (1 - Math.abs(y) / 8);
    addMesh(station, new THREE.CylinderGeometry(taper, taper * 0.45, 0.055, 12), mats.edge, [0, y, 0]);
  }
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    const top = anglePoint(2.65, angle, 0.35);
    const bottom = anglePoint(2.65, angle, -0.35);
    addSegment(station, [0, 0.25, 0], top, 0.035, mats.edge, 6);
    addSegment(station, [0, -0.25, 0], bottom, 0.035, mats.edge, 6);
  }

  const arms = [];
  const sockets = [];
  for (let index = 0; index < 12; index++) {
    const angle = index * Math.PI / 6;
    arms.push(createDockArm(station, angle, index, mats));
    sockets.push(createSocket(station, angle, mats, index));
  }

  // Rail rings and segmented panel lamps add volume without altering the scale lock.
  for (const radius of [ringInnerRadius + 0.08, ringInnerRadius + 0.33, ringRadius - 0.08]) {
    addTube(station, arcPoints(radius, 0, Math.PI * 2, 0.066, 160), 0.018, mats.edge, 260, 5, false, `ring continuous service rail ${radius.toFixed(2)}`);
  }
  const lights = [];
  for (let index = 0; index < 24; index++) {
    const angle = index * Math.PI / 12;
    const position = anglePoint(ringRadius - 0.12, angle, 0.09);
    const lamp = addMesh(station, new THREE.BoxGeometry(0.11, 0.035, 0.16), mats.lamp, [position.x, position.y, position.z], [0, angle, 0]);
    lights.push(lamp);
  }

  // The hydroponic spine is a persistent module attached to the lower station axis.
  const hydro = createHydroModule(scene, mats);
  // The Chapel shares the same world coordinate system and the three locked radial bays.
  const chapel = createChapel(scene, mats);
  const dockHall = createDockHall(scene, mats);
  const landmarks = createLandmarks(scene, mats);
  const tiger = createTiger(scene, mats);

  const socketCut = sockets[0].collar;
  return {
    station, ringSegments, arms, sockets, socketCut, hydro, chapel, dockHall, landmarks, tiger, lights,
    update(state, time, reduced = false) {
      // Arm 01 peels, separates and coasts in the same fixed station frame.
      const arm01 = arms[0];
      const attached = state.arm01.phase === 'intact';
      const detached = ['detached', 'transit', 'placed'].includes(state.arm01.phase);
      const peel = state.arm01.peel;
      const drift = state.arm01.drift;
      const separation = attached ? 0.01 * peel : detached ? 0.075 + drift * 0.72 : 0.01;
      const radial = anglePoint(1, arm01.angle);
      arm01.root.position.set(radial.x * GEOMETRY.ringDiameterKm / 2 + radial.x * separation, radial.y, radial.z * GEOMETRY.ringDiameterKm / 2 + radial.z * separation);
      arm01.moving.rotation.x = peel * 0.035 + (detached ? Math.sin(time * 0.23) * 0.005 : 0);
      arm01.moving.rotation.z = peel * 0.018;
      arm01.root.visible = true; // released hardware remains present; it never respawns.
      sockets[0].root.visible = true;
      mats.cutEmissive.emissiveIntensity = attached ? 0 : (reduced ? 0.34 : 0.48 + 0.2 * Math.sin(time * 2.2));

      // Sector 03 is the editable visual counterpart of persistent comp.segment02.
      const segment = ringSegments[2];
      const segmentPhase = state.segment02.phase;
      const segmentIndexAngle = 2 * Math.PI / 6;
      const segmentRadial = anglePoint(1, segmentIndexAngle);
      const segmentDrift = state.segment02.drift;
      const segmentPeel = state.segment02.peel;
      const segmentGap = segmentPhase === 'intact' ? 0 : (segmentPhase === 'peeling' ? segmentPeel * 0.10 : 0.10 + segmentDrift * 1.85);
      segment.position.set(segmentRadial.x * segmentGap, 0, segmentRadial.z * segmentGap);
      segment.rotation.y = segmentPhase === 'intact' ? 0 : segmentPeel * 0.025 + segmentDrift * 0.075;
      mats.segment02.emissiveIntensity = segmentPhase === 'intact' ? 0 : (segmentPhase === 'peeling' ? 0.12 + segmentPeel * 0.18 : 0.12);

      // The six-month damage state is monotonic; the same hydro module leaves its socket.
      this.hydro.update(state, time);
      this.chapel.update(state, time);
      this.dockHall.update(state, time);
      this.landmarks.update(state, time);
      this.tiger.update(state, time);
      for (const lamp of lights) {
        lamp.material = state.lights.relayPrimary ? mats.lamp : mats.lampDark;
      }
      mats.relayPanel.emissiveIntensity = state.lights.relayPrimary ? 0.38 : 0.025;
      mats.hull.emissiveIntensity = state.month >= 4 ? 0.02 : 0.005;
    },
  };
}

function createDockHall(scene, mats) {
  const root = new THREE.Group();
  root.name = 'Dock / transit passage · same radial arm 01 volume';
  root.position.set(0, 0, GEOMETRY.ringDiameterKm / 2);
  root.userData.proxyId = 'proxy.interior.dock-terminal';
  const shell = new THREE.Group();
  shell.scale.setScalar(0.001);
  root.add(shell);
  addBox(shell, [160, 115, 1150], mats.interior, [0, 0, 575]);
  addBox(shell, [156, 5, 1140], mats.floor, [0, -56, 575]);
  addBox(shell, [156, 4, 1140], mats.ceiling, [0, 56, 575]);
  addBox(shell, [5, 108, 1140], mats.wall, [-78, 0, 575]);
  addBox(shell, [5, 108, 1140], mats.wall, [78, 0, 575]);
  for (let z = 70; z <= 1120; z += 130) {
    for (const x of [-71, 71]) {
      addSegment(shell, [x, -48, z], [x, 48, z], 4, mats.edge, 6);
      addSegment(shell, [x, 48, z], [-x, 48, z + 10], 3, mats.edge, 6);
    }
    addBox(shell, [160, 4, 5], mats.edge, [0, 46, z]);
    addBox(shell, [160, 4, 5], mats.dark, [0, -46, z]);
  }
  for (let pipe = 0; pipe < 4; pipe++) {
    const x = -42 + pipe * 28;
    addSegment(shell, [x, 38, 24], [x, 38, 1120], 2.6, pipe % 2 ? mats.pipeWarm : mats.pipeCool, 7);
  }
  for (const side of [-1, 1]) {
    for (let index = 0; index < 10; index++) {
      const z = 140 + index * 98;
      addBox(shell, [5, 25, 42], mats.panel, [side * 75, -9, z]);
      addBox(shell, [2, 8, 24], mats.relayPanel, [side * 70, 4, z]);
    }
  }
  const seal = new THREE.Group();
  seal.position.set(0, 0, 1020);
  addBox(seal, [145, 104, 9], mats.door, [0, 0, 0]);
  addMesh(seal, new THREE.CircleGeometry(37, 32), mats.dark, [0, 0, 5]);
  for (let ring = 0; ring < 3; ring++) addMesh(seal, new THREE.TorusGeometry(32 - ring * 10, 1.4, 6, 32), mats.edge, [0, 0, 5 + ring * 0.2]);
  shell.add(seal);
  root.userData.seal = seal;
  scene.add(root);
  return {
    root,
    update(state) {
      const closed = state.doors.transitSealClosed;
      seal.rotation.y = closed ? 0 : 0.06;
      seal.visible = true;
      mats.door.emissiveIntensity = closed ? 0.18 : 0.05;
      root.userData.pressureEdge = state.pressure.dockIsolation;
    },
  };
}

function createHydroModule(scene, mats) {
  const root = new THREE.Group();
  root.name = 'Hydroponic spine module · persistent comp.hydro_rack';
  root.userData.proxyId = 'comp.hydro_rack';
  root.scale.setScalar(0.001);
  root.position.set(0, -3.33, 0);
  const shell = new THREE.Group();
  root.add(shell);

  const width = 170, height = 112, length = 300;
  addBox(shell, [width, 4, length], mats.hydroFloor, [0, -height / 2, 0]);
  addBox(shell, [width, 4, length], mats.hydroCeiling, [0, height / 2, 0]);
  addBox(shell, [5, height, length], mats.hydroWall, [-width / 2, 0, 0]);
  addBox(shell, [5, height, length], mats.hydroWall, [width / 2, 0, 0]);
  // A closed pressure panel at the forward end remains behind the opening camera.
  addBox(shell, [width, height, 5], mats.hydroWall, [0, 0, length / 2]);
  const rearHatch = new THREE.Group();
  rearHatch.position.set(0, 0, -length / 2 + 5);
  addBox(rearHatch, [width * 0.56, height * 0.72, 5], mats.door, [0, 0, 0]);
  addBox(rearHatch, [width * 0.32, height * 0.46, 0.8], mats.dark, [0, 0, 3]);
  shell.add(rearHatch);

  // Glazed pressure ribs and service piping stay attached to the same rack.
  for (const x of [-75, -25, 25, 75]) {
    addSegment(shell, [x, -50, -140], [x, 50, -140], 2.6, mats.edge, 6);
    addSegment(shell, [x, -50, 140], [x, 50, 140], 2.6, mats.edge, 6);
    addSegment(shell, [x, 50, -140], [x, 50, 140], 2.6, mats.edge, 6);
  }
  for (let row = 0; row < 4; row++) {
    const x = -55 + row * 36;
    addBox(shell, [22, 6, 205], mats.plantRack, [x, -24 + (row % 2) * 14, -6]);
    addSegment(shell, [x, -22 + (row % 2) * 14, -105], [x, -22 + (row % 2) * 14, 100], 1.7, mats.pipeCool, 6);
    for (let plant = 0; plant < 11; plant++) {
      const z = -94 + plant * 18;
      const y = -18 + (row % 2) * 14;
      const stem = addSegment(shell, [x, y, z], [x, y + 4.5, z + 2], 0.35, mats.plantStem, 5);
      stem.userData.plant = true;
      for (const side of [-1, 1]) {
        const leaf = addMesh(shell, new THREE.SphereGeometry(2, 7, 5), mats.plant, [x + side * 1.3, y + 3, z + 1], [0, 0, side * 0.5]);
        leaf.scale.set(0.45, 1.25, 0.28);
        leaf.userData.plant = true;
      }
    }
  }
  // Pump, pressure rim and external recovery fins are visible from the same world.
  addBox(shell, [48, 36, 20], mats.dark, [0, -31, 132]);
  addBox(shell, [34, 20, 2], mats.pump, [0, -24, 144]);
  addBox(shell, [185, 2, 3], mats.edge, [0, -54, 0]);
  const transparentHull = new THREE.Mesh(
    new THREE.BoxGeometry(width - 10, height - 10, length - 10),
    material(0x668c91, { roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.035, side: THREE.DoubleSide, depthWrite: false }),
  );
  shell.add(transparentHull);
  transparentHull.name = 'proxy.hydroponics.transparent-pressure-shell';
  scene.add(root);

  const base = new THREE.Vector3(0, -3.33, 0);
  const destinationAngle = (7 * Math.PI / 6);
  return {
    root, shell, rearHatch, base,
    update(state, time) {
      const phase = state.hydroRack.phase;
      const rupture = state.hydroRack.rupture;
      const drift = state.hydroRack.drift;
      if (['tended', 'rupturing'].includes(phase)) root.position.copy(base);
      else if (phase === 'placed') root.position.copy(anglePoint(5.25, destinationAngle, -0.2));
      else root.position.set(base.x + drift * 0.65, base.y - drift * 2.0, base.z + drift * 0.3);
      rearHatch.rotation.x = state.doors.hydroFarOpen ? -1.15 : -rupture * 0.62;
      rearHatch.position.z = -length / 2 + 5 - (state.doors.hydroFarOpen ? 45 : rupture * 12);
      root.userData.farDoorOpen = state.doors.hydroFarOpen;
      mats.plant.color.set(rupture > 0.5 ? 0x68766b : 0x4c6e54);
      mats.plantStem.color.set(rupture > 0.5 ? 0x777d70 : 0x6f8b5d);
      mats.plant.emissiveIntensity = rupture > 0 ? 0.015 : 0.04;
      mats.pump.emissiveIntensity = state.lights.hydroPumps ? 0.30 : 0.012;
      transparentHull.visible = phase === 'tended' || phase === 'rupturing';
      root.userData.phase = phase;
      root.userData.cutFraction = rupture;
      root.userData.animationTime = time;
    },
  };
}

function createChapel(scene, mats) {
  const root = new THREE.Group();
  root.name = 'Observation Chapel · shell v003 editable proxy';
  root.position.set(0, 0, CHAPEL_ORIGIN_Z);
  root.userData.proxyId = WORLD_IDS.chapel;
  root.userData.glassId = OBSERVATION_GLASS_TRACK.glassId;
  root.scale.setScalar(0.001); // all local construction dimensions below are metres.

  // Room volume is a shared physical set, not a different background illustration.
  // The shell scale and dimensions are editable construction proxies, not a measured source model.
  const floor = addBox(root, [7.6, 0.05, 49], mats.floor, [0, 0, -22]);
  floor.name = 'proxy.chapel.floor';
  addBox(root, [7.6, 0.05, 49], mats.ceiling, [0, 3.01, -22]);
  addBox(root, [0.018, 3.01, 49], mats.wall, [-3.70, 1.505, -22]);
  addBox(root, [0.018, 3.01, 49], mats.wall, [3.70, 1.505, -22]);
  addBox(root, [7.4, 3.01, 0.07], mats.wall, [0, 1.505, 0]);
  addBox(root, [7.2, 0.005, 0.012], mats.edge, [0, 0.008, -22]);
  addBox(root, [7.2, 0.008, 0.008], mats.edge, [0, 2.994, -22]);
  for (const x of [-3.45, 3.45]) {
    addBox(root, [0.020, 3.05, 0.014], mats.edge, [x, 1.50, -44]);
  }
  // The three explicitly canted two-pane bays: six individual pressure panes.
  const bayCenters = [-2.35, 0, 2.35];
  const panes = [];
  for (let bay = 0; bay < bayCenters.length; bay++) {
    const center = bayCenters[bay];
    const cant = (bay - 1) * 0.105;
    for (let pane = 0; pane < 2; pane++) {
      const x = center + (pane === 0 ? -0.54 : 0.54);
      const glass = addBox(root, [1.04, 2.18, 0.005], mats.glass, [x, 1.51, -45], [0, cant, 0], `Chapel bay ${bay + 1} pane ${pane + 1}`);
      glass.userData.proxyId = `proxy.chapel.bay-${bay + 1}.pane-${pane + 1}`;
      panes.push(glass);
    }
    addBox(root, [0.014, 2.285, 0.020], mats.windowFrame, [center, 1.51, -45], [0, cant, 0]);
    addBox(root, [2.32, 0.020, 0.021], mats.windowFrame, [center, 2.68, -45], [0, cant, 0]);
    addBox(root, [2.32, 0.020, 0.021], mats.windowFrame, [center, 0.34, -45], [0, cant, 0]);
    addSegment(root, [center - 1.08, 0.40, -45], [center - 1.08, 2.62, -45], 0.008, mats.edge, 6);
    addSegment(root, [center + 1.08, 0.40, -45], [center + 1.08, 2.62, -45], 0.008, mats.edge, 6);
  }
  addBox(root, [0.026, 2.20, 0.024], mats.edge, [-3.53, 1.51, -45]);
  addBox(root, [0.026, 2.20, 0.024], mats.edge, [3.53, 1.51, -45]);
  // Structural ceiling ribs and a restrained six-point console, all part of this shell.
  for (let rib = 0; rib < 7; rib++) {
    const x = -3.0 + rib * 1.0;
    addSegment(root, [x, 2.86, -0.006], [x, 2.86, -0.044], 0.009, mats.edge, 7);
  }
  const console = new THREE.Group();
  console.position.set(0, 0, -13);
  addBox(console, [2.8, 0.68, 0.76], mats.dark, [1.30, 0.76, 0]);
  for (let light = 0; light < 6; light++) {
    addMesh(console, new THREE.SphereGeometry(0.009, 7, 5), light % 2 ? mats.lamp : mats.lampWarm, [0.35 + light * 0.038, 0.805, -0.04]);
  }
  root.add(console);
  const ceilingScar = addBox(root, [0.85, 0.08, 0.55], mats.dark, [-2.60, 2.92, -17]);
  const consoleScar = addBox(console, [0.78, 0.12, 0.30], mats.dark, [2.25, 0.793, 0.014]);
  root.userData.console = console;
  root.userData.ceilingScar = ceilingScar;
  root.userData.consoleScar = consoleScar;
  root.userData.panes = panes;
  scene.add(root);

  const survivor = createSurvivor(scene, mats);
  const mara = createCrewProxy(scene, mats, 'Mara', 'mara');
  const rin = createCrewProxy(scene, mats, 'Rin', 'rin');
  const returnLane = new THREE.Group();
  returnLane.name = 'Mara / Rin shared Observation Glass track';
  returnLane.userData.trackId = OBSERVATION_GLASS_TRACK.id;
  returnLane.userData.glassId = OBSERVATION_GLASS_TRACK.glassId;
  returnLane.userData.laneId = OBSERVATION_GLASS_TRACK.laneId;
  scene.add(returnLane);
  returnLane.add(mara.group, rin.group);
  return {
    root, survivor, mara, rin, returnLane,
    update(state, time) {
      const crossing = state.actors.glassCrossing;
      const passage = state.actors.survivor.handsOnGlass ? smooth((time - 79.55) / 0.45) : 0;
      survivor.update(state, passage);
      if (crossing) {
        mara.group.visible = true;
        rin.group.visible = true;
        const laneY = 0.00055 + crossing.mara.y * 0.00050;
        const outsideGlass = CHAPEL_WINDOW_Z - 0.010;
        mara.group.position.set(crossing.mara.x * 0.00120, laneY, outsideGlass);
        rin.group.position.set(crossing.rin.x * 0.00120, laneY, outsideGlass - 0.0002);
        mara.group.rotation.y = Math.PI;
        rin.group.rotation.y = Math.PI;
        rin.tool.userData.ownerId = crossing.wrench.ownerId;
      } else {
        mara.group.visible = false;
        rin.group.visible = false;
      }
      const monthSix = state.month >= 6;
      ceilingScar.visible = monthSix;
      consoleScar.visible = monthSix;
      root.userData.paneCount = panes.length;
      root.userData.cameraTime = time;
      mats.glass.emissiveIntensity = state.month >= 6 ? 0.055 : 0.025;
    },
  };
}

function createSurvivor(scene, mats) {
  const group = new THREE.Group();
  group.name = 'Survivor · anonymous editable proxy, not an approved likeness';
  group.userData.proxyId = WORLD_IDS.survivor;
  const survivorLocalZ = CHAPEL_WINDOW_LOCAL_M + 2;
  group.position.set(-0.00025, 0, CHAPEL_ORIGIN_Z + survivorLocalZ * 0.001);
  group.scale.setScalar(0.001);
  scene.add(group);
  const suit = mats.survivorSuit;
  addBox(group, [0.40, 0.60, 0.26], suit, [0, 0.91, 0]);
  addBox(group, [0.46, 0.20, 0.27], mats.survivorSuitLight, [0, 0.59, 0]);
  addBox(group, [0.25, 0.12, 0.25], mats.survivorSuitLight, [0, 1.25, 0]);
  addMesh(group, new THREE.SphereGeometry(0.126, 18, 14), mats.skin, [0, 1.515, 0.015]);
  // Head is turned slightly back toward the room: eyes and the pressed hands share the shot.
  addMesh(group, new THREE.SphereGeometry(0.132, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), mats.hair, [0, 1.56, 0.0]);
  for (const side of [-1, 1]) {
    addMesh(group, new THREE.SphereGeometry(0.016, 7, 5), mats.faceDark, [side * 0.045, 1.535, 0.132]);
    addBox(group, [0.037, 0.009, 0.008], mats.faceDark, [side * 0.045, 1.56, 0.134]);
  }
  addSegment(group, [0, 1.53, 0.13], [0, 1.49, 0.15], 0.009, mats.skinShadow, 5);
  addTube(group, [[-0.038, 1.458, 0.13], [-0.018, 1.45, 0.138], [0.012, 1.45, 0.138], [0.036, 1.46, 0.13]], 0.006, mats.faceDark, 8, 4, false, 'survivor.closed-mouth line');
  // The face, suit and both hands are intentionally anonymous proxy geometry.
  const arms = [-1, 1].map((side) => ({
    side,
    upper: addSegment(group, [0, 0, 0], [0, 1, 0], 0.055, suit, 8),
    fore: addSegment(group, [0, 0, 0], [0, 1, 0], 0.043, suit, 8),
    palm: addBox(group, [0.15, 0.13, 0.035], mats.skin, [0, 0, 0]),
    fingers: [],
  }));
  for (const arm of arms) {
    for (let finger = 0; finger < 5; finger++) {
      const offset = (finger - 2) * 0.024;
      const length = finger === 0 || finger === 4 ? 0.085 : 0.118;
      arm.fingers.push(addSegment(group, [0, 0, 0], [0, 1, 0], 0.0105, mats.skin, 5, `survivor.hand-${arm.side}.${finger}`));
      arm.fingers.at(-1).userData.offset = offset;
      arm.fingers.at(-1).userData.length = length;
    }
  }
  addBox(group, [0.08, 0.07, 0.02], mats.survivorSuitLight, [0.24, 0.92, 0.08]);
  addMesh(group, new THREE.SphereGeometry(0.022, 7, 5), mats.lampWarm, [0.24, 0.92, 0.095]);

  const workingHands = [
    { palm: [-0.32, 0.75, -0.10], shoulder: [-0.18, 1.22, 0], elbow: [-0.34, 1.00, -0.05], wrist: [-0.32, 0.82, -0.10] },
    { palm: [0.32, 0.75, -0.10], shoulder: [0.18, 1.22, 0], elbow: [0.34, 1.00, -0.05], wrist: [0.32, 0.82, -0.10] },
  ];
  const paneHands = [
    { palm: [-0.76, 1.13, -1.3], shoulder: [-0.18, 1.20, -0.03], elbow: [-0.45, 1.32, -1.0], wrist: [-0.76, 1.18, -1.27] },
    { palm: [0.76, 1.13, -1.3], shoulder: [0.18, 1.20, -0.03], elbow: [0.45, 1.32, -1.0], wrist: [0.76, 1.18, -1.27] },
  ];
  return {
    group,
    update(state, amount) {
      const u = state.actors.survivor.handsOnGlass ? clamp01(amount) : 0;
      const before = state.actors.survivor.handsOnGlass;
      group.visible = true;
      group.userData.faceVisible = state.actors.survivor.faceVisible;
      for (let index = 0; index < arms.length; index++) {
        const arm = arms[index];
        const from = workingHands[index], to = paneHands[index];
        const mixPoint = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
        const shoulder = mixPoint(from.shoulder, to.shoulder);
        const elbow = mixPoint(from.elbow, to.elbow);
        const wrist = mixPoint(from.wrist, to.wrist);
        const palm = mixPoint(from.palm, to.palm);
        arm.upper.position.set(0, 0, 0);
        setBeamPoints(arm.upper, shoulder, elbow);
        setBeamPoints(arm.fore, elbow, wrist);
        arm.palm.position.set(palm[0], palm[1], palm[2]);
        arm.palm.rotation.x = before ? -0.06 : 0;
        for (const finger of arm.fingers) {
          const offset = finger.userData.offset;
          const length = finger.userData.length;
          const start = [palm[0] + offset, palm[1], palm[2] - 0.01];
          const direction = arm.side < 0 ? -1 : 1;
          const end = [start[0] + offset * 0.25, start[1] + length * (0.25 - Math.abs(offset)), start[2] - 0.015 * direction];
          setBeamPoints(finger, start, end);
        }
      }
    },
  };
}

function setBeamPoints(mesh, from, to) {
  const a = vec3(from), b = vec3(to);
  const delta = new THREE.Vector3().subVectors(b, a);
  const length = Math.max(delta.length(), 0.000001);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  mesh.scale.y = length / Math.max(mesh.geometry.parameters?.height || 1, 0.000001);
}

function createCrewProxy(scene, mats, name, key) {
  const group = new THREE.Group();
  group.name = `${name} · persistent crew proxy`;
  group.userData.proxyId = WORLD_IDS[key];
  group.scale.setScalar(0.001);
  const jacket = key === 'mara' ? mats.maraSuit : mats.rinSuit;
  addBox(group, [0.34, 0.54, 0.20], jacket, [0, 0.90, 0]);
  addBox(group, [0.36, 0.14, 0.20], mats.dark, [0, 0.57, 0]);
  addMesh(group, new THREE.SphereGeometry(0.115, 12, 9), mats.helmet, [0, 1.45, 0]);
  addMesh(group, new THREE.SphereGeometry(0.085, 12, 8), mats.visor, [0, 1.45, 0.09]);
  for (const side of [-1, 1]) {
    addSegment(group, [side * 0.19, 1.16, 0], [side * 0.24, 0.75, 0.04], 0.045, jacket, 7);
    addSegment(group, [side * 0.10, 0.60, 0], [side * 0.13, 0.12, 0], 0.06, mats.suitDark, 7);
    addBox(group, [0.12, 0.08, 0.18], mats.boot, [side * 0.13, 0.05, 0.05]);
  }
  if (key === 'mara') {
    addTube(group, [[-0.02, 1.51, -0.09], [-0.04, 1.60, -0.24], [-0.11, 1.63, -0.42], [-0.18, 1.66, -0.65], [-0.24, 1.69, -0.84]], 0.032, mats.hair, 18, 6, false, 'Mara · comet-tail hair proxy');
  }
  const tool = new THREE.Group();
  tool.name = 'Persistent Rin wrench prop';
  tool.userData.proxyId = 'prop.tool_rin';
  addSegment(tool, [0, 0, 0], [0, 0.30, 0], 0.021, mats.tool, 6);
  addBox(tool, [0.14, 0.045, 0.04], mats.tool, [0, 0.31, 0]);
  addMesh(tool, new THREE.TorusGeometry(0.035, 0.009, 5, 10), mats.tool, [0.065, 0.31, 0]);
  tool.position.set(0.25, 0.79, 0.02);
  tool.rotation.z = -0.28;
  group.add(tool);
  group.userData.wrenchId = tool.userData.proxyId;
  scene.add(group);
  return { group, tool };
}

function createLandmarks(scene, mats) {
  const definitions = [
    ['hesh', 'Hesh', [-4.7, 0.18, -0.25], 'crew'],
    ['kira', 'Kira', [0.45, -3.4, -0.18], 'pod'],
    ['jalen', 'Jalen', [0.35, 2.2, 0.2], 'crew'],
    ['safi', 'Safi', [0.15, -0.35, 4.9], 'crew'],
  ];
  const entries = {};
  for (const [key, name, position, type] of definitions) {
    const group = new THREE.Group();
    group.name = `${name} · persistent landmark proxy`;
    group.userData.proxyId = `landmark.${key}`;
    group.position.set(...position);
    if (type === 'pod') {
      addMesh(group, new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), mats.cryo, [0, 0, 0], [0, 0, Math.PI / 2]);
      addMesh(group, new THREE.SphereGeometry(0.16, 10, 7), mats.glass, [0.25, 0, 0]);
    } else {
      const figure = createCrewProxy(scene, mats, name, key === 'hesh' ? 'mara' : 'rin');
      group.add(figure.group);
      figure.group.position.set(0, 0, 0);
      group.userData.figure = figure.group;
      figure.group.rotation.y = key === 'hesh' ? Math.PI * 0.58 : 0.4;
      scene.remove(figure.group);
    }
    scene.add(group);
    entries[key] = group;
  }
  // A slender antenna and tensioned sail remain attached to the same station group.
  const antenna = new THREE.Group();
  antenna.position.set(0.5, 2.5, -0.45);
  addSegment(antenna, [0, 0, 0], [0, 0.65, 0], 0.035, mats.edge, 7);
  for (let spoke = 0; spoke < 4; spoke++) {
    const angle = spoke * Math.PI / 2;
    addSegment(antenna, [0, 0.25, 0], [Math.cos(angle) * 0.48, 0.22, Math.sin(angle) * 0.48], 0.012, mats.edge, 5);
  }
  scene.add(antenna);
  const sail = new THREE.Group();
  sail.position.set(0.1, 0.3, -5.1);
  addMesh(sail, new THREE.PlaneGeometry(2.1, 1.5, 1, 1), mats.sail, [0, 0, 0], [0.28, 0.1, -0.2]);
  for (const side of [-1, 1]) addSegment(sail, [side * 1.05, -0.75, 0], [side * 1.05, 0.75, 0], 0.018, mats.edge, 5);
  scene.add(sail);
  entries.antenna = antenna;
  entries.sail = sail;

  return {
    entries,
    update(state) {
      entries.hesh.visible = state.landmarks.heshVisible;
      entries.kira.visible = state.landmarks.kiraPlaced;
      entries.jalen.visible = state.landmarks.jalenPlaced;
      entries.safi.visible = state.landmarks.safiPlaced;
      antenna.visible = state.landmarks.jalenPlaced || state.month >= 5;
      sail.visible = state.month >= 5;
    },
  };
}

function createTiger(scene, mats) {
  const root = new THREE.Group();
  root.name = 'Shard-God Tiger · canon-guided, editable silhouette proxy';
  root.userData.proxyId = WORLD_IDS.tiger;
  root.position.set(4.9, 0.07, 0.12); // interpretable staging substitute; no source-locked world position.
  root.scale.setScalar(0.001); // mesh built in metres, with locked 9 ft / 2.7432 m height.
  const body = mats.tiger;
  const crystal = mats.tigerCrystal;
  const glow = mats.tigerGlow;

  // Rooted legs, long torso, angular shoulder planes; still, not a combat pose.
  addMesh(root, new THREE.CapsuleGeometry(0.20, 0.73, 5, 8), body, [0, 1.14, 0]);
  addMesh(root, new THREE.IcosahedronGeometry(0.33, 0), body, [0, 1.77, 0.01], [0.05, 0.05, 0]);
  addMesh(root, new THREE.IcosahedronGeometry(0.245, 1), body, [0, 2.29, 0.035]);
  addMesh(root, new THREE.IcosahedronGeometry(0.235, 0), body, [0, 2.47, 0.055], [0.08, 0, 0]);
  for (const side of [-1, 1]) {
    addSegment(root, [side * 0.12, 1.05, 0], [side * 0.15, 0.43, 0.10], 0.12, body, 7);
    addSegment(root, [side * 0.15, 0.43, 0.10], [side * 0.18, 0.12, 0.25], 0.085, body, 7);
    addBox(root, [0.31, 0.12, 0.42], body, [side * 0.18, 0.065, 0.34]);
    addSegment(root, [side * 0.29, 1.93, 0.02], [side * 0.39, 1.37, 0.12], 0.095, body, 7);
    addSegment(root, [side * 0.39, 1.37, 0.12], [side * 0.42, 0.99, 0.22], 0.073, body, 7);
    addMesh(root, new THREE.IcosahedronGeometry(0.105, 0), body, [side * 0.43, 0.88, 0.24]);
    for (let claw = 0; claw < 3; claw++) {
      const cx = side * (0.37 + claw * 0.055);
      addSegment(root, [cx, 0.83, 0.29], [cx + side * 0.035, 0.72, 0.42], 0.016, crystal, 5);
    }
    // Pupil-less solid cyan eyes; no nose tip, irises or teeth are modeled.
    addMesh(root, new THREE.SphereGeometry(0.040, 9, 7), glow, [side * 0.085, 2.48, 0.258]);
    addTube(root, [[side * 0.16, 2.30, 0.26], [side * 0.085, 2.26, 0.268], [0, 2.245, 0.274], [side * 0.15, 2.29, 0.26]], 0.012, glow, 10, 5, false, 'dark mineral grin edge / rear cyan light');
    addSegment(root, [side * 0.17, 2.20, 0.22], [side * 0.12, 2.00, 0.25], 0.018, crystal, 5);
  }
  // One swept-back crown fan. Hidden rear shards remain explicitly interpretive proxies.
  const crown = [
    [-0.25, 2.48, -0.02, -0.48, 2.72, -0.35],
    [-0.13, 2.55, -0.02, -0.25, 2.86, -0.25],
    [0, 2.56, -0.02, 0.03, 2.91, -0.30],
    [0.14, 2.53, -0.02, 0.31, 2.82, -0.28],
    [0.25, 2.48, -0.02, 0.49, 2.68, -0.22],
  ];
  for (const [ax, ay, az, bx, by, bz] of crown) {
    addSegment(root, [ax, ay, az], [bx, by, bz], 0.047, crystal, 5);
  }
  // A single attached tapering tail sweeps behind the hips; no duplicated tail segments.
  addTube(root, [[0, 0.91, -0.10], [0.12, 0.74, -0.45], [0.32, 0.62, -0.80], [0.51, 0.69, -1.18], [0.72, 0.91, -1.49]], 0.055, body, 24, 7, false, 'Tiger · single rooted tail proxy');
  addTube(root, [[-0.23, 1.89, 0.08], [-0.17, 1.75, 0.25], [-0.10, 1.54, 0.26]], 0.017, glow, 12, 5);
  addTube(root, [[0.23, 1.89, 0.08], [0.17, 1.75, 0.25], [0.10, 1.54, 0.26]], 0.017, glow, 12, 5);
  scene.add(root);
  return {
    root,
    update(state, time) {
      root.visible = state.tiger.present;
      root.userData.heightMeters = TIGER_HEIGHT_M;
      root.userData.pose = 'still';
      root.userData.time = time;
      mats.tiger.emissiveIntensity = state.tiger.backlit ? 0.14 : 0.045;
      mats.tigerCrystal.emissiveIntensity = state.tiger.backlit ? 0.65 : 0.23;
      mats.tigerGlow.emissiveIntensity = state.tiger.present ? 1.15 : 0;
    },
  };
}

function createWorldMaterials() {
  return {
    hull: material(0x52687b, { metalness: 0.82, roughness: 0.48, emissive: 0x071019, emissiveIntensity: 0.005 }),
    spire: material(0x64788a, { metalness: 0.78, roughness: 0.48 }),
    ring: material(0x334657, { metalness: 0.83, roughness: 0.52, side: THREE.DoubleSide }),
    segment02: material(0x44596b, { metalness: 0.79, roughness: 0.48, side: THREE.DoubleSide }),
    edge: material(0x9aaab5, { metalness: 0.84, roughness: 0.36 }),
    dark: material(0x17232e, { metalness: 0.62, roughness: 0.62 }),
    panel: material(0x657888, { metalness: 0.76, roughness: 0.42 }),
    hullPanel: material(0x71818d, { metalness: 0.75, roughness: 0.45 }),
    armCore: material(0x283a49, { metalness: 0.80, roughness: 0.45 }),
    armPanel: material(0x82929e, { metalness: 0.74, roughness: 0.39 }),
    socketRim: material(0x9b7b5c, { metalness: 0.78, roughness: 0.4, emissive: 0xff6f43, emissiveIntensity: 0.02 }),
    socketInner: material(0x758a98, { metalness: 0.8, roughness: 0.4 }),
    socketDark: material(0x080e14, { metalness: 0.25, roughness: 0.8 }),
    cutEmissive: material(0x334553, { metalness: 0.62, roughness: 0.45, emissive: 0xff754e, emissiveIntensity: 0 }),
    markerLight: material(0x7bd3d9, { metalness: 0.12, roughness: 0.28, emissive: 0x6fe4ef, emissiveIntensity: 1.35 }),
    lamp: material(0x85cbd3, { metalness: 0.05, roughness: 0.28, emissive: 0x84dce8, emissiveIntensity: 0.54 }),
    lampDark: material(0x202c34, { metalness: 0.1, roughness: 0.6, emissive: 0x0c1115, emissiveIntensity: 0.02 }),
    lampWarm: material(0xe2bb82, { metalness: 0.06, roughness: 0.32, emissive: 0xffb55e, emissiveIntensity: 0.45 }),
    floor: material(0x283540, { metalness: 0.62, roughness: 0.58 }),
    ceiling: material(0x202c37, { metalness: 0.60, roughness: 0.55 }),
    wall: material(0x384c5d, { metalness: 0.72, roughness: 0.55 }),
    hydroFloor: material(0x17241f, { metalness: 0.42, roughness: 0.82 }),
    hydroCeiling: material(0x111d19, { metalness: 0.46, roughness: 0.78 }),
    hydroWall: material(0x25352e, { metalness: 0.48, roughness: 0.76 }),
    interior: material(0x1a2834, { metalness: 0.65, roughness: 0.65 }),
    door: material(0x5b6e7a, { metalness: 0.78, roughness: 0.43, emissive: 0x7f341e, emissiveIntensity: 0.05 }),
    relayPanel: material(0x304f5a, { metalness: 0.5, roughness: 0.38, emissive: 0x44a9bc, emissiveIntensity: 0.38 }),
    pump: material(0x476c61, { metalness: 0.38, roughness: 0.42, emissive: 0x4c9f77, emissiveIntensity: 0.30 }),
    pipeWarm: material(0x876548, { metalness: 0.63, roughness: 0.56 }),
    pipeCool: material(0x567685, { metalness: 0.68, roughness: 0.4 }),
    plantRack: material(0x354237, { metalness: 0.32, roughness: 0.74 }),
    plant: material(0x4c6e54, { metalness: 0.08, roughness: 0.72, emissive: 0x173524, emissiveIntensity: 0.04, side: THREE.DoubleSide }),
    plantStem: material(0x6f8b5d, { metalness: 0.02, roughness: 0.86 }),
    glass: material(0xa8d8df, { metalness: 0.08, roughness: 0.12, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, emissive: 0x14313a, emissiveIntensity: 0.025 }),
    windowFrame: material(0x82949e, { metalness: 0.78, roughness: 0.38 }),
    cryo: material(0x374b5c, { metalness: 0.72, roughness: 0.35 }),
    sail: material(0x889aa5, { metalness: 0.22, roughness: 0.68, transparent: true, opacity: 0.63, side: THREE.DoubleSide }),
    suitDark: material(0x293744, { metalness: 0.38, roughness: 0.7 }),
    boot: material(0x455561, { metalness: 0.55, roughness: 0.63 }),
    helmet: material(0x7b8c99, { metalness: 0.55, roughness: 0.32 }),
    visor: material(0x152b3b, { metalness: 0.18, roughness: 0.18, transparent: true, opacity: 0.82 }),
    maraSuit: material(0x667c83, { metalness: 0.31, roughness: 0.67 }),
    rinSuit: material(0x826d57, { metalness: 0.36, roughness: 0.65 }),
    tool: material(0x99a7ad, { metalness: 0.86, roughness: 0.30 }),
    hair: material(0x39333a, { metalness: 0.12, roughness: 0.78 }),
    survivorSuit: material(0x394956, { metalness: 0.32, roughness: 0.7 }),
    survivorSuitLight: material(0x697781, { metalness: 0.38, roughness: 0.64 }),
    skin: material(0xc5ac94, { metalness: 0.03, roughness: 0.84 }),
    skinShadow: material(0x715e54, { metalness: 0.03, roughness: 0.9 }),
    faceDark: material(0x211d1d, { metalness: 0.02, roughness: 0.96 }),
    tiger: material(0x080c11, { metalness: 0.62, roughness: 0.26, emissive: 0x050d12, emissiveIntensity: 0.045, flatShading: true }),
    tigerCrystal: material(0x18242d, { metalness: 0.54, roughness: 0.16, emissive: 0x1d899a, emissiveIntensity: 0.23, transparent: true, opacity: 0.84, flatShading: true }),
    tigerGlow: material(0x54e7f5, { metalness: 0.02, roughness: 0.12, emissive: 0x55eaff, emissiveIntensity: 1.15 }),
  };
}

function createStationEnvelope(scene, mats) {
  const hemi = new THREE.HemisphereLight(0x8fa6b8, 0x0a1017, 0.72);
  hemi.name = 'broad, cold orbital fill';
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xe5eef2, 2.0);
  key.position.set(12, 14, 8);
  key.name = 'Virgil-side directional key';
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x62a8d1, 1.0);
  rim.position.set(-12, 4, -10);
  rim.name = 'cool station rim';
  scene.add(rim);
  const chapelFill = new THREE.PointLight(0x94c6ce, 0.52, 0.06, 1.7);
  chapelFill.position.set(0, 0.0014, -4.37);
  chapelFill.name = 'Chapel practical fill';
  scene.add(chapelFill);
  const dockFill = new THREE.PointLight(0x8db8c4, 0.4, 0.18, 1.8);
  dockFill.position.set(0, 0.04, 5.25);
  scene.add(dockFill);
  const hydroFill = new THREE.PointLight(0x9dcdab, 0.5, 0.35, 1.8);
  hydroFill.position.set(0, -3.30, 0.06);
  scene.add(hydroFill);
  const tigerRim = new THREE.PointLight(0x37e6ff, 0.12, 0.004, 1.8);
  tigerRim.position.set(4.9, 0.072, 0.115);
  scene.add(tigerRim);
  return { hemi, key, rim, chapelFill, dockFill, hydroFill, tigerRim, materials: mats };
}

function cameraFovForAspect(baseFov, aspect) {
  const targetAspect = 16 / 9;
  if (aspect >= targetAspect) return baseFov;
  const horizontalHalfFov = Math.atan(Math.tan(radians(baseFov / 2)) * targetAspect);
  const adjusted = 2 * Math.atan(Math.tan(horizontalHalfFov) / aspect);
  return Math.min(82, adjusted * 180 / Math.PI);
}

function setPose(camera, pose, width, height) {
  camera.position.copy(vec3(pose.position));
  camera.up.set(0, 1, 0);
  camera.fov = cameraFovForAspect(pose.fov, width / Math.max(1, height));
  camera.aspect = width / Math.max(1, height);
  camera.near = 0.00025;
  camera.far = 160;
  camera.updateProjectionMatrix();
  camera.lookAt(vec3(pose.target));
}

function setStateWorld(sceneObjects, state, time, reduced) {
  sceneObjects.station.update(state, time, reduced);
}

export function createMeridian3D(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
      stencil: false,
      depth: true,
    });
  } catch (error) {
    canvas.style.display = 'none';
    return {
      available: false,
      reason: error?.message || 'WebGL initialization failed',
      resize() {},
      render() {},
      metrics: () => ({ available: false }),
    };
  }

  const gl = renderer.getContext();
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const gpuRenderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const softwareRenderer = /swiftshader|llvmpipe|softpipe|swrast|software raster/i.test(gpuRenderer || '');

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.setClearColor(0x04070b, 1);
  renderer.shadowMap.enabled = false;
  renderer.info.autoReset = false;
  canvas.style.display = 'block';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04070b);
  const camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.00025, 160);
  const materials = createWorldMaterials();
  createStars(scene);
  const virgil = createVirgil(scene, materials);
  const lighting = createStationEnvelope(scene, materials);
  const station = createStation(scene, materials);
  const objects = { station, virgil, lighting };
  let cssWidth = 1, cssHeight = 1, pixelRatio = 1;
  let lastPose = null;
  let drawCpuMs = 0;
  let drawPasses = 0;
  let lastFrameInfo = { calls: 0, triangles: 0 };
  let disposed = false;
  const compareCamera = new THREE.PerspectiveCamera(48, 1, 0.00025, 160);

  function resize(width, height, dpr = 1) {
    cssWidth = Math.max(1, width);
    cssHeight = Math.max(1, height);
    pixelRatio = Math.max(1, dpr);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(cssWidth, cssHeight, false);
  }

  function renderPass(view, state, time, shotId, attentionVariant, reduced) {
    setStateWorld(objects, state, time, reduced);
    const frameWidth = view.width;
    const frameHeight = view.height;
    const pose = view.pose;
    setPose(view.camera || camera, pose, frameWidth, frameHeight);
    const activeCamera = view.camera || camera;
    renderer.setViewport(view.x, view.y, view.width, view.height);
    renderer.setScissor(view.x, view.y, view.width, view.height);
    renderer.setScissorTest(true);
    const start = performance.now();
    renderer.render(scene, activeCamera);
    drawCpuMs += performance.now() - start;
    drawPasses++;
    lastPose = { ...pose, position: [...pose.position], target: [...pose.target], shotId, attentionVariant };
  }

  function render(state, time, shot, options = {}) {
    if (disposed || !cssWidth || !cssHeight) return;
    const frameStart = performance.now();
    drawCpuMs = 0;
    drawPasses = 0;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, cssWidth, cssHeight);
    renderer.clear(true, true, true);

    const reduced = !!options.reduced;
    const orbit = options.mode === 'inspect' && options.orbit?.enabled;
    const viewWidth = Math.max(1, Math.round(cssWidth));
    const viewHeight = Math.max(1, Math.round(cssHeight));
    if (options.mode === 'inspect' && options.beforeAfter && !orbit) {
      const half = Math.floor(viewWidth / 2);
      const poseArr = comparePose3d(options.beforeAfter.cam, time, shot?.id || '');
      const pose = { position: poseArr[1], target: poseArr[2], fov: poseArr[3] };
      renderPass({ x: 0, y: 0, width: half, height: viewHeight, camera: compareCamera, pose }, options.beforeAfter.intactState, options.beforeAfter.intactState.t, shot?.id, 'matched-view', reduced);
      renderPass({ x: half, y: 0, width: viewWidth - half, height: viewHeight, camera: compareCamera, pose }, state, time, shot?.id, 'matched-view', reduced);
      renderer.setScissorTest(false);
    } else {
      const pose = orbit ? orbitPose3d(options.orbit.angle) : authoredPose3d(time, shot?.id || 'dock-wide', options.mode === 'inspect' ? options.attentionVariant : 'incumbent');
      renderPass({ x: 0, y: 0, width: viewWidth, height: viewHeight, camera, pose }, state, time, shot?.id, options.mode === 'inspect' ? options.attentionVariant : 'incumbent', reduced);
      renderer.setScissorTest(false);
    }
    renderer.setScissorTest(false);
    const total = performance.now() - frameStart;
    lastFrameInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, totalCpuMs: total };
    renderer.info.reset();
    return { drawCpuMs, totalCpuMs: total, drawPasses, ...lastFrameInfo, pose: lastPose };
  }

  return {
    available: true,
    reason: '',
    resize,
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.dispose();
    },
    get canvas() { return canvas; },
    get pose() { return lastPose; },
    metrics: () => ({
      available: true,
      renderer: 'three.js WebGLRenderer',
      threeRevision: THREE.REVISION,
      gpuRenderer,
      softwareRenderer,
      pixelRatio,
      cssWidth,
      cssHeight,
      drawCpuMs: +drawCpuMs.toFixed(3),
      totalCpuMs: +lastFrameInfo.totalCpuMs || 0,
      drawPasses,
      calls: lastFrameInfo.calls,
      triangles: lastFrameInfo.triangles,
      camera: lastPose,
    }),
  };
}
