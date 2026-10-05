/* ============================================================
   battle3d.js — Three.js battle stage for the CobraByte
   Fill in the Blanks activity (Cobra vs SyntaxBug).

   Scenery follows the chapter's side on the Learning Map
   (opts.terrain, from lesson_activities.get_chapter_terrain):
     'land'  a forest clearing - grass, a dirt path, trees and bushes;
             the cobra slithers out of the big bush on the left.
     'water' inside a wooden ship - plank deck, ribbed hull with
             portholes, flickering lanterns, barrels and crates; the
             cobra slithers in through the doorway on the left and the
             ship rocks gently.

   createBattle(canvas, { terrain, ... }) -> api
     api.render(frame)          draw one frame
     api.burst(where, color, n) where = 'hero' | 'foe'
     api.float(where, text, color)
     api.resize()               call when the canvas changes size
     api.warmUp()               -> Promise: stage made ready ahead of the first frame
     api.dispose()              free GPU memory + listeners
     api.holdIntro()            cobra waits out of view
     api.playIntro()            cobra slithers in
     api.skipIntro()            cobra straight to its spot
   frame = {
     t, heroLunge, foeLunge, heroFlash, foeFlash, shake,
     hp01, critical, dying, dead, heroDown, status
   }
   ============================================================ */
import * as THREE from './three.module.js';
import { createScenery } from './scenery3d.js';
import { createCobra } from './cobra3d.js';


export function createBattle(canvas, opts = {}) {
  const O = Object.assign({
    foeScale: 1,
    foeColor: 0x475569,
    foeDark: 0x1e293b,
    hornColor: 0xf87171,
    critColor: 0xe02424,
    wings: true,
    horns: true,
    tint: 0x16a34a,
    terrain: 'land'
  }, opts);
  const BG = O.terrain === 'water' ? 0x5a3d25 : 0xdcebd0;   // lantern-lit hold / forest haze

  /* ---------- core ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  // Phones: 1.5x is plenty sharp on a small screen and keeps the frame rate up.
  const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarsePointer ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, O.terrain === 'water' ? 30 : 26, O.terrain === 'water' ? 80 : 62);

  const camera = new THREE.PerspectiveCamera(42, 4, 0.1, 200);
  const CAM_BASE = new THREE.Vector3(0.5, 4.4, 14.5);
  const CAM_LOOK = new THREE.Vector3(0.5, 2.6, 0);

  /* ---------- lights ---------- */
  scene.add(O.terrain === 'water'
    ? new THREE.HemisphereLight(0xffe7c2, 0x3b2616, 0.8)
    : new THREE.HemisphereLight(0xf7fbe9, 0x3f5f2a, 0.95));
  const key = new THREE.DirectionalLight(O.terrain === 'water' ? 0xffe0b0 : 0xfff1d0, O.terrain === 'water' ? 0.9 : 1.2);
  key.position.set(-8, 14, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -22; key.shadow.camera.right = 22;
  key.shadow.camera.top = 16; key.shadow.camera.bottom = -10;
  key.shadow.camera.far = 60;
  scene.add(key);

  const rim = new THREE.DirectionalLight(O.terrain === 'water' ? 0xffc27a : 0xd9f99d, 0.35);
  rim.position.set(12, 6, -10);
  scene.add(rim);

  const heroGlow = new THREE.PointLight(0x22d3ee, 6, 14, 2);
  heroGlow.position.set(-5, 2, 2);
  scene.add(heroGlow);

  const foeGlow = new THREE.PointLight(0xf87171, 8, 16, 2);
  scene.add(foeGlow);

  /* ---------- scenery (forest / ship) - shared with flashcards3d.js ---------- */
  const scenery3d = createScenery(scene, O.terrain);
  const IS_SHIP = scenery3d.isShip;


  /* ---------- the cobra ---------- */
  const TAIL_X = -12.5, HEAD_X = -3.2;
  const SEGS = 24;
  const cobra = new THREE.Group();
  scene.add(cobra);

  // shared model (cobra3d.js): one scaled body, rearing neck, spectacle hood
  const R_TAIL = 0.26, R_NECK = 0.68;
  const cobraModel = createCobra({ headScale: 2.7, maxPoints: SEGS });
  cobra.add(cobraModel.group);

  /* ---------- the foe ---------- */
  const FOE_X = 7.6;
  const foe = new THREE.Group();
  foe.position.set(FOE_X, 2.7, 0);
  foe.scale.setScalar(O.foeScale);
  scene.add(foe);

  const shellMat = new THREE.MeshStandardMaterial({ color: O.foeColor, roughness: 0.34, metalness: 0.45 });
  const shellDarkMat = new THREE.MeshStandardMaterial({ color: O.foeDark, roughness: 0.45, metalness: 0.4 });
  const limbMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.65, metalness: 0.3 });
  const hornMat = new THREE.MeshStandardMaterial({ color: O.hornColor, roughness: 0.3, metalness: 0.35 });

  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), shellDarkMat);
  abdomen.scale.set(1.5, 1.15, 1.35);
  abdomen.position.set(0.6, 0, 0);
  abdomen.castShadow = true;
  foe.add(abdomen);

  const carapace = new THREE.Mesh(new THREE.SphereGeometry(1, 26, 20), shellMat);
  carapace.scale.set(1.35, 1.0, 1.25);
  carapace.position.set(0.35, 0.35, 0);
  carapace.castShadow = true;
  foe.add(carapace);

  // carapace seam
  const seam = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.1), shellDarkMat);
  seam.position.set(0.35, 0.8, 0);
  foe.add(seam);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), shellDarkMat);
  thorax.scale.set(0.75, 0.75, 0.95);
  thorax.position.set(-1.15, 0.05, 0);
  thorax.castShadow = true;
  foe.add(thorax);

  const fhead = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), shellMat);
  fhead.scale.set(0.6, 0.55, 0.7);
  fhead.position.set(-2.0, 0.0, 0);
  fhead.castShadow = true;
  foe.add(fhead);

  // glowing core in the chest
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xe02424, transparent: true, opacity: 0.9 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), coreMat);
  core.position.set(0.45, 0.42, 1.12);
  foe.add(core);
  const coreBack = core.clone();
  coreBack.position.z = -1.12;
  foe.add(coreBack);

  // eyes
  const foeEyeMat = new THREE.MeshBasicMaterial({ color: 0xe02424 });
  const foeEyes = [];
  [[-2.35, 0.3, 0.32], [-2.35, 0.3, -0.32], [-2.42, -0.02, 0]].forEach(([x, y, z]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), foeEyeMat);
    e.position.set(x, y, z);
    foe.add(e);
    foeEyes.push(e);
  });

  // mandibles
  const mandibles = [];
  [-1, 1].forEach(s => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.35, 8), hornMat);
    m.position.set(-2.55, -0.05, s * 0.4);
    m.castShadow = true;
    foe.add(m);
    mandibles.push({ mesh: m, s });
  });

  // horns
  if (O.horns) {
    [-1, 1].forEach(s => {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.9, 10), hornMat);
      h.position.set(-1.2, 1.15, s * 0.55);
      h.rotation.z = 0.75;
      h.rotation.x = s * 0.25;
      h.castShadow = true;
      foe.add(h);
    });
  }

  // legs
  const legs = [];
  [-1, 1].forEach(s => {
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.set(-0.7 + i * 1.0, -0.55, s * 1.0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 1.25, 8), limbMat);
      upper.position.set(0, -0.45, s * 0.45);
      upper.rotation.x = -s * 0.7;
      upper.castShadow = true;
      g.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 1.3, 8), limbMat);
      lower.position.set(0, -1.25, s * 0.95);
      lower.rotation.x = s * 0.35;
      lower.castShadow = true;
      g.add(lower);
      foe.add(g);
      legs.push({ g, s, i });
    }
  });

  // wings
  const wings = [];
  if (O.wings) {
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1, transparent: true, opacity: 0.35,
      roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide
    });
    [-1, 1].forEach(s => {
      const w = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), wingMat);
      w.scale.set(1.35, 0.05, 0.6);
      w.position.set(0.9, 0.85, s * 1.1);
      const pivot = new THREE.Group();
      pivot.position.set(0.1, 0.8, s * 0.4);
      w.position.set(0.9, 0.05, s * 0.8);
      pivot.add(w);
      foe.add(pivot);
      wings.push({ pivot, s });
    });
  }

  const foeShellMats = [shellMat, shellDarkMat, hornMat];
  const foeBaseColors = foeShellMats.map(m => m.color.clone());

  const HURT_COLOR = new THREE.Color(0xf87171);
  const CRIT_COLOR = new THREE.Color(O.critColor);
  const FLASH_COLOR = new THREE.Color(0xffffff);
  const BG_RGB = new THREE.Color(BG);

  /* ---------- particles ---------- */
  const MAXP = 420;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, fog: false,
    blending: THREE.NormalBlending, depthWrite: false
  }));
  scene.add(points);
  const parts = [];

  /* ---------- floating labels ---------- */
  const floats = [];
  function makeTextSprite(text, color, size = 88) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.font = `800 ${size}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.shadowColor = 'rgba(15,23,42,.18)'; g.shadowBlur = 8;
    g.fillText(text, 256, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    sp.scale.set(4.2, 1.3, 1);
    return sp;
  }

  const statusSprite = makeTextSprite('', '#15803d', 60);
  statusSprite.visible = false;
  scene.add(statusSprite);
  let statusText = '';

  /* ---------- api helpers ---------- */
  const heroAnchor = new THREE.Vector3(HEAD_X, 2.4, 0);
  const foeAnchor = new THREE.Vector3(FOE_X, 2.6, 0);

  function burst(where, colorHex, n = 26) {
    const a = where === 'hero' ? heroAnchor : foeAnchor;
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI;
      const sp = 3 + Math.random() * 9;
      parts.push({
        x: a.x + (Math.random() - .5), y: a.y + (Math.random() - .5), z: a.z + (Math.random() - .5),
        vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp * 0.8 + 3, vz: Math.sin(ph) * Math.sin(th) * sp,
        life: 1, r: col.r, g: col.g, b: col.b
      });
    }
  }

  function float(where, text, color) {
    const a = where === 'hero' ? heroAnchor : foeAnchor;
    const sp = makeTextSprite(text, color);
    sp.position.set(a.x, a.y + 2.2, a.z);
    scene.add(sp);
    floats.push({ sp, life: 1 });
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // pull the camera back on tall/narrow viewports so both fighters stay framed
    // (up to 2.9 so a phone-width stage still shows the cobra AND the foe;
    // desktop stages are wide enough to stay under the old 1.9 cap)
    const framing = Math.min(2.9, Math.max(0.62, 3.3 / camera.aspect));
    camera.position.set(CAM_BASE.x, CAM_BASE.y + framing * 1.6, CAM_BASE.z * (0.72 + framing * 0.4));
    camera.userData.baseY = camera.position.y;
    camera.userData.baseZ = camera.position.z;
    camera.updateProjectionMatrix();
  }

  /* ---------- slither-in intro ---------- */
  // holdIntro(): cobra waits out of view (inside the bush / behind the
  // ship's doorway). playIntro(): it slithers in (~2 s). skipIntro():
  // straight to its normal spot.
  const INTRO_DIST = 18, INTRO_SECS = 2.1;
  const intro = { hold: false, start: null };
  function holdIntro() { intro.hold = true; intro.start = null; }
  function playIntro() { intro.hold = false; intro.start = lastT; }
  function skipIntro() { intro.hold = false; intro.start = null; }
  function introOffset(t) {
    if (intro.hold) return -INTRO_DIST;
    if (intro.start === null) return 0;
    const p = (t - intro.start) / INTRO_SECS;
    if (p >= 1) { intro.start = null; return 0; }
    const e = 1 - Math.pow(1 - Math.max(0, p), 3);
    return -INTRO_DIST * (1 - e);
  }

  /* ---------- per-frame ---------- */
  let lastT = 0;
  function render(f) {
    const t = f.t || 0;
    const dt = Math.min(0.05, Math.max(0, t - lastT)) || 0.016;
    lastT = t;

    const critical = !!f.critical;
    const dying = f.dying || 0;
    const dead = !!f.dead;
    const down = !!f.heroDown;
    const heroLunge = f.heroLunge || 0;
    const foeLunge = f.foeLunge || 0;

    /* --- cobra --- */
    const slide = introOffset(t);
    const entering = slide < -0.01;
    const reach = (FOE_X - 3.1) - HEAD_X;
    const headX = HEAD_X + slide + Math.max(0, heroLunge) * reach + (heroLunge < 0 ? heroLunge * 2.4 : 0);
    const rear = down ? 0 : 2.1 + Math.max(0, heroLunge) * 0.8;
    const pts = [];
    for (let i = 0; i < SEGS; i++) {
      const s = i / (SEGS - 1);
      const x = TAIL_X + slide + (headX - (TAIL_X + slide)) * s;
      const wob = Math.sin(s * Math.PI * 3.1 - t * (down ? 1.2 : entering ? 9 : 4.4)) * (down ? 0.25 : 1.05 * (1 - 0.45 * s));
      const y = 0.3 + 0.36 * s + Math.pow(s, 2.6) * rear * (down ? 0 : 1);
      pts.push(new THREE.Vector3(x, down ? 0.32 : y, wob));
    }
    const biting = heroLunge > 0.85;
    const hf = f.heroFlash || 0;
    cobraModel.update({
      points: pts, rTail: R_TAIL, rNeck: R_NECK, t, dt,
      down,
      biting,
      flare: Math.max(0, heroLunge),
      hurt: Math.min(1, hf),
    });
    heroGlow.position.set(headX - 1, 2.2, 0);
    heroGlow.intensity = down ? 1 : 5 + Math.sin(t * 3) * 1.5;

    /* --- scenery: swaying bushes, flickering lanterns --- */
    scenery3d.update(t, entering);

    /* --- foe --- */
    const bob = Math.sin(t * (critical ? 3.6 : 2.0)) * (critical ? 0.28 : 0.2);
    const foeReach = FOE_X - (HEAD_X + 3.4);
    foe.position.x = FOE_X - Math.max(0, foeLunge) * foeReach + (foeLunge < 0 ? -foeLunge * 1.8 : 0);
    foe.position.y = 2.7 + bob - easeIn(dying || (dead ? 1 : 0)) * 2.4 + (critical ? Math.sin(t * 14) * 0.05 : 0);
    foe.rotation.z = (dying || dead) ? easeIn(dying || 1) * 1.15 : Math.sin(t * 1.4) * 0.04;
    foe.rotation.y = Math.sin(t * 0.8) * 0.06;

    const ff = f.foeFlash || 0;
    foeShellMats.forEach((m, i) => {
      m.color.copy(foeBaseColors[i]);
      if (critical) m.color.lerp(CRIT_COLOR, 0.55);
      if (ff > 0.02) m.color.lerp(FLASH_COLOR, Math.min(1, ff));
    });

    const hp01 = f.hp01 === undefined ? 1 : f.hp01;
    coreMat.color.setHex(critical ? 0xf59e0b : 0xe02424);
    coreMat.opacity = dead ? 0 : (0.35 + hp01 * 0.55) * (critical ? 0.7 + 0.3 * Math.abs(Math.sin(t * 6)) : 1);
    core.scale.setScalar(0.85 + hp01 * 0.3);
    coreBack.scale.copy(core.scale);
    foeEyes.forEach(e => {
      e.material.color.setHex(dead ? 0x94a3b8 : critical ? 0xf59e0b : 0xe02424);
      e.visible = !dead;
    });
    foeGlow.position.copy(foe.position);
    foeGlow.color.setHex(critical ? 0xfbbf24 : 0xf87171);
    foeGlow.intensity = dead ? 0 : 3 + hp01 * 5;

    const legSpeed = critical ? 8 : 4.5;
    legs.forEach(({ g, s, i }) => {
      g.rotation.x = Math.sin(t * legSpeed + i * 1.3 + (s > 0 ? 0 : 1.6)) * (dead ? 0.02 : 0.3);
    });
    wings.forEach(({ pivot, s }) => {
      pivot.rotation.x = s * (0.35 + Math.sin(t * (critical ? 26 : 16)) * 0.3);
      pivot.rotation.y = s * 0.2;
    });
    const chomp = Math.abs(Math.sin(t * (critical ? 7 : 3.6))) * 0.25 + (foeLunge > 0.5 ? 0.4 : 0);
    mandibles.forEach(({ mesh, s }) => {
      mesh.rotation.z = -Math.PI / 2 - 0.25;
      mesh.rotation.y = s * (0.35 + chomp);
    });

    // fade out on death
    const fade = dead ? 0 : (dying ? 1 - Math.max(0, (dying - 0.5) / 0.5) : 1);
    foe.visible = fade > 0.01;
    foe.traverse(o => {
      if (o.isMesh && o.material && o.material.transparent !== undefined) {
        if (o.material === coreMat) return;
        const isWing = !!(wings[0] && o.material === wings[0].pivot.children[0].material);
        o.material.transparent = isWing || fade < 1;
        o.material.opacity = isWing ? 0.35 * fade : fade;
      }
    });

    /* --- smoke while critical --- */
    if (critical && !dead && Math.random() < dt * 16) {
      parts.push({
        x: foe.position.x + (Math.random() - .5) * 3, y: foe.position.y + 1.4, z: (Math.random() - .5) * 2,
        vx: (Math.random() - .5) * 0.6, vy: 1.6 + Math.random(), vz: (Math.random() - .5) * 0.6,
        life: 1, r: 0.58, g: 0.64, b: 0.72
      });
    }

    /* --- particles --- */
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 11 * dt;
      p.life -= dt * 1.15;
      if (p.life <= 0 || p.y < 0) parts.splice(i, 1);
    }
    for (let i = 0; i < MAXP; i++) {
      const p = parts[i];
      if (p) {
        pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
        // fade toward the light floor instead of toward black
        pCol[i * 3] = BG_RGB.r + (p.r - BG_RGB.r) * p.life;
        pCol[i * 3 + 1] = BG_RGB.g + (p.g - BG_RGB.g) * p.life;
        pCol[i * 3 + 2] = BG_RGB.b + (p.b - BG_RGB.b) * p.life;
      } else {
        pPos[i * 3 + 1] = -999;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    /* --- float labels --- */
    for (let i = floats.length - 1; i >= 0; i--) {
      const fl = floats[i];
      fl.life -= dt * 0.7;
      fl.sp.position.y += dt * 1.5;
      fl.sp.material.opacity = Math.max(0, fl.life);
      if (fl.life <= 0) { scene.remove(fl.sp); fl.sp.material.map.dispose(); fl.sp.material.dispose(); floats.splice(i, 1); }
    }

    /* --- status tag --- */
    if (f.status !== statusText) {
      statusText = f.status || '';
      if (statusSprite.material.map) statusSprite.material.map.dispose();
      if (statusText) {
        const c = document.createElement('canvas');
        const g0 = c.getContext('2d');
        const font = '700 54px "JetBrains Mono", Consolas, monospace';
        g0.font = font;
        const w = Math.ceil(g0.measureText(statusText).width) + 64;
        c.width = w; c.height = 128;
        const g = c.getContext('2d');
        g.font = font;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = statusText.toLowerCase().includes('critical') ? '#d97706' : '#15803d';
        g.shadowColor = 'rgba(15,23,42,.18)'; g.shadowBlur = 8;
        g.fillText(statusText, w / 2, 66);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        statusSprite.material.map = tex;
        statusSprite.material.needsUpdate = true;
        const sw = (w / 128) * 1.5;
        statusSprite.scale.set(sw, 1.5, 1);
      }
      statusSprite.visible = !!statusText;
    }
    if (statusSprite.visible) {
      statusSprite.position.set(FOE_X, dead ? 1.6 : 5.6, 0);
      statusSprite.material.opacity = statusText.toLowerCase().includes('critical')
        ? 0.55 + 0.45 * Math.abs(Math.sin(t * 4)) : 0.95;
    }

    /* --- camera: base framing + drag-to-look orbit + shake --- */
    const sh = f.shake || 0;
    orbit.yaw += (orbit.tYaw - orbit.yaw) * 0.14;
    orbit.pitch += (orbit.tPitch - orbit.pitch) * 0.14;
    if (!orbit.dragging) { orbit.tYaw *= 0.965; orbit.tPitch *= 0.965; }

    const bx = CAM_BASE.x;
    const by = camera.userData.baseY || CAM_BASE.y;
    const bz = camera.userData.baseZ || CAM_BASE.z;
    const ox = bx - CAM_LOOK.x, oy = by - CAM_LOOK.y, oz = bz - CAM_LOOK.z;
    const cy = Math.cos(orbit.yaw), sy = Math.sin(orbit.yaw);
    const rx = ox * cy + oz * sy, rz = -ox * sy + oz * cy;
    const flat = Math.hypot(rx, rz) || 1;
    const rad = Math.hypot(rx, rz, oy);
    const p = Math.max(-0.05, Math.min(0.7, Math.atan2(oy, flat) + orbit.pitch));
    const hr = Math.cos(p) * rad;
    const nx = CAM_LOOK.x + (rx / flat) * hr;
    const nz = CAM_LOOK.z + (rz / flat) * hr;
    const ny = CAM_LOOK.y + Math.sin(p) * rad;

    camera.position.x += ((nx + (Math.random() - .5) * sh) - camera.position.x) * 0.5;
    camera.position.y += ((ny + (Math.random() - .5) * sh) - camera.position.y) * 0.5;
    camera.position.z += (nz - camera.position.z) * 0.5;
    camera.lookAt(CAM_LOOK);
    if (IS_SHIP) camera.rotateZ(Math.sin(t * 0.7) * 0.012);   // the ship rocks gently
    renderer.render(scene, camera);
  }

  function easeIn(x) { return x * x; }

  /* ---------- drag to look around ---------- */
  // Cursor/touch-action live in lesson-activities.css (.fib-canvas);
  // this only toggles the .is-dragging class.
  const orbit = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, dragging: false, lx: 0, ly: 0 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function onPointerDown(e) {
    orbit.dragging = true; orbit.lx = e.clientX; orbit.ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  }
  function onPointerMove(e) {
    if (!orbit.dragging) return;
    orbit.tYaw = clamp(orbit.tYaw + (e.clientX - orbit.lx) * 0.0035, -0.42, 0.42);
    orbit.tPitch = clamp(orbit.tPitch + (e.clientY - orbit.ly) * 0.0025, -0.16, 0.3);
    orbit.lx = e.clientX; orbit.ly = e.clientY;
  }
  function endOrbit() { orbit.dragging = false; canvas.classList.remove('is-dragging'); }
  function resetOrbit() { orbit.tYaw = 0; orbit.tPitch = 0; }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endOrbit);
  canvas.addEventListener('pointercancel', endOrbit);
  canvas.addEventListener('dblclick', resetOrbit);

  /* ---------- cleanup ---------- */
  function dispose() {
    stageGone = true;
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endOrbit);
    canvas.removeEventListener('pointercancel', endOrbit);
    canvas.removeEventListener('dblclick', resetOrbit);
    floats.forEach(fl => scene.remove(fl.sp));
    floats.length = 0;
    cobraModel.dispose();
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
  }

  /* ---------- warm-up ---------- */
  // The very first frame is by far the most expensive one: the browser
  // compiles every shader of this scene, uploads its textures and builds
  // the shadow map inside it, and the page cannot respond meanwhile. The
  // game used to hit that right as its Start card appeared. warmUp() does
  // the work earlier, while the game still shows its "Loading..." card:
  //   1. the shaders are requested ahead of time - compiled in the
  //      background where the browser can (KHR_parallel_shader_compile);
  //   2. one frame is drawn, which finishes whatever is left.
  // It resolves when the stage is ready to draw smoothly and never rejects
  // (if anything goes wrong, the first real frame does the work as before).
  let stageGone = false;   // dispose() ran - a warm-up still waiting must not draw
  function warmUp() {
    const prime = () => {
      if (stageGone) return;
      try { renderer.render(scene, camera); } catch (err) { /* first real frame does it */ }
    };
    try {
      if (typeof renderer.compileAsync === 'function') {
        return renderer.compileAsync(scene, camera).then(prime, prime);
      }
    } catch (err) { /* fall through */ }
    prime();
    return Promise.resolve();
  }

  resize();

  return { render, burst, float, resize, dispose, holdIntro, playIntro, skipIntro, warmUp };
}