/* ============================================================
   arena3d.js — Three.js arena for the CobraByte Multiple Choice activity.

   createArena(canvas, { terrain }) - terrain follows the chapter's side
   on the Learning Map (lesson_activities.get_chapter_terrain):

   'land'  forest: a mowed meadow (alternating shades keep the grid
           readable) walled in by a bush hedge, trees beyond it, grass
           tufts, flowers, and low bushes the cobra slithers through.
   'water' inside a wooden ship: a plank deck (alternating shades keep
           the grid readable) inside a low wooden rail, ribbed hull walls
           with portholes to the sea, flickering lanterns, barrels and
           crates, and coiled ropes the cobra slithers over. The ship
           rocks gently.

   Inside decorations never block the cobra. The hedge / rail sits where
   the old rails were, so hitting it is still the wall.

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

export function createArena(canvas, opts = {}) {
  let COLS = 40, ROWS = 15;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* ---------- terrain: 'land' = forest meadow, 'water' = inside a wooden ship ---------- */
  const TERRAIN = opts.terrain === 'water' ? 'water' : 'land';
  const IS_SHIP = TERRAIN === 'water';

  const BG = IS_SHIP ? 0x5a3d25 : 0xe7f1df;          // lantern-lit hold / soft morning haze
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.Fog(BG, 34, 92);

  const camera = new THREE.PerspectiveCamera(30, 2.6, 0.1, 400);

  /* ---------- lights ---------- */
  scene.add(IS_SHIP
    ? new THREE.HemisphereLight(0xffe7c2, 0x3b2616, 0.8)
    : new THREE.HemisphereLight(0xf7fbe9, 0x3f5f2a, 0.85));
  const key = new THREE.DirectionalLight(IS_SHIP ? 0xffe0b0 : 0xfff1d0, IS_SHIP ? 1.05 : 1.35);
  key.position.set(-12, 26, 14);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 90;
  scene.add(key);
  const rim = new THREE.DirectionalLight(IS_SHIP ? 0xffc27a : 0xd9f99d, IS_SHIP ? 0.3 : 0.35);
  rim.position.set(14, 10, -18);
  scene.add(rim);

  /* ---------- small seeded random (same layout for the same grid) ---------- */
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  /* ---------- textures drawn once on a canvas ---------- */
  function finishTexture(c) {
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  // Two cells x two cells; `stripe` shades alternate cells so the grid stays readable.
  function grassTexture(light, dark, blades, stripe) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    const cell = 128;
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 && stripe ? dark : light;
        g.fillRect(i * cell, j * cell, cell, cell);
      }
    }
    for (let n = 0; n < 1400; n++) {
      const x = Math.random() * 256, y = Math.random() * 256;
      const len = 3 + Math.random() * 7;
      const lean = (Math.random() - 0.5) * 4;
      g.strokeStyle = blades[(Math.random() * blades.length) | 0];
      g.globalAlpha = 0.35 + Math.random() * 0.4;
      g.lineWidth = 1 + Math.random();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + lean, y - len);
      g.stroke();
    }
    g.globalAlpha = 1;
    return finishTexture(c);
  }

  // Wooden planks: 4 planks per cell, grain, seams and nail heads.
  function plankTexture(tones, seamColor, stripe) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    const plankH = 32;
    for (let row = 0; row < 256 / plankH; row++) {
      const y = row * plankH;
      g.fillStyle = tones[(Math.random() * tones.length) | 0];
      g.fillRect(0, y, 256, plankH);
      g.strokeStyle = 'rgba(40, 22, 10, 0.18)';     // grain
      g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const gy = y + 3 + Math.random() * (plankH - 6);
        g.beginPath();
        g.moveTo(0, gy);
        g.bezierCurveTo(80, gy + (Math.random() - 0.5) * 4, 170, gy + (Math.random() - 0.5) * 4, 256, gy);
        g.stroke();
      }
      g.fillStyle = seamColor;                      // seam between planks
      g.fillRect(0, y, 256, 2);
      const joint = (row % 2 ? 64 : 192) + ((Math.random() - 0.5) * 20) | 0;
      g.fillRect(joint, y, 2, plankH);              // butt joint
      g.fillStyle = 'rgba(30, 20, 12, 0.55)';       // nails
      [joint - 6, joint + 8].forEach(nx => {
        g.beginPath(); g.arc(nx, y + 8, 1.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(nx, y + plankH - 8, 1.6, 0, Math.PI * 2); g.fill();
      });
    }
    if (stripe) {
      g.fillStyle = 'rgba(60, 32, 12, 0.14)';
      g.fillRect(128, 0, 128, 128);
      g.fillRect(0, 128, 128, 128);
    }
    return finishTexture(c);
  }

  /* ---------- outer floor + the playfield ---------- */
  const floorTex = IS_SHIP
    ? plankTexture(['#5b3a20', '#63401f', '#553519'], '#2e1b0d', false)
    : grassTexture('#4b7a34', '#4b7a34', ['#3b6128', '#5c8f3e', '#6b8e3a', '#7a6a3a'], false);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, metalness: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  floor.receiveShadow = true;
  scene.add(floor);

  const fieldTex = IS_SHIP
    ? plankTexture(['#b98a55', '#c09260', '#b3824e', '#c89b69'], '#6b4423', true)
    : grassTexture('#86b957', '#7aad4d', ['#6a9e3f', '#9ccc65', '#5f8f36', '#a7d36f'], true);
  const field = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.95, metalness: 0 })
  );
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.005;
  field.receiveShadow = true;
  scene.add(field);

  /* ---------- shared geometry + materials ---------- */
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushMats = [0x2f6b2a, 0x3d7d32, 0x4a8b3a].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true })
  );
  const innerBushMat = new THREE.MeshStandardMaterial({
    color: 0x4f9a3c, roughness: 0.9, flatShading: true, transparent: true, opacity: 0.88
  });
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.4, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 });
  const crownGeo = new THREE.ConeGeometry(1, 2.4, 8);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c5e2a, roughness: 0.9, flatShading: true });
  const tuftGeo = new THREE.ConeGeometry(0.07, 0.42, 4);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0x6fa844, roughness: 1 });
  const petalGeo = new THREE.SphereGeometry(0.09, 6, 5);
  const flowerMats = [0xfef3c7, 0xfde047, 0xf9a8d4, 0xffffff].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );

  // ship pieces
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallTex = IS_SHIP ? plankTexture(['#6f4726', '#7a4f2a', '#684222'], '#2e1b0d', false) : null;
  if (wallTex) { wallTex.center.set(0.5, 0.5); wallTex.rotation = Math.PI / 2; }
  const hullMat = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xffffff, roughness: 0.95 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7c4a22, roughness: 0.8 });
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x3f2614, roughness: 0.9 });
  const crateTex = IS_SHIP ? plankTexture(['#9a6b3c', '#a4743f', '#8f6234'], '#4a2d15', false) : null;
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.9 });
  const barrelGeo = new THREE.CylinderGeometry(0.42, 0.42, 1, 14);
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
  const hoopGeo = new THREE.TorusGeometry(0.44, 0.04, 6, 18);
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xb08d3c, roughness: 0.35, metalness: 0.8 });
  const portGeo = new THREE.TorusGeometry(0.62, 0.12, 8, 24);
  const glassGeo = new THREE.CircleGeometry(0.6, 24);
  const seaMat = new THREE.MeshBasicMaterial({ color: 0x5fb4e6 });
  const ropeGeo = new THREE.TorusGeometry(0.34, 0.09, 6, 18);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 1 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffc56b });

  let forest = null;            // everything rebuilt by buildGrid() (forest or ship props)
  let innerBushes = [];         // decorations the cobra slithers through: { grp, x, z, rustle }
  let lanterns = [];            // ship lanterns: { light, base }
  const tmpMatrix = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);

  function disposeForest() {
    if (!forest) return;
    scene.remove(forest);
    forest.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    forest = null;
    innerBushes = [];
    lanterns = [];
  }

  // One leafy clump = 3-5 overlapping low-poly spheres.
  function makeClump(mat, size) {
    const grp = new THREE.Group();
    const lobes = 3 + ((rand() * 3) | 0);
    for (let i = 0; i < lobes; i++) {
      const m = new THREE.Mesh(bushGeo, Array.isArray(mat) ? mat[(rand() * mat.length) | 0] : mat);
      const r = size * (0.45 + rand() * 0.35);
      m.scale.set(r, r * (0.75 + rand() * 0.25), r);
      m.position.set((rand() - 0.5) * size * 0.9, r * 0.55, (rand() - 0.5) * size * 0.9);
      m.castShadow = true;
      m.receiveShadow = true;
      grp.add(m);
    }
    return grp;
  }

  function scatterInstanced(geo, mat, count, place) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    for (let i = 0; i < count; i++) {
      place(i);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true;
    forest.add(mesh);
    return mesh;
  }

  function addBox(mat, w, h, d, x, y, z, shadow = true) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    forest.add(m);
    return m;
  }

  function addBarrel(x, z, s = 1) {
    const grp = new THREE.Group();
    const body = new THREE.Mesh(barrelGeo, barrelMat);
    body.scale.set(s, s * 1.15, s);
    body.position.y = 0.58 * s;
    body.castShadow = true;
    grp.add(body);
    [0.22, 0.94].forEach(h => {
      const hoop = new THREE.Mesh(hoopGeo, ironMat);
      hoop.rotation.x = Math.PI / 2;
      hoop.scale.setScalar(s);
      hoop.position.y = h * s;
      grp.add(hoop);
    });
    grp.position.set(x, 0, z);
    forest.add(grp);
  }

  function addCrate(x, z, s) {
    const c = addBox(crateMat, s, s, s, x, s / 2, z);
    c.rotation.y = (rand() - 0.5) * 0.5;
    return c;
  }

  /* ---------- forest (land chapters) ---------- */
  function buildForestProps(hw, hd) {
    // hedge of bushes all around the edge (these are the "walls")
    const hedgeStep = 1.1;
    const hedgeAt = (x, z) => {
      const clump = makeClump(bushMats, 0.95 + rand() * 0.35);
      clump.position.set(x, 0, z);
      clump.rotation.y = rand() * Math.PI;
      forest.add(clump);
    };
    for (let x = -hw - 0.6; x <= hw + 0.6; x += hedgeStep) {
      hedgeAt(x + (rand() - 0.5) * 0.3, -hd - 0.75);
      hedgeAt(x + (rand() - 0.5) * 0.3, hd + 0.75);
    }
    for (let z = -hd + 0.3; z <= hd - 0.3; z += hedgeStep) {
      hedgeAt(-hw - 0.75, z + (rand() - 0.5) * 0.3);
      hedgeAt(hw + 0.75, z + (rand() - 0.5) * 0.3);
    }

    // trees in the forest beyond the hedge (mostly behind, never blocking the view)
    const treeCount = Math.round((COLS + ROWS) * 0.9);
    for (let i = 0; i < treeCount; i++) {
      const side = rand();
      let x, z;
      if (side < 0.55) { x = (rand() - 0.5) * (COLS + 14); z = -hd - 2.4 - rand() * 7; }
      else if (side < 0.8) { x = -hw - 2.4 - rand() * 6; z = (rand() - 0.5) * (ROWS + 6); }
      else { x = hw + 2.4 + rand() * 6; z = (rand() - 0.5) * (ROWS + 6); }
      const tree = new THREE.Group();
      const s = 0.9 + rand() * 0.9;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.7 * s;
      trunk.scale.setScalar(s);
      trunk.castShadow = true;
      tree.add(trunk);
      for (let k = 0; k < 3; k++) {
        const crown = new THREE.Mesh(crownGeo, crownMat);
        const cs = s * (1.1 - k * 0.25);
        crown.scale.set(cs, cs, cs);
        crown.position.y = s * (1.9 + k * 0.9);
        crown.castShadow = true;
        tree.add(crown);
      }
      tree.position.set(x, 0, z);
      tree.rotation.y = rand() * Math.PI;
      forest.add(tree);
    }

    // low bushes inside the meadow: decoration only, the cobra slithers through
    const innerCount = Math.max(4, Math.round(COLS * ROWS / 55));
    for (let i = 0; i < innerCount; i++) {
      const clump = makeClump(innerBushMat, 0.55 + rand() * 0.25);
      const x = -hw + 1.5 + rand() * (COLS - 3);
      const z = -hd + 1.5 + rand() * (ROWS - 3);
      clump.position.set(x, 0, z);
      clump.rotation.y = rand() * Math.PI;
      clump.scale.y = 0.8;
      forest.add(clump);
      innerBushes.push({ grp: clump, x, z, rustle: 0 });
    }

    // grass tufts across the meadow and forest floor
    scatterInstanced(tuftGeo, tuftMat, Math.round(COLS * ROWS * 1.4), () => {
      const outside = rand() < 0.3;
      const x = outside ? (rand() - 0.5) * (COLS + 20) : (rand() - 0.5) * COLS;
      const z = outside ? (rand() - 0.5) * (ROWS + 20) : (rand() - 0.5) * ROWS;
      tmpPos.set(x, 0.18, z);
      tmpQuat.setFromAxisAngle(upAxis, rand() * Math.PI);
      const k = 0.7 + rand() * 0.8;
      tmpScale.set(k, k, k);
    });

    // little flowers
    const flowerCount = Math.round(COLS * ROWS / 9);
    flowerMats.forEach(mat => {
      scatterInstanced(petalGeo, mat, Math.ceil(flowerCount / flowerMats.length), () => {
        tmpPos.set((rand() - 0.5) * (COLS - 0.6), 0.08, (rand() - 0.5) * (ROWS - 0.6));
        tmpQuat.identity();
        const k = 0.7 + rand() * 0.6;
        tmpScale.set(k, k * 0.6, k);
      });
    });
  }

  /* ---------- inside a wooden ship (water chapters) ---------- */
  function buildShipProps(hw, hd) {
    // low wooden rail around the deck area (this is the "wall")
    addBox(railMat, COLS + 0.6, 0.36, 0.26, 0, 0.18, -hd - 0.14);
    addBox(railMat, COLS + 0.6, 0.36, 0.26, 0, 0.18, hd + 0.14);
    addBox(railMat, 0.26, 0.36, ROWS + 0.6, -hw - 0.14, 0.18, 0);
    addBox(railMat, 0.26, 0.36, ROWS + 0.6, hw + 0.14, 0.18, 0);
    for (let x = -hw; x <= hw + 0.01; x += 2) {
      addBox(beamMat, 0.2, 0.62, 0.2, x, 0.31, -hd - 0.14);
      addBox(beamMat, 0.2, 0.62, 0.2, x, 0.31, hd + 0.14);
    }
    for (let z = -hd + 2; z <= hd - 1.99; z += 2) {
      addBox(beamMat, 0.2, 0.62, 0.2, -hw - 0.14, 0.31, z);
      addBox(beamMat, 0.2, 0.62, 0.2, hw + 0.14, 0.31, z);
    }

    // hull: back wall + two side walls, ribbed, with portholes to the sea
    const backZ = -hd - 3.2, sideX = hw + 3.2, wallH = 5.2;
    addBox(hullMat, COLS + 8, wallH, 0.4, 0, wallH / 2, backZ, false);
    addBox(hullMat, 0.4, wallH, ROWS + 8, -sideX, wallH / 2, 0, false);
    addBox(hullMat, 0.4, wallH, ROWS + 8, sideX, wallH / 2, 0, false);
    for (let x = -hw - 2; x <= hw + 2.01; x += 3) {
      addBox(beamMat, 0.34, wallH, 0.34, x, wallH / 2, backZ + 0.35);
    }
    for (let z = -hd - 1; z <= hd + 2.01; z += 3) {
      addBox(beamMat, 0.34, wallH, 0.34, -sideX + 0.35, wallH / 2, z);
      addBox(beamMat, 0.34, wallH, 0.34, sideX - 0.35, wallH / 2, z);
    }
    addBox(beamMat, COLS + 8, 0.4, 0.5, 0, wallH - 0.2, backZ + 0.4);   // top stringer

    const portCount = Math.max(3, Math.round(COLS / 7));
    for (let i = 0; i < portCount; i++) {
      const x = -hw + (i + 0.5) * (COLS / portCount);
      const ring = new THREE.Mesh(portGeo, brassMat);
      ring.position.set(x, 2.9, backZ + 0.25);
      forest.add(ring);
      const glass = new THREE.Mesh(glassGeo, seaMat);
      glass.position.set(x, 2.9, backZ + 0.22);
      forest.add(glass);

      // a lantern between portholes
      if (i < portCount - 1) {
        const lx = x + (COLS / portCount) / 2;
        addBox(lampGlowMat, 0.3, 0.44, 0.3, lx, 3.55, backZ + 0.55, false);   // lit glass
        addBox(ironMat, 0.4, 0.08, 0.4, lx, 3.81, backZ + 0.55, false);        // iron cap
        addBox(ironMat, 0.4, 0.08, 0.4, lx, 3.29, backZ + 0.55, false);        // iron base
        if (lanterns.length < 4) {
          const light = new THREE.PointLight(0xffb45e, 5, 14, 2);
          light.position.set(lx, 3.3, backZ + 1.4);
          forest.add(light);
          lanterns.push({ light, base: 5, phase: rand() * 6 });
        }
      }
    }

    // cargo between the rail and the hull
    for (let x = -hw - 1.6; x <= hw + 1.6; x += 1.9) {
      if (rand() < 0.55) addBarrel(x + (rand() - 0.5) * 0.4, backZ + 1.6 + rand() * 0.6, 0.9 + rand() * 0.25);
      else addCrate(x + (rand() - 0.5) * 0.4, backZ + 1.7 + rand() * 0.5, 0.9 + rand() * 0.4);
    }
    for (let z = -hd; z <= hd + 1; z += 2.2) {
      if (rand() < 0.5) addBarrel(-sideX + 1.5, z + (rand() - 0.5) * 0.5, 0.9);
      else addCrate(-sideX + 1.5, z + (rand() - 0.5) * 0.5, 1 + rand() * 0.3);
      if (rand() < 0.5) addBarrel(sideX - 1.5, z + (rand() - 0.5) * 0.5, 0.9);
      else addCrate(sideX - 1.5, z + (rand() - 0.5) * 0.5, 1 + rand() * 0.3);
    }

    // coiled ropes on the deck: decoration only, the cobra slithers over them
    const innerCount = Math.max(4, Math.round(COLS * ROWS / 60));
    for (let i = 0; i < innerCount; i++) {
      const grp = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const coil = new THREE.Mesh(ropeGeo, ropeMat);
        coil.rotation.x = Math.PI / 2;
        coil.scale.setScalar(1 - k * 0.22);
        coil.position.y = 0.09 + k * 0.1;
        coil.castShadow = true;
        grp.add(coil);
      }
      const x = -hw + 1.5 + rand() * (COLS - 3);
      const z = -hd + 1.5 + rand() * (ROWS - 3);
      grp.position.set(x, 0, z);
      forest.add(grp);
      innerBushes.push({ grp, x, z, rustle: 0 });
    }
  }

  function buildGrid() {
    disposeForest();
    seed = COLS * 131 + ROWS * 7 + 1;
    forest = new THREE.Group();

    const hw = COLS / 2, hd = ROWS / 2;
    if (IS_SHIP) buildShipProps(hw, hd);
    else buildForestProps(hw, hd);

    scene.add(forest);

    floor.scale.set(COLS + 40, ROWS + 40, 1);
    floorTex.repeat.set((COLS + 40) / 4, (ROWS + 40) / 4);
    field.scale.set(COLS, ROWS, 1);
    fieldTex.repeat.set(COLS / 2, ROWS / 2);
    placeCamera();
  }

  // Decorations the cobra's head brushes past sway for a moment; the
  // ship's lanterns flicker.
  function animateScenery(headX, headZ, t, dt) {
    innerBushes.forEach((b, i) => {
      const dx = b.x - headX, dz = b.z - headZ;
      if (dx * dx + dz * dz < 1.2) b.rustle = 1;
      b.rustle = Math.max(0, b.rustle - dt * 1.6);
      const sway = (IS_SHIP ? 0 : Math.sin(t * 3 + i) * 0.03) + Math.sin(t * 24) * 0.12 * b.rustle;
      b.grp.rotation.z = sway;
      b.grp.rotation.x = sway * 0.6;
    });
    lanterns.forEach(l => {
      l.light.intensity = l.base * (0.85 + 0.15 * Math.sin(t * 9 + l.phase) * Math.sin(t * 3.7 + l.phase));
    });
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

    // corners of the playfield (plus the bush hedge and the floating letters)
    const hw = COLS / 2 + 1.3, hd = ROWS / 2 + 1.3;
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
      animateScenery(gx(h.x), gz(h.y), t, dt);
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
    if (IS_SHIP) camera.rotateZ(Math.sin(t * 0.7) * 0.012);   // the ship rocks gently
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
  // the activity calls this whenever its panel is torn down.
  function dispose() {
    window.removeEventListener('resize', resize);
    disposeForest();
    // Everything still in the scene, plus the shared pieces this terrain
    // never used - each geometry/material/texture disposed exactly once.
    const geos = new Set([bushGeo, trunkGeo, crownGeo, tuftGeo, petalGeo, segGeo, boxGeo,
      barrelGeo, hoopGeo, portGeo, glassGeo, ropeGeo]);
    const mats = new Set([...bushMats, ...flowerMats, innerBushMat, trunkMat, crownMat, tuftMat,
      hullMat, railMat, beamMat, crateMat, barrelMat, ironMat, brassMat, seaMat, ropeMat, lampGlowMat]);
    scene.traverse(o => {
      if (o.geometry) geos.add(o.geometry);
      (Array.isArray(o.material) ? o.material : (o.material ? [o.material] : [])).forEach(m => mats.add(m));
    });
    const maps = new Set([floorTex, fieldTex, wallTex, crateTex].filter(Boolean));
    mats.forEach(m => { if (m.map) maps.add(m.map); });
    geos.forEach(g => g.dispose());
    maps.forEach(tex => tex.dispose());
    mats.forEach(m => m.dispose());
    letterCache.forEach(mat => {
      if (mats.has(mat)) return;       // already disposed with the scene
      if (mat.map) mat.map.dispose();
      mat.dispose();
    });
    letterCache.clear();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
  }

  buildGrid();
  resize();
  window.addEventListener('resize', resize);

  return { setGrid, render, burst, resize, dispose, scene, camera, renderer };
}