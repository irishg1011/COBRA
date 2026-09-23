/* ============================================================
   arena3d.js — Three.js arena for the CobraByte Quiz activity.

   Adapted from the Cobra Quiz reference, reskinned to the CobraByte
   learner theme (light floor, green rails/grid, green cobra).

   createArena(canvas) -> {
     setGrid(cols, rows),
     render({ segs, headAngle, pellets, shake, dt, dead }),
     burst(gx, gy, color),
     resize(),
     dispose()
   }

   Grid coordinates come in as game cells (x: 0..cols-1, y: 0..rows-1)
   and are mapped to world units where one cell = one unit.
   ============================================================ */
import * as THREE from './three.module.js';

export function createArena(canvas) {
  let COLS = 40, ROWS = 15;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const BG = 0xf8fafc;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 34, 92);

  const camera = new THREE.PerspectiveCamera(30, 2.6, 0.1, 400);

  /* ---------- lights ---------- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(-12, 26, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 90;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbbf7d0, 0.45);
  rim.position.set(14, 10, -18);
  scene.add(rim);

  /* ---------- floor + grid ---------- */
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.95, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.04 })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.012;
  scene.add(glow);

  let gridLines = null;
  let frame = null;

  function buildGrid() {
    if (gridLines) { scene.remove(gridLines); gridLines.geometry.dispose(); }
    if (frame) { scene.remove(frame); }

    const hw = COLS / 2, hd = ROWS / 2;
    const pts = [];
    for (let x = 0; x <= COLS; x++) pts.push(-hw + x, 0, -hd, -hw + x, 0, hd);
    for (let z = 0; z <= ROWS; z++) pts.push(-hw, 0, -hd + z, hw, 0, -hd + z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    gridLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x16a34a, transparent: true, opacity: 0.16
    }));
    gridLines.position.y = 0.02;
    scene.add(gridLines);

    frame = new THREE.Group();
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a, emissive: 0x15803d, emissiveIntensity: 0.12, roughness: 0.5
    });
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), railMat);
      m.position.set(x, 0.15, z);
      m.castShadow = true;
      frame.add(m);
    };
    mk(COLS + 0.44, 0.22, 0, -hd - 0.11);
    mk(COLS + 0.44, 0.22, 0, hd + 0.11);
    mk(0.22, ROWS + 0.44, -hw - 0.11, 0);
    mk(0.22, ROWS + 0.44, hw + 0.11, 0);
    scene.add(frame);

    floor.scale.set(COLS + 26, ROWS + 26, 1);
    glow.scale.set(COLS, ROWS, 1);
    placeCamera();
  }

  /* ---------- camera framing ---------- */
  const camTarget = new THREE.Vector3(0, 0, 0);
  let camBase = new THREE.Vector3();

  function placeCamera() {
    const aspect = Math.max(0.4, canvas.clientWidth / Math.max(1, canvas.clientHeight));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const tall = aspect < 1.2;                       // phone layout: grid is portrait
    const tilt = tall ? 1.22 : 1.06;                 // radians above the horizon

    // corners of the playfield (plus the rails and the floating letters)
    const hw = COLS / 2 + 0.7, hd = ROWS / 2 + 0.7;
    const corners = [];
    [-hw, hw].forEach(x => [-hd, hd].forEach(z => {
      corners.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, 1.5, z));
    }));

    const dir = new THREE.Vector3(0, Math.sin(tilt), Math.cos(tilt));
    const probe = new THREE.Vector3();
    const origin = new THREE.Vector3();

    // project every corner for a candidate distance; returns the NDC bounds
    const measure = d => {
      origin.copy(dir).multiplyScalar(d).add(new THREE.Vector3(0, 0, camTarget.z));
      camera.position.copy(origin);
      camera.lookAt(camTarget);
      camera.updateMatrixWorld(true);
      let m = 0, yMin = 9, yMax = -9;
      for (const c of corners) {
        probe.copy(c).project(camera);
        m = Math.max(m, Math.abs(probe.x), Math.abs(probe.y));
        yMin = Math.min(yMin, probe.y); yMax = Math.max(yMax, probe.y);
      }
      return { m, yc: (yMin + yMax) / 2 };
    };

    let d = 40;
    camTarget.set(0, 0, 0);
    // alternate: fit the distance, then recentre the board vertically in frame
    for (let pass = 0; pass < 5; pass++) {
      let lo = 4, hi = 400;
      for (let i = 0; i < 34; i++) {
        const mid = (lo + hi) / 2;
        if (measure(mid).m > 0.965) lo = mid; else hi = mid;
      }
      d = hi;
      const { yc } = measure(d);
      if (Math.abs(yc) < 0.004) break;
      camTarget.z += yc * ROWS * 0.28;
    }
    scene.fog.near = d * 0.55;
    scene.fog.far = d * 2.1;
    camBase.copy(dir).multiplyScalar(d).add(new THREE.Vector3(0, 0, camTarget.z));
    camera.position.copy(camBase);
    camera.lookAt(camTarget);
  }

  const gx = x => x - COLS / 2 + 0.5;
  const gz = y => y - ROWS / 2 + 0.5;

  /* ---------- cobra ---------- */
  const MAXSEG = 90;
  const bodyMatA = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.45, metalness: 0.08 });
  const bodyMatB = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5, metalness: 0.08 });
  const segGeo = new THREE.SphereGeometry(1, 16, 12);
  const segs = [];
  for (let i = 0; i < MAXSEG; i++) {
    const m = new THREE.Mesh(segGeo, i % 2 ? bodyMatA : bodyMatB);
    m.castShadow = true;
    m.visible = false;
    scene.add(m);
    segs.push(m);
  }

  const head = new THREE.Group();
  head.scale.setScalar(1.55);
  scene.add(head);

  const skullMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.38, metalness: 0.1 });
  const skull = new THREE.Mesh(segGeo, skullMat);
  skull.scale.set(0.62, 0.42, 0.46);
  skull.castShadow = true;
  head.add(skull);

  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5, side: THREE.DoubleSide });
  const hood = new THREE.Mesh(segGeo, hoodMat);
  hood.scale.set(0.34, 0.5, 0.86);
  hood.position.set(-0.52, 0.02, 0);
  hood.castShadow = true;
  head.add(hood);

  const markMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, roughness: 0.6 });
  [-0.3, 0.3].forEach(z => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.036, 8, 16), markMat);
    ring.position.set(-0.72, 0.16, z);
    ring.rotation.y = Math.PI / 2;
    head.add(ring);
  });

  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  [-1, 1].forEach(s => {
    const e = new THREE.Mesh(segGeo, eyeWhite);
    e.scale.setScalar(0.105);
    e.position.set(0.26, 0.2, s * 0.19);
    head.add(e);
    const pu = new THREE.Mesh(segGeo, pupilMat);
    pu.scale.set(0.035, 0.07, 0.05);
    pu.position.set(0.345, 0.21, s * 0.2);
    head.add(pu);
  });

  const tongue = new THREE.Group();
  const tongueMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
  const tstem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 6), tongueMat);
  tstem.rotation.z = -Math.PI / 2;
  tstem.position.x = 0.17;
  tongue.add(tstem);
  [-1, 1].forEach(s => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.012, 0.22, 6), tongueMat);
    f.rotation.z = -Math.PI / 2;
    f.rotation.y = s * 0.5;
    f.position.set(0.44, 0, s * 0.055);
    tongue.add(f);
  });
  tongue.position.set(0.5, 0.03, 0);
  head.add(tongue);

  /* ---------- pellets ---------- */
  const pelletPool = [];
  const letterCache = new Map();

  const letterGeo = new THREE.PlaneGeometry(1.7, 1.7);
  function letterSprite(letter, color) {
    const k = letter + color;
    let mat = letterCache.get(k);
    if (!mat) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const g = c.getContext('2d');
      g.font = '800 84px Inter, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      g.lineWidth = 14;
      g.strokeStyle = 'rgba(255,255,255,0.95)';
      g.strokeText(letter, 64, 70);
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = 6;
      g.fillText(letter, 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false,
        side: THREE.DoubleSide, toneMapped: false
      });
      letterCache.set(k, mat);
    }
    const m = new THREE.Mesh(letterGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, -0.86, 0.9);
    m.renderOrder = 10;
    m.frustumCulled = false;
    return m;
  }

  function getPellet(i) {
    if (pelletPool[i]) return pelletPool[i];
    const grp = new THREE.Group();
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.6, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25,
        roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.95
      })
    );
    orb.castShadow = true;
    grp.add(orb);
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.72, 0.92, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.56;
    grp.add(halo);
    const rec = { grp, orb, halo, sprite: null, key: '' };
    scene.add(grp);
    pelletPool[i] = rec;
    return rec;
  }

  /* ---------- particles ---------- */
  const MAXP = 500;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.36, vertexColors: true, transparent: true, fog: false,
    blending: THREE.NormalBlending, depthWrite: false
  }));
  points.frustumCulled = false;
  scene.add(points);
  const parts = [];
  const tmpCol = new THREE.Color();

  function burst(cellX, cellY, color, n = 26) {
    tmpCol.set(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = 1.4 + Math.random() * 3.4;
      const s = 1.6 + Math.random() * 5.2;
      parts.push({
        x: gx(cellX), y: 0.5, z: gz(cellY),
        vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s,
        life: 1, r: tmpCol.r, g: tmpCol.g, b: tmpCol.b
      });
    }
    while (parts.length > MAXP) parts.shift();
  }

  function stepParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 13 * dt;
      p.life -= dt * 1.5;
      if (p.y < 0.08) { p.y = 0.08; p.vy *= -0.32; p.vx *= 0.7; p.vz *= 0.7; }
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      const o = i * 3;
      if (p) {
        pPos[o] = p.x; pPos[o + 1] = p.y; pPos[o + 2] = p.z;
        pCol[o] = p.r; pCol[o + 1] = p.g; pCol[o + 2] = p.b;
      } else {
        pPos[o] = 0; pPos[o + 1] = -999; pPos[o + 2] = 0;
        pCol[o] = pCol[o + 1] = pCol[o + 2] = 1;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- render ---------- */
  function render(f) {
    const dt = Math.min(f.dt || 0.016, 0.1);
    const t = performance.now() / 1000;
    const pts = f.segs || [];
    const n = pts.length;

    for (let i = 0; i < MAXSEG; i++) {
      const m = segs[i];
      if (i >= n) { m.visible = false; continue; }
      const s = n > 1 ? i / (n - 1) : 0;
      const r = 0.56 * (1 - 0.42 * s);
      m.visible = true;
      m.position.set(gx(pts[i].x), r + 0.05, gz(pts[i].y));
      m.scale.set(r, r * 0.86, r);
    }

    if (n) {
      const h = pts[0];
      head.position.set(gx(h.x), 0.52, gz(h.y));
      head.rotation.y = -(f.headAngle || 0);
      const dead = !!f.dead;
      head.position.y = dead ? 0.44 : 0.66 + Math.sin(t * 5) * 0.04;
      head.rotation.z = dead ? 0.5 : 0;
      const flick = (Math.sin(t * 7) + 1) / 2;
      tongue.scale.setScalar(dead ? 0.001 : 0.6 + flick * 0.7);
      hood.scale.set(0.34, dead ? 0.3 : 0.5, dead ? 0.55 : 0.86);
    }

    // pellets
    const pl = f.pellets || [];
    pelletPool.forEach((rec, i) => { if (i >= pl.length) rec.grp.visible = false; });
    pl.forEach((p, i) => {
      const rec = getPellet(i);
      rec.grp.visible = true;
      const key = p.letter + p.color;
      if (rec.key !== key) {
        rec.key = key;
        rec.orb.material.color.set(p.color);
        rec.orb.material.emissive.set(p.color);
        rec.halo.material.color.set(p.color);
        if (rec.sprite) rec.grp.remove(rec.sprite);
        rec.sprite = letterSprite(p.letter, p.color);
        rec.grp.add(rec.sprite);
      }
      const bob = Math.sin(t * 2.4 + i * 1.3) * 0.12;
      rec.grp.position.set(gx(p.x), 0.95 + bob, gz(p.y));
      rec.orb.rotation.y += dt * 0.9;
      rec.orb.rotation.x += dt * 0.5;
      rec.halo.material.opacity = 0.3 + 0.2 * Math.abs(Math.sin(t * 2 + i));
    });

    stepParticles(dt);

    const sh = f.shake || 0;
    camera.position.set(
      camBase.x + (Math.random() - 0.5) * sh,
      camBase.y + (Math.random() - 0.5) * sh,
      camBase.z + (Math.random() - 0.5) * sh
    );
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    renderer.setSize(w, h, false);
    placeCamera();
  }

  function setGrid(cols, rows) {
    COLS = cols; ROWS = rows;
    buildGrid();
    resize();
  }

  // Browsers only allow a handful of live WebGL contexts per page, so
  // the quiz calls this whenever its activity panel is torn down.
  function dispose() {
    window.removeEventListener('resize', resize);
    letterCache.forEach(mat => { if (mat.map) mat.map.dispose(); mat.dispose(); });
    letterCache.clear();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  buildGrid();
  resize();
  window.addEventListener('resize', resize);

  return { setGrid, render, burst, resize, dispose, scene, camera, renderer };
}
