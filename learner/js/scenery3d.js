/* ============================================================
   scenery3d.js — shared scenery for the side-view battle stages
   (battle3d.js: Fill in the Blanks, flashcards3d.js: Flashcards).

   createScenery(scene, terrain) -> { isShip, update(t, entering) }
     terrain 'land'  a forest clearing - grass, a dirt path, trees and
                     bushes; the cobra enters from the big bush on the
                     left (x ≈ -15).
     terrain 'water' inside a wooden ship - plank deck, ribbed hull with
                     portholes, flickering lanterns, barrels and crates;
                     the cobra enters through the doorway on the left.
   update(t, entering) sways the bushes (the entry bush rustles while
   the cobra is entering) and flickers the ship's lanterns. Everything is
   added to `scene`, so the stage's own dispose() frees it.
   ============================================================ */
import * as THREE from './three.module.js';

export function createScenery(scene, terrain) {
  /* ---------- terrain: 'land' = forest clearing, 'water' = inside a wooden ship ---------- */
  const IS_SHIP = terrain === 'water';

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

  function update(t, entering) {
    swayers.forEach(w => {
      const rustle = w.den && entering ? 0.08 * Math.sin(t * 22) : 0;
      w.obj.rotation.z = Math.sin(t * 1.3 + w.phase) * w.amp + rustle;
    });
    lanterns.forEach(l => {
      l.light.intensity = l.base * (0.85 + 0.15 * Math.sin(t * 9 + l.phase) * Math.sin(t * 3.7 + l.phase));
    });
  }

  return { isShip: IS_SHIP, update };
}