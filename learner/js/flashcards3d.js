/* ============================================================
   flashcards3d.js — Three.js stage for the CobraByte Flashcards
   activity: "Cobra's Card Duel" (Cobra vs NullScorpion).

   Deliberately different from the Fill in the Blanks battle:
     - the cobra sits COILED with its head reared high (not stretched)
     - the foe is NullScorpion: pincers + an arched tail with a glowing
       stinger that strikes from above (not a biting beetle)
     - a big flashcard floats between them. A right answer flips it
       to its back and the cobra flicks it like a throwing star into
       the scorpion (-1 HP); a wrong answer snaps it shut while the
       scorpion stings the cobra (-1 life)
     - a deck of remaining cards sits by the scorpion and the cards the
       cobra won stack up beside the cobra

   Scenery (forest / ship) comes from scenery3d.js, the same as
   battle3d.js, following the chapter's side on the Learning Map.

   createFlashStage(canvas, { terrain }) -> api
     api.setCard(label, front, back)   repaint the floating card
     api.render(frame)                 draw one frame
     api.burst(where, color, n)        where = 'hero' | 'foe' | 'card'
     api.float(where, text, color)
     api.holdIntro() / playIntro() / skipIntro()
     api.resize() / api.dispose()
   frame = {
     t, cardFlip (0 front .. 1 back), cardThrow (0..1 flying to foe),
     cardShake (0..1), cardGlow ('ok' | 'close' | 'bad' | ''),
     heroFlick (0..1), sting (0..1), heroFlash, foeFlash, shake,
     hp01, critical, dying, dead, heroDown, collected, remaining, status
   }
   ============================================================ */
import * as THREE from './three.module.js';
import { createScenery } from './scenery3d.js';
import { createCobra } from './cobra3d.js';


export function createFlashStage(canvas, opts = {}) {
  const terrain = opts.terrain === 'water' ? 'water' : 'land';
  const BG = terrain === 'water' ? 0x5a3d25 : 0xdcebd0;

  /* ---------- core ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, terrain === 'water' ? 30 : 26, terrain === 'water' ? 80 : 62);

  const camera = new THREE.PerspectiveCamera(42, 4, 0.1, 200);
  const CAM_BASE = new THREE.Vector3(0.5, 4.6, 14.5);
  const CAM_LOOK = new THREE.Vector3(0.5, 2.9, 0);

  /* ---------- lights ---------- */
  scene.add(terrain === 'water'
    ? new THREE.HemisphereLight(0xffe7c2, 0x3b2616, 0.8)
    : new THREE.HemisphereLight(0xf7fbe9, 0x3f5f2a, 0.95));
  const key = new THREE.DirectionalLight(terrain === 'water' ? 0xffe0b0 : 0xfff1d0, terrain === 'water' ? 0.9 : 1.2);
  key.position.set(-8, 14, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -22; key.shadow.camera.right = 22;
  key.shadow.camera.top = 16; key.shadow.camera.bottom = -10;
  key.shadow.camera.far = 60;
  scene.add(key);
  const rim = new THREE.DirectionalLight(terrain === 'water' ? 0xffc27a : 0xd9f99d, 0.35);
  rim.position.set(12, 6, -10);
  scene.add(rim);

  const heroGlow = new THREE.PointLight(0x22d3ee, 5, 12, 2);
  scene.add(heroGlow);
  const foeGlow = new THREE.PointLight(0xa78bfa, 6, 14, 2);
  scene.add(foeGlow);
  const cardLight = new THREE.PointLight(0xffffff, 0, 9, 2);
  scene.add(cardLight);

  /* ---------- scenery (forest / ship) ---------- */
  const scenery3d = createScenery(scene, terrain);
  const IS_SHIP = scenery3d.isShip;

  /* ---------- the coiled cobra ---------- */
  const COIL_X = -7.2, COIL_Z = 0.6;
  const COIL_SEGS = 34, NECK_SEGS = 12;
  const SEGS = COIL_SEGS + NECK_SEGS;
  const cobra = new THREE.Group();
  scene.add(cobra);

  // shared model (cobra3d.js): scaled coil, rearing neck, spectacle hood
  const cobraModel = createCobra({ headScale: 2.7, maxPoints: SEGS });
  cobra.add(cobraModel.group);
  const cobraRadii = [];
  for (let i = 0; i < SEGS; i++) {
    cobraRadii.push(i < COIL_SEGS ? 0.36 + 0.36 * (i / COIL_SEGS) : 0.72 - 0.1 * ((i - COIL_SEGS) / NECK_SEGS));
  }

  /* ---------- NullScorpion ---------- */
  const FOE_X = 7.4;
  const foe = new THREE.Group();
  foe.position.set(FOE_X, 0, 0.3);
  foe.scale.setScalar(1.3);
  scene.add(foe);

  const shellMat = new THREE.MeshStandardMaterial({ color: 0x5b21b6, roughness: 0.32, metalness: 0.45 });
  const shellDarkMat = new THREE.MeshStandardMaterial({ color: 0x2e1065, roughness: 0.4, metalness: 0.4 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.6, metalness: 0.3 });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.3, metalness: 0.5 });
  const stingMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.8, roughness: 0.3 });

  // segmented body (head end faces -x, toward the cobra)
  const bodyParts = [];
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), i % 2 ? shellDarkMat : shellMat);
    seg.scale.set(0.75, 0.45, 0.95 - i * 0.06);
    seg.position.set(-1.0 + i * 0.95, 0.95, 0);
    seg.castShadow = true;
    foe.add(seg);
    bodyParts.push(seg);
  }
  const fhead = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), shellMat);
  fhead.scale.set(0.6, 0.42, 0.72);
  fhead.position.set(-1.85, 0.95, 0);
  fhead.castShadow = true;
  foe.add(fhead);
  const foeEyeMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
  const foeEyes = [];
  [[-2.3, 1.12, 0.22], [-2.3, 1.12, -0.22], [-2.2, 1.25, 0.1], [-2.2, 1.25, -0.1]].forEach(([x, y, z]) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), foeEyeMat);
    e.position.set(x, y, z);
    foe.add(e);
    foeEyes.push(e);
  });

  // pincers
  const pincers = [];
  [-1, 1].forEach(s => {
    const arm = new THREE.Group();
    arm.position.set(-1.9, 0.9, s * 0.7);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 1.3, 8), clawMat);
    upper.rotation.z = Math.PI / 2;
    upper.position.set(-0.6, 0, s * 0.35);
    upper.rotation.y = s * 0.5;
    upper.castShadow = true;
    arm.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), clawMat);
    hand.scale.set(1.2, 0.8, 0.9);
    hand.position.set(-1.25, 0.05, s * 0.7);
    hand.castShadow = true;
    arm.add(hand);
    const jaws = [];
    [-1, 1].forEach(j => {
      const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 8), shellDarkMat);
      jaw.rotation.z = Math.PI / 2;
      jaw.position.set(-1.75, 0.05, s * 0.7 + j * 0.13);
      arm.add(jaw);
      jaws.push({ jaw, j });
    });
    foe.add(arm);
    pincers.push({ arm, s, jaws });
  });

  // eight legs
  const legs = [];
  [-1, 1].forEach(s => {
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.set(-1.1 + i * 0.75, 0.85, s * 0.6);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.9, 6), legMat);
      upper.position.set(0, 0.1, s * 0.4);
      upper.rotation.x = -s * 1.1;
      g.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 1.0, 6), legMat);
      lower.position.set(0, -0.45, s * 0.85);
      lower.rotation.x = s * 0.35;
      lower.castShadow = true;
      g.add(lower);
      foe.add(g);
      legs.push({ g, s, i });
    }
  });

  // arched tail: 9 segments from the back of the body, curling up and forward
  const tailRoot = new THREE.Group();
  tailRoot.position.set(1.95, 1.0, 0);
  foe.add(tailRoot);
  const tailSegs = [];
  for (let i = 0; i < 9; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.36 - i * 0.02, 14, 10), i % 2 ? shellMat : shellDarkMat);
    seg.scale.set(1.2, 1, 1);
    seg.castShadow = true;
    tailRoot.add(seg);
    tailSegs.push(seg);
  }
  const stinger = new THREE.Group();
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), stingMat);
  stinger.add(bulb);
  const barb = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 8), stingMat);
  barb.position.set(-0.3, -0.25, 0);
  barb.rotation.z = Math.PI * 0.8;
  stinger.add(barb);
  tailRoot.add(stinger);
  const stingLight = new THREE.PointLight(0xfbbf24, 2.5, 5, 2);
  stinger.add(stingLight);

  const foeMats = [shellMat, shellDarkMat, clawMat];
  const foeBaseColors = foeMats.map(m => m.color.clone());
  const HURT_COLOR = new THREE.Color(0xf87171);
  const CRIT_COLOR = new THREE.Color(0xef4444);
  const FLASH_COLOR = new THREE.Color(0xffffff);

  /* ---------- the flashcard ---------- */
  const CARD_HOME = new THREE.Vector3(0.4, 4.6, 1.4);
  const CARD_W = 4.6, CARD_H = 3.0;
  const cardPivot = new THREE.Group();
  scene.add(cardPivot);
  const cardBody = new THREE.Mesh(
    new THREE.BoxGeometry(CARD_W + 0.12, CARD_H + 0.12, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 })
  );
  cardBody.castShadow = true;
  cardPivot.add(cardBody);

  function makeFaceTexture() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 664;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { c, tex };
  }
  const frontFace = makeFaceTexture();
  const backFace = makeFaceTexture();
  const frontMesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: frontFace.tex, toneMapped: false }));
  frontMesh.position.z = 0.035;
  cardPivot.add(frontMesh);
  const backMesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H),
    new THREE.MeshBasicMaterial({ map: backFace.tex, toneMapped: false }));
  backMesh.position.z = -0.035;
  backMesh.rotation.y = Math.PI;
  cardPivot.add(backMesh);

  const glowRing = new THREE.Mesh(
    new THREE.PlaneGeometry(CARD_W + 1.1, CARD_H + 1.1),
    new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  glowRing.position.z = 0;   // inside the card body, so only the rim shows as a halo
  cardPivot.add(glowRing);

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Wraps `text` into the card, shrinking the font until it fits.
  function paintFace(face, label, text, back) {
    const g = face.c.getContext('2d');
    const W = face.c.width, H = face.c.height;
    g.clearRect(0, 0, W, H);
    g.fillStyle = back ? '#f0fdf4' : '#ffffff';
    roundRect(g, 0, 0, W, H, 48);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = back ? '#16a34a' : '#cbd5e1';
    roundRect(g, 14, 14, W - 28, H - 28, 40);
    g.stroke();

    g.fillStyle = back ? '#15803d' : '#64748b';
    g.font = '800 44px Inter, system-ui, sans-serif';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.fillText(label, 60, 48);

    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
    let size = 132, lines = [];
    const maxW = W - 140, maxH = H - 200;
    while (size >= 30) {
      g.font = `800 ${size}px Inter, system-ui, sans-serif`;
      lines = [];
      let line = '';
      words.forEach(word => {
        const tryLine = line ? `${line} ${word}` : word;
        if (g.measureText(tryLine).width > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = tryLine;
        }
      });
      if (line) lines.push(line);
      const tooWide = lines.some(l => g.measureText(l).width > maxW);
      if (!tooWide && lines.length * size * 1.2 <= maxH) break;
      size -= 6;
    }
    g.fillStyle = back ? '#14532d' : '#0f172a';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lineH = size * 1.2;
    const startY = 130 + (H - 160) / 2 - ((lines.length - 1) * lineH) / 2;
    lines.slice(0, 8).forEach((l, i) => g.fillText(l, W / 2, startY + i * lineH));
    face.tex.needsUpdate = true;
  }

  function setCard(label, front, back) {
    paintFace(frontFace, label || 'Card', front, false);
    paintFace(backFace, 'Answer', back || '?', true);
  }
  setCard('Card', '', '?');

  /* ---------- card piles (deck by the scorpion, winnings by the cobra) ---------- */
  const pileGeo = new THREE.BoxGeometry(1.4, 0.07, 0.95);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6d28d9, roughness: 0.6 });
  const wonMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 });
  const MAX_PILE = 14;
  function makePile(mat, x, z) {
    const meshes = [];
    for (let i = 0; i < MAX_PILE; i++) {
      const m = new THREE.Mesh(pileGeo, mat);
      m.position.set(x + (Math.random() - 0.5) * 0.08, 0.05 + i * 0.08, z + (Math.random() - 0.5) * 0.08);
      m.rotation.y = (Math.random() - 0.5) * 0.25;
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      meshes.push(m);
    }
    return meshes;
  }
  const deckPile = makePile(deckMat, 11.2, 3.2);
  const wonPile = makePile(wonMat, -3.8, 3.4);

  /* ---------- particles + floating labels ---------- */
  const MAXP = 420;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
    size: 0.3, vertexColors: true, transparent: true, fog: false, depthWrite: false
  }));
  scene.add(points);
  const parts = [];
  const BG_RGB = new THREE.Color(BG);

  const floats = [];
  function makeTextSprite(text, color, size = 88) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 160;
    const g = c.getContext('2d');
    g.font = `800 ${size}px Inter, system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color;
    g.shadowColor = 'rgba(15,23,42,.25)'; g.shadowBlur = 8;
    g.fillText(text, 256, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false }));
    sp.scale.set(4.2, 1.3, 1);
    return sp;
  }

  const anchors = {
    hero: new THREE.Vector3(COIL_X + 1.6, 3.6, COIL_Z),
    foe: new THREE.Vector3(FOE_X - 0.5, 1.6, 0.3),
    card: CARD_HOME.clone()
  };

  function burst(where, colorHex, n = 26) {
    const a = anchors[where] || anchors.foe;
    const col = new THREE.Color(colorHex);
    for (let i = 0; i < n && parts.length < MAXP; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI;
      const sp = 3 + Math.random() * 8;
      parts.push({
        x: a.x + (Math.random() - .5), y: a.y + (Math.random() - .5), z: a.z + (Math.random() - .5),
        vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp * 0.8 + 3, vz: Math.sin(ph) * Math.sin(th) * sp,
        life: 1, r: col.r, g: col.g, b: col.b
      });
    }
  }

  function float(where, text, color) {
    const a = anchors[where] || anchors.foe;
    const sp = makeTextSprite(text, color);
    sp.position.set(a.x, a.y + 2.2, a.z);
    scene.add(sp);
    floats.push({ sp, life: 1 });
  }

  /* ---------- slither-in intro ---------- */
  const INTRO_DIST = 16, INTRO_SECS = 2.1;
  const intro = { hold: false, start: null };
  let lastT = 0;
  function holdIntro() { intro.hold = true; intro.start = null; }
  function playIntro() { intro.hold = false; intro.start = lastT; }
  function skipIntro() { intro.hold = false; intro.start = null; }
  function introOffset(t) {
    if (intro.hold) return -INTRO_DIST;
    if (intro.start === null) return 0;
    const p = (t - intro.start) / INTRO_SECS;
    if (p >= 1) { intro.start = null; return 0; }
    return -INTRO_DIST * Math.pow(1 - Math.max(0, p), 3);
  }

  function resize() {
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const framing = Math.min(1.9, Math.max(0.62, 3.3 / camera.aspect));
    camera.userData.baseY = CAM_BASE.y + framing * 1.6;
    camera.userData.baseZ = CAM_BASE.z * (0.72 + framing * 0.4);
    camera.position.set(CAM_BASE.x, camera.userData.baseY, camera.userData.baseZ);
    camera.updateProjectionMatrix();
  }

  function easeIn(x) { return x * x; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  /* ---------- per-frame ---------- */
  const tmpA = new THREE.Vector3();
  function render(f) {
    const t = f.t || 0;
    const dt = Math.min(0.05, Math.max(0, t - lastT)) || 0.016;
    lastT = t;

    const down = !!f.heroDown;
    const dead = !!f.dead;
    const dying = f.dying || 0;
    const critical = !!f.critical;
    const flick = f.heroFlick || 0;
    const sting = f.sting || 0;

    /* --- coiled cobra --- */
    const slide = introOffset(t);
    const entering = slide < -0.01;
    const baseX = COIL_X + slide;
    const breathe = Math.sin(t * 2.2) * 0.06;
    const neckTop = down ? 0.7 : 3.4 + breathe + flick * 0.35;
    const lean = down ? 0.6 : 1.3 + flick * 1.4 - (sting > 0.4 && sting < 0.7 ? 0.5 : 0);
    const pts = [];
    for (let i = 0; i < COIL_SEGS; i++) {
      // spiral from the outer tail inward, lying on the ground
      const s = i / (COIL_SEGS - 1);
      const ang = -Math.PI * 0.5 + s * Math.PI * 2 * 2.1 + (entering ? t * 6 : 0) * 0.15;
      const r = 2.1 - s * 1.35;
      const y = 0.32 + s * 0.35 + (i % 2 ? 0.02 : 0);
      pts.push(new THREE.Vector3(baseX + Math.cos(ang) * r, y, COIL_Z + Math.sin(ang) * r * 0.8));
    }
    const coilEnd = pts[COIL_SEGS - 1];
    for (let i = 0; i < NECK_SEGS; i++) {
      // neck rises out of the middle of the coil and bends toward the foe
      const s = (i + 1) / NECK_SEGS;
      const sway = Math.sin(t * 1.8 + s * 2) * 0.12 * (1 - s * 0.3) * (down ? 0.2 : 1);
      pts.push(new THREE.Vector3(
        coilEnd.x + Math.pow(s, 1.6) * lean,
        coilEnd.y + Math.sin(s * Math.PI * 0.5) * (neckTop - coilEnd.y),
        coilEnd.z * (1 - s) + COIL_Z * s + sway
      ));
    }
    const hp0 = pts[SEGS - 1];
    const hf = f.heroFlash || 0;
    cobraModel.update({
      points: pts, radii: cobraRadii, t, dt,
      down,
      flare: flick,
      hurt: Math.min(1, hf),
    });
    heroGlow.position.set(hp0.x - 1.5, hp0.y - 1.2, -1.2);
    heroGlow.intensity = down ? 0.5 : 2 + Math.sin(t * 3) * 0.6;
    anchors.hero.set(hp0.x, hp0.y, hp0.z);

    /* --- scenery --- */
    scenery3d.update(t, entering);

    /* --- NullScorpion --- */
    const dieP = dying || (dead ? 1 : 0);
    const scuttle = Math.sin(t * (critical ? 5 : 2.2)) * 0.12;
    foe.position.x = FOE_X + scuttle - (sting > 0.3 && sting < 0.75 ? 0.6 : 0);
    foe.position.y = -easeIn(dieP) * 0.6;
    foe.rotation.z = dieP ? easeIn(dieP) * Math.PI * 0.9 : 0;   // flips onto its back
    foe.rotation.y = Math.sin(t * 0.7) * 0.05;
    const ff = f.foeFlash || 0;
    foeMats.forEach((m, i) => {
      m.color.copy(foeBaseColors[i]);
      if (critical) m.color.lerp(CRIT_COLOR, 0.45);
      if (ff > 0.02) m.color.lerp(FLASH_COLOR, Math.min(1, ff));
    });
    legs.forEach(({ g, s, i }) => {
      g.rotation.x = Math.sin(t * (critical ? 9 : 5) + i * 1.4 + (s > 0 ? 0 : 1.7)) * (dead ? 0.02 : 0.22);
    });
    const snap = Math.abs(Math.sin(t * (critical ? 6 : 2.6)));
    pincers.forEach(({ arm, s, jaws }) => {
      arm.rotation.y = s * (0.15 + Math.sin(t * 1.6 + s) * 0.08);
      jaws.forEach(({ jaw, j }) => { jaw.rotation.y = j * (0.15 + snap * 0.35); });
    });

    // tail: an arch that whips forward and down on a sting
    const strike = sting < 0.35 ? -0.2 * easeOut(sting / 0.35)
      : sting < 0.55 ? easeIn((sting - 0.35) / 0.2)
      : sting < 0.7 ? 1 : 1 - easeOut((sting - 0.7) / 0.3);
    const tailSway = Math.sin(t * 2.4) * 0.06;
    // the tail is an arc of a circle standing on the root: it rises
    // behind the body and curls forward over the back; a sting swings
    // the arc further so the stinger stabs forward and down.
    const TR = 1.15 + Math.max(0, strike) * 0.35;
    const sweep = Math.PI * (1.3 + strike * 0.12) + tailSway;
    tailRoot.rotation.z = Math.max(0, strike) * 0.4;    // the whole arch whips forward
    let endA = 0;
    for (let i = 0; i < tailSegs.length; i++) {
      const s = (i + 1) / (tailSegs.length + 1);
      const a = -Math.PI / 2 + s * sweep;
      tailSegs[i].position.set(Math.cos(a) * TR, TR + Math.sin(a) * TR, 0);
    }
    endA = -Math.PI / 2 + sweep;
    stinger.position.set(Math.cos(endA) * TR * 1.08, TR + Math.sin(endA) * TR * 1.08, 0);
    stinger.rotation.z = endA - Math.PI / 2;
    stingMat.emissiveIntensity = dead ? 0 : (critical ? 0.6 + 0.6 * Math.abs(Math.sin(t * 8)) : 0.8);
    stingLight.intensity = dead ? 0 : 2 + strike * 5;
    foeEyes.forEach(e => {
      e.material.color.setHex(dead ? 0x94a3b8 : critical ? 0xf59e0b : 0x22d3ee);
    });
    foeGlow.position.set(foe.position.x, 2.6, 2.5);
    foeGlow.intensity = dead ? 0 : 2.5 + (f.hp01 === undefined ? 1 : f.hp01) * 3;
    const fade = dead ? 0 : (dying ? 1 - Math.max(0, (dying - 0.55) / 0.45) : 1);
    foe.visible = fade > 0.02;
    foe.traverse(o => {
      if (o.isMesh && o.material) {
        o.material.transparent = fade < 1;
        o.material.opacity = fade;
      }
    });

    /* --- the flashcard --- */
    const flip = Math.max(0, Math.min(1, f.cardFlip || 0));
    const thr = Math.max(0, Math.min(1, f.cardThrow || 0));
    const shakeC = f.cardShake || 0;
    const bob = Math.sin(t * 1.6) * 0.12;
    const target = tmpA.set(FOE_X - 1.2, 1.4, 0.4);
    cardPivot.position.set(
      CARD_HOME.x + (target.x - CARD_HOME.x) * easeIn(thr) + Math.sin(t * 60) * 0.14 * shakeC,
      CARD_HOME.y + bob * (1 - thr) + (target.y - CARD_HOME.y) * easeIn(thr) + Math.sin(thr * Math.PI) * 1.2,
      CARD_HOME.z + (target.z - CARD_HOME.z) * thr
    );
    cardPivot.rotation.y = flip * Math.PI + thr * Math.PI * 4;
    cardPivot.rotation.z = Math.sin(t * 1.1) * 0.03 + thr * 0.6;
    const cardScale = 1 - thr * 0.55;
    cardPivot.scale.setScalar(cardScale);
    cardPivot.visible = thr < 0.98;
    const glowHex = f.cardGlow === 'ok' ? 0x22c55e : f.cardGlow === 'close' ? 0xf59e0b : f.cardGlow === 'bad' ? 0xef4444 : 0;
    glowRing.material.color.setHex(glowHex || 0x22c55e);
    glowRing.material.opacity = glowHex ? 0.7 + 0.25 * Math.sin(t * 8) : 0;
    cardLight.color.setHex(glowHex || 0xffffff);
    cardLight.intensity = glowHex ? 5 : 1.2;
    cardLight.position.set(cardPivot.position.x, cardPivot.position.y, 3);
    anchors.card.copy(cardPivot.position);

    /* --- piles --- */
    const remaining = Math.max(0, Math.min(MAX_PILE, f.remaining || 0));
    const collected = Math.max(0, Math.min(MAX_PILE, f.collected || 0));
    deckPile.forEach((m, i) => { m.visible = i < remaining; });
    wonPile.forEach((m, i) => { m.visible = i < collected; });

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
        pCol[i * 3] = BG_RGB.r + (p.r - BG_RGB.r) * p.life;
        pCol[i * 3 + 1] = BG_RGB.g + (p.g - BG_RGB.g) * p.life;
        pCol[i * 3 + 2] = BG_RGB.b + (p.b - BG_RGB.b) * p.life;
      } else {
        pPos[i * 3 + 1] = -999;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;

    for (let i = floats.length - 1; i >= 0; i--) {
      const fl = floats[i];
      fl.life -= dt * 0.7;
      fl.sp.position.y += dt * 1.5;
      fl.sp.material.opacity = Math.max(0, fl.life);
      if (fl.life <= 0) { scene.remove(fl.sp); fl.sp.material.map.dispose(); fl.sp.material.dispose(); floats.splice(i, 1); }
    }

    /* --- camera: framing + drag-to-look + shake (+ ship rocking) --- */
    const sh = f.shake || 0;
    orbit.yaw += (orbit.tYaw - orbit.yaw) * 0.14;
    orbit.pitch += (orbit.tPitch - orbit.pitch) * 0.14;
    if (!orbit.dragging) { orbit.tYaw *= 0.965; orbit.tPitch *= 0.965; }
    const by = camera.userData.baseY || CAM_BASE.y;
    const bz = camera.userData.baseZ || CAM_BASE.z;
    const ox = CAM_BASE.x - CAM_LOOK.x, oy = by - CAM_LOOK.y, oz = bz - CAM_LOOK.z;
    const cy = Math.cos(orbit.yaw), sy = Math.sin(orbit.yaw);
    const rx = ox * cy + oz * sy, rz = -ox * sy + oz * cy;
    const flat = Math.hypot(rx, rz) || 1;
    const rad = Math.hypot(rx, rz, oy);
    const pch = Math.max(-0.05, Math.min(0.7, Math.atan2(oy, flat) + orbit.pitch));
    const hr = Math.cos(pch) * rad;
    const nx = CAM_LOOK.x + (rx / flat) * hr;
    const nz = CAM_LOOK.z + (rz / flat) * hr;
    const ny = CAM_LOOK.y + Math.sin(pch) * rad;
    camera.position.x += ((nx + (Math.random() - .5) * sh) - camera.position.x) * 0.5;
    camera.position.y += ((ny + (Math.random() - .5) * sh) - camera.position.y) * 0.5;
    camera.position.z += (nz - camera.position.z) * 0.5;
    camera.lookAt(CAM_LOOK);
    if (IS_SHIP) camera.rotateZ(Math.sin(t * 0.7) * 0.012);
    renderer.render(scene, camera);
  }

  /* ---------- drag to look around ---------- */
  // Cursor/touch-action live in lesson-flashcards.css (.fc-canvas).
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
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endOrbit);
    canvas.removeEventListener('pointercancel', endOrbit);
    canvas.removeEventListener('dblclick', resetOrbit);
    floats.forEach(fl => scene.remove(fl.sp));
    floats.length = 0;
    cobraModel.dispose();
    const geos = new Set(), mats = new Set(), maps = new Set();
    scene.traverse(o => {
      if (o.geometry) geos.add(o.geometry);
      (Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])).forEach(m => {
        mats.add(m);
        if (m.map) maps.add(m.map);
      });
    });
    geos.forEach(g => g.dispose());
    maps.forEach(m => m.dispose());
    mats.forEach(m => m.dispose());
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  resize();

  return { setCard, render, burst, float, resize, dispose, holdIntro, playIntro, skipIntro };
}