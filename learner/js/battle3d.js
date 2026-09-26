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

const COBRA_MID   = 0x16a34a;
const COBRA_DARK  = 0x15803d;
const COBRA_LIGHT = 0x22c55e;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  const heroGlow = new THREE.PointLight(0x22c55e, 6, 14, 2);
  heroGlow.position.set(-5, 2, 2);
  scene.add(heroGlow);

  const foeGlow = new THREE.PointLight(0xf87171, 8, 16, 2);
  scene.add(foeGlow);

  /* ---------- terrain: 'land' = forest clearing, 'water' = inside a wooden ship ---------- */
  const IS_SHIP = O.terrain === 'water';

  // seeded random so the scenery is the same every time this stage opens
  let seed = IS_SHIP ? 4242 : 1717;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  function canvasTexture(draw, w = 256, h = 256) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function grassTexture() {
    return canvasTexture((g, w, h) => {
      g.fillStyle = '#7fb152';
      g.fillRect(0, 0, w, h);
      const blades = ['#6a9e3f', '#9ccc65', '#5f8f36', '#a7d36f', '#76a94a'];
      for (let n = 0; n < 1600; n++) {
        const x = Math.random() * w, y = Math.random() * h;
        g.strokeStyle = blades[(Math.random() * blades.length) | 0];
        g.globalAlpha = 0.35 + Math.random() * 0.45;
        g.lineWidth = 1 + Math.random();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 7);
        g.stroke();
      }
      g.globalAlpha = 1;
    });
  }

  function plankTexture(tones, seam) {
    return canvasTexture((g, w, h) => {
      const plankH = 32;
      for (let row = 0; row < h / plankH; row++) {
        const y = row * plankH;
        g.fillStyle = tones[(Math.random() * tones.length) | 0];
        g.fillRect(0, y, w, plankH);
        g.strokeStyle = 'rgba(40, 22, 10, 0.18)';
        g.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          const gy = y + 3 + Math.random() * (plankH - 6);
          g.beginPath();
          g.moveTo(0, gy);
          g.bezierCurveTo(80, gy + (Math.random() - 0.5) * 4, 170, gy + (Math.random() - 0.5) * 4, w, gy);
          g.stroke();
        }
        g.fillStyle = seam;
        g.fillRect(0, y, w, 2);
        const joint = (row % 2 ? 64 : 192) + ((Math.random() - 0.5) * 20) | 0;
        g.fillRect(joint, y, 2, plankH);
        g.fillStyle = 'rgba(30, 20, 12, 0.55)';
        [joint - 6, joint + 8].forEach(nx => {
          g.beginPath(); g.arc(nx, y + 8, 1.6, 0, Math.PI * 2); g.fill();
          g.beginPath(); g.arc(nx, y + plankH - 8, 1.6, 0, Math.PI * 2); g.fill();
        });
      }
    });
  }

  const scenery = new THREE.Group();
  scene.add(scenery);
  const lanterns = [];
  const swayers = [];            // bushes / hanging things that sway a little

  function addBox(mat, w, h, d, x, y, z, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scenery.add(m);
    return m;
  }

  function makeClump(mats, size) {
    const grp = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const lobes = 4 + ((rand() * 3) | 0);
    for (let i = 0; i < lobes; i++) {
      const m = new THREE.Mesh(geo, mats[(rand() * mats.length) | 0]);
      const r = size * (0.45 + rand() * 0.35);
      m.scale.set(r, r * (0.75 + rand() * 0.25), r);
      m.position.set((rand() - 0.5) * size * 1.1, r * 0.55, (rand() - 0.5) * size * 0.9);
      m.castShadow = true;
      m.receiveShadow = true;
      grp.add(m);
    }
    return grp;
  }

  function buildForest() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 70),
      new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, metalness: 0 })
    );
    ground.material.map.repeat.set(40, 18);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scenery.add(ground);

    // a worn dirt path the fighters stand on
    const path = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 5.5),
      new THREE.MeshStandardMaterial({ color: 0xb59363, roughness: 1, transparent: true, opacity: 0.55 })
    );
    path.rotation.x = -Math.PI / 2;
    path.position.set(-1, 0.01, 0.2);
    path.receiveShadow = true;
    scenery.add(path);

    const bushMats = [0x2f6b2a, 0x3d7d32, 0x4a8b3a].map(color =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
    const crownMats = [0x2c5e2a, 0x356f30, 0x2a5626].map(color =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.38, 2.4, 7);
    const crownGeo = new THREE.ConeGeometry(1.7, 3.6, 8);

    // trees: a back row of forest, thinning toward the sides
    for (let i = 0; i < 46; i++) {
      const x = -34 + rand() * 68;
      const z = -7 - rand() * 16;
      const s = 0.9 + rand() * 1.0;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.2 * s;
      trunk.scale.setScalar(s);
      trunk.castShadow = true;
      tree.add(trunk);
      for (let k = 0; k < 3; k++) {
        const crown = new THREE.Mesh(crownGeo, crownMats[(rand() * crownMats.length) | 0]);
        const cs = s * (1.15 - k * 0.25);
        crown.scale.set(cs, cs, cs);
        crown.position.y = s * (3.2 + k * 1.4);
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.position.set(x, 0, z);
      tree.rotation.y = rand() * Math.PI;
      scenery.add(tree);
    }

    // bushes along the edge of the clearing
    for (let i = 0; i < 22; i++) {
      const clump = makeClump(bushMats, 1.1 + rand() * 0.8);
      clump.position.set(-26 + rand() * 52, 0, -4.5 - rand() * 2.5);
      scenery.add(clump);
      swayers.push({ obj: clump, phase: rand() * 6, amp: 0.02 });
    }

    // the big bush the cobra slithers out of (left edge of the view)
    const den = makeClump(bushMats, 2.4);
    den.scale.set(1.3, 1.1, 1.5);
    den.position.set(-14.8, 0, 0.3);
    scenery.add(den);
    swayers.push({ obj: den, phase: 0, amp: 0.015, den: true });

    // grass tufts + flowers
    const tuftGeo = new THREE.ConeGeometry(0.1, 0.55, 4);
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6fa844, roughness: 1 });
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 520);
    const flowerGeo = new THREE.SphereGeometry(0.12, 6, 5);
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.7 });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, 120);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 520; i++) {
      let x = -30 + rand() * 60, z = -6 + rand() * 12;
      if (Math.abs(z - 0.2) < 2.6 && Math.abs(x) < 16) z += z > 0.2 ? 2.6 : -2.6;   // keep the path clear
      pos.set(x, 0.25, z);
      q.setFromAxisAngle(up, rand() * Math.PI);
      const k = 0.7 + rand() * 0.9;
      sc.set(k, k, k);
      tufts.setMatrixAt(i, mtx.compose(pos, q, sc));
    }
    for (let i = 0; i < 120; i++) {
      pos.set(-30 + rand() * 60, 0.12, (rand() < 0.5 ? -5.5 + rand() * 2.5 : 3 + rand() * 4));
      q.identity();
      sc.set(1, 0.6, 1);
      flowers.setMatrixAt(i, mtx.compose(pos, q, sc));
    }
    tufts.receiveShadow = true;
    scenery.add(tufts, flowers);
  }

  function buildShip() {
    const deck = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 70),
      new THREE.MeshStandardMaterial({
        map: plankTexture(['#b98a55', '#c09260', '#b3824e', '#c89b69'], '#6b4423'),
        roughness: 0.95, metalness: 0
      })
    );
    deck.material.map.repeat.set(40, 18);
    deck.rotation.x = -Math.PI / 2;
    deck.receiveShadow = true;
    scenery.add(deck);

    const wallTex = plankTexture(['#6f4726', '#7a4f2a', '#684222'], '#2e1b0d');
    wallTex.center.set(0.5, 0.5);
    wallTex.rotation = Math.PI / 2;
    wallTex.repeat.set(3, 18);
    const hullMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x3f2614, roughness: 0.9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3c, roughness: 0.35, metalness: 0.8 });
    const seaMat = new THREE.MeshBasicMaterial({ color: 0x5fb4e6 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffc56b });

    // hull wall behind the fighters, ribbed, with portholes to the sea
    const backZ = -7;
    addBox(hullMat, 90, 14, 0.5, 0, 7, backZ, false);
    for (let x = -36; x <= 36; x += 4) addBox(beamMat, 0.5, 14, 0.5, x, 7, backZ + 0.45);
    addBox(beamMat, 90, 0.6, 0.8, 0, 9.6, backZ + 0.6);
    addBox(beamMat, 90, 0.5, 0.7, 0, 0.25, backZ + 0.6);

    const portGeo = new THREE.TorusGeometry(0.85, 0.16, 8, 26);
    const glassGeo = new THREE.CircleGeometry(0.82, 26);
    for (let x = -26; x <= 26; x += 8) {
      const ring = new THREE.Mesh(portGeo, brassMat);
      ring.position.set(x, 5.2, backZ + 0.35);
      scenery.add(ring);
      const glass = new THREE.Mesh(glassGeo, seaMat);
      glass.position.set(x, 5.2, backZ + 0.3);
      scenery.add(glass);
    }

    // lanterns between the portholes (warm, flickering)
    for (let x = -22; x <= 22; x += 8) {
      addBox(glowMat, 0.42, 0.6, 0.42, x, 6.2, backZ + 0.75, false);      // lit glass
      addBox(ironMat, 0.56, 0.1, 0.56, x, 6.55, backZ + 0.75, false);      // iron cap
      addBox(ironMat, 0.56, 0.1, 0.56, x, 5.85, backZ + 0.75, false);      // iron base
      addBox(ironMat, 0.08, 0.5, 0.08, x, 6.85, backZ + 0.75, false);      // hanger
      if (Math.abs(x) <= 14) {
        const light = new THREE.PointLight(0xffb45e, 7, 18, 2);
        light.position.set(x, 5.6, backZ + 2);
        scenery.add(light);
        lanterns.push({ light, base: 7, phase: rand() * 6 });
      }
    }

    // bulkhead on the left with the doorway the cobra slithers through
    const doorX = -15.5;
    addBox(hullMat, 0.6, 14, 6.4, doorX, 7, backZ + 3.2, false);
    addBox(hullMat, 0.6, 14, 8, doorX, 7, 6.2, false);
    addBox(hullMat, 0.6, 9.5, 2.3, doorX, 7 + 2.25, 1.2, false);
    addBox(beamMat, 0.8, 0.5, 3, doorX + 0.1, 4.3, 1.2);
    addBox(beamMat, 0.8, 4.3, 0.4, doorX + 0.1, 2.15, 0);
    addBox(beamMat, 0.8, 4.3, 0.4, doorX + 0.1, 2.15, 2.4);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 4.1), new THREE.MeshBasicMaterial({ color: 0x1c120a }));
    dark.rotation.y = Math.PI / 2;
    dark.position.set(doorX - 0.32, 2.05, 1.2);
    scenery.add(dark);

    // overhead beams across the hold
    for (let x = -24; x <= 24; x += 6) addBox(beamMat, 0.6, 0.6, 20, x, 10.2, 1, false);

    // cargo along the hull
    const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
    const hoopGeo = new THREE.TorusGeometry(0.62, 0.05, 6, 20);
    const crateMat = new THREE.MeshStandardMaterial({
      map: plankTexture(['#9a6b3c', '#a4743f', '#8f6234'], '#4a2d15'), roughness: 0.9
    });
    for (let x = -28; x <= 28; x += 2.6) {
      const z = backZ + 1.6 + rand() * 1.2;
      if (rand() < 0.55) {
        const b = new THREE.Group();
        const body = new THREE.Mesh(barrelGeo, barrelMat);
        body.position.y = 0.75;
        body.castShadow = true;
        b.add(body);
        [0.3, 1.2].forEach(h => {
          const hoop = new THREE.Mesh(hoopGeo, ironMat);
          hoop.rotation.x = Math.PI / 2;
          hoop.position.y = h;
          b.add(hoop);
        });
        b.position.set(x + (rand() - 0.5), 0, z);
        scenery.add(b);
      } else {
        const s = 1.2 + rand() * 0.6;
        const c = addBox(crateMat, s, s, s, x + (rand() - 0.5), s / 2, z);
        c.rotation.y = (rand() - 0.5) * 0.5;
        if (rand() < 0.35) {
          const s2 = s * 0.7;
          const top = addBox(crateMat, s2, s2, s2, c.position.x, s + s2 / 2, z);
          top.rotation.y = rand();
        }
      }
    }

    // a coiled rope on the deck
    const ropeGeo = new THREE.TorusGeometry(0.5, 0.13, 6, 20);
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 });
    [[4.5, 3.8], [-9, 4.2]].forEach(([x, z]) => {
      for (let k = 0; k < 3; k++) {
        const coil = new THREE.Mesh(ropeGeo, ropeMat);
        coil.rotation.x = Math.PI / 2;
        coil.scale.setScalar(1 - k * 0.22);
        coil.position.set(x, 0.13 + k * 0.14, z);
        coil.castShadow = true;
        scenery.add(coil);
      }
    });
  }

  if (IS_SHIP) buildShip();
  else buildForest();

  /* ---------- the cobra ---------- */
  const TAIL_X = -12.5, HEAD_X = -3.2;
  const SEGS = 24;
  const cobra = new THREE.Group();
  scene.add(cobra);

  const segGeo = new THREE.SphereGeometry(1, 18, 14);
  const bodyMats = [
    new THREE.MeshStandardMaterial({ color: COBRA_MID, roughness: 0.42, metalness: 0.15 }),
    new THREE.MeshStandardMaterial({ color: COBRA_DARK, roughness: 0.42, metalness: 0.15 })
  ];
  const segments = [];
  for (let i = 0; i < SEGS; i++) {
    const m = new THREE.Mesh(segGeo, bodyMats[i % 2]);
    m.castShadow = true;
    cobra.add(m);
    segments.push(m);
  }

  // head assembly
  const head = new THREE.Group();
  cobra.add(head);

  const hoodMat = new THREE.MeshStandardMaterial({ color: COBRA_DARK, roughness: 0.5, side: THREE.DoubleSide });
  const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), hoodMat);
  hood.scale.set(0.42, 1.0, 1.15);
  hood.position.set(-0.75, 0.05, 0);
  hood.castShadow = true;
  head.add(hood);

  // spectacle marks on the back of the hood
  const markMat = new THREE.MeshStandardMaterial({ color: 0xfef9c3, emissive: 0x3f3a10, roughness: 0.6 });
  [-0.45, 0.45].forEach(z => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.055, 8, 18), markMat);
    ring.position.set(-1.1, 0.16, z * 0.85);
    ring.rotation.y = Math.PI / 2;
    head.add(ring);
  });

  const skullMat = new THREE.MeshStandardMaterial({ color: COBRA_LIGHT, roughness: 0.35, metalness: 0.2 });
  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), skullMat);
  skull.scale.set(0.95, 0.5, 0.62);
  skull.castShadow = true;
  head.add(skull);

  const browMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.6 });
  const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.05), browMat);
  brow.position.set(0.15, 0.36, 0);
  head.add(brow);

  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xfefce8, emissive: 0x2a2608, roughness: 0.3 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x08150f });
  const eyes = [];
  [-0.34, 0.34].forEach(z => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), eyeWhiteMat);
    e.position.set(0.5, 0.2, z);
    head.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), pupilMat);
    p.position.set(0.63, 0.2, z);
    p.scale.set(0.6, 1.5, 0.6);
    head.add(p);
    eyes.push(e, p);
  });

  const fangMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
  const fangs = new THREE.Group();
  [-0.2, 0.2].forEach(z => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.62, 8), fangMat);
    f.position.set(0.82, -0.2, z);
    f.rotation.z = Math.PI / 2 + 0.35;
    fangs.add(f);
  });
  fangs.visible = false;
  head.add(fangs);

  const tongue = new THREE.Group();
  const tongueMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
  const tstem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 6), tongueMat);
  tstem.rotation.z = Math.PI / 2; tstem.position.x = 0.35;
  tongue.add(tstem);
  [-1, 1].forEach(s => {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.01, 0.42, 6), tongueMat);
    tip.rotation.z = Math.PI / 2 + s * 0.45;
    tip.position.set(0.85, 0, s * 0.11);
    tongue.add(tip);
  });
  tongue.position.set(0.8, -0.05, 0);
  head.add(tongue);

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
  const cobraMats = [bodyMats[0], bodyMats[1], hoodMat, skullMat];
  const cobraBaseColors = cobraMats.map(m => m.color.clone());

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
    const framing = Math.min(1.9, Math.max(0.62, 3.3 / camera.aspect));
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
    for (let i = 0; i < SEGS; i++) {
      const s = i / (SEGS - 1);
      const r = 0.36 + 0.52 * s;
      segments[i].position.copy(pts[i]);
      segments[i].scale.set(r * 1.1, r, r);
    }
    const hp0 = pts[SEGS - 1], hp1 = pts[SEGS - 3];
    head.position.copy(hp0);
    const dirV = hp0.clone().sub(hp1);
    head.rotation.y = -Math.atan2(dirV.z, dirV.x);
    head.rotation.z = down ? -0.9 : Math.max(-0.3, Math.min(0.35, -dirV.y * 0.5));
    head.scale.setScalar(1.5);

    const biting = heroLunge > 0.85;
    fangs.visible = biting;
    tongue.visible = !biting && !down;
    if (tongue.visible) {
      const flick = (Math.sin(t * 7) + 1) / 2;
      tongue.scale.setScalar(0.7 + flick * 0.7);
    }
    eyes.forEach(e => { e.visible = !down; });
    hood.scale.set(0.42, down ? 0.62 : 1.0 + Math.max(0, heroLunge) * 0.22, down ? 0.8 : 1.15 + Math.max(0, heroLunge) * 0.26);

    // hurt tint
    const hf = f.heroFlash || 0;
    cobraMats.forEach((m, i) => m.color.copy(cobraBaseColors[i]).lerp(HURT_COLOR, Math.min(1, hf)));
    heroGlow.position.set(headX - 1, 2.2, 0);
    heroGlow.intensity = down ? 1 : 5 + Math.sin(t * 3) * 1.5;

    /* --- scenery: swaying bushes, flickering lanterns --- */
    swayers.forEach(w => {
      const rustle = w.den && entering ? 0.08 * Math.sin(t * 22) : 0;
      w.obj.rotation.z = Math.sin(t * 1.3 + w.phase) * w.amp + rustle;
    });
    lanterns.forEach(l => {
      l.light.intensity = l.base * (0.85 + 0.15 * Math.sin(t * 9 + l.phase) * Math.sin(t * 3.7 + l.phase));
    });

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
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', endOrbit);
    canvas.removeEventListener('pointercancel', endOrbit);
    canvas.removeEventListener('dblclick', resetOrbit);
    floats.forEach(fl => scene.remove(fl.sp));
    floats.length = 0;
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    });
    renderer.dispose();
  }

  resize();

  return { render, burst, float, resize, dispose, holdIntro, playIntro, skipIntro };
}