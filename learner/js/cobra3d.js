/* ============================================================
   cobra3d.js — the CobraByte cobra, shared by all three games
   (arena3d.js MCQ, battle3d.js Fill in the Blanks,
   flashcards3d.js Flashcards).

   Colors follow the CobraByte logo: deep navy back, teal flanks,
   cyan chevron bands and a pale-aqua belly.

   const cobra = createCobra({ headScale, maxPoints, castShadow });
   scene.add(cobra.group);

   Every frame:
   cobra.update({
     points,    // THREE.Vector3[] along the body, TAIL -> HEAD
     radii,     // optional number[] (same length) - body radius per point
     rTail, rNeck, // used when radii is not given
     t, dt,     // seconds
     yaw,       // optional head yaw (rotation.y); default = from the path
     down,      // knocked out: hood folds, head droops, eyes close
     biting,    // mouth open + fangs out, tongue in
     flare,     // 0..1 extra hood flare (eat / attack / excited)
     hurt,      // 0..1 red flash
   });
   cobra.headPosition  // THREE.Vector3 (world) - updated by update()
   cobra.dispose();

   The body is ONE continuous tube rebuilt every frame from the points
   (smoothed with Catmull-Rom), tapering to a pointed tail. Scales and
   bands are painted on canvases in code - no image files.
   ============================================================ */
import * as THREE from './three.module.js';

const PALETTE = {
    navy: '#14275e',
    blue: '#1d4ed8',
    teal: '#0e7490',
    tealLight: '#14b8a6',
    cyan: '#22d3ee',
    belly: '#d5fbf3',
    bellyLine: '#7dd3c8',
    ink: '#081226',
};

const RADIAL = 16;      // vertices around the body
const SUBDIV = 3;       // smoothing samples per input span

/* ---------------- canvas textures ---------------- */
function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

// Body skin: u runs along the body, v runs around it.
// v = 0 / 1 is the top of the back, v = 0.5 is the middle of the belly.
function paintBodySkin() {
    const W = 512, H = 256;
    const color = makeCanvas(W, H);
    const bump = makeCanvas(W, H);
    const g = color.getContext('2d');
    const b = bump.getContext('2d');

    // base: navy back -> teal flanks -> pale belly -> teal -> navy
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, PALETTE.navy);
    grad.addColorStop(0.16, PALETTE.blue);
    grad.addColorStop(0.27, PALETTE.teal);
    grad.addColorStop(0.34, PALETTE.tealLight);
    grad.addColorStop(0.38, PALETTE.belly);
    grad.addColorStop(0.62, PALETTE.belly);
    grad.addColorStop(0.66, PALETTE.tealLight);
    grad.addColorStop(0.73, PALETTE.teal);
    grad.addColorStop(0.84, PALETTE.blue);
    grad.addColorStop(1.00, PALETTE.navy);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    b.fillStyle = '#808080';
    b.fillRect(0, 0, W, H);

    // cyan chevron bands across the back (4 per tile)
    for (let k = 0; k < 4; k++) {
        const x0 = k * (W / 4) + 20;
        [[0, 0.36], [0.64, 1]].forEach(([va, vb]) => {
            const yA = va * H, yB = vb * H;
            const mid = va === 0 ? 0 : H;
            g.beginPath();
            g.moveTo(x0, yA === 0 ? mid : yA);
            g.lineTo(x0 + 26, va === 0 ? yB : yA);
            g.lineTo(x0 + 44, va === 0 ? yB : yA);
            g.lineTo(x0 + 18, yA === 0 ? mid : yB);
            g.closePath();
            const band = g.createLinearGradient(x0, 0, x0 + 44, 0);
            band.addColorStop(0, 'rgba(34, 211, 238, 0.15)');
            band.addColorStop(0.5, 'rgba(103, 232, 249, 0.85)');
            band.addColorStop(1, 'rgba(34, 211, 238, 0.15)');
            g.fillStyle = band;
            g.fill();
        });
        // thin dark rim behind each band
        g.fillStyle = 'rgba(8, 18, 38, 0.35)';
        g.fillRect(x0 + 46, 0, 5, H * 0.3);
        g.fillRect(x0 + 46, H * 0.7, 5, H * 0.3);
    }

    // overlapping diamond scales on back + flanks
    const SX = 16, SY = 12;
    for (let row = 0; row * SY < H + SY; row++) {
        const y = row * SY;
        const v = y / H;
        if (v > 0.37 && v < 0.63) continue; // belly gets plates instead
        for (let col = -1; col * SX < W + SX; col++) {
            const x = col * SX + (row % 2 ? SX / 2 : 0);
            g.beginPath();
            g.moveTo(x, y - SY * 0.55);
            g.lineTo(x + SX * 0.5, y);
            g.lineTo(x, y + SY * 0.55);
            g.lineTo(x - SX * 0.5, y);
            g.closePath();
            g.strokeStyle = 'rgba(8, 18, 38, 0.35)';
            g.lineWidth = 1.2;
            g.stroke();
            // highlight on the leading edge of every scale
            g.beginPath();
            g.moveTo(x - SX * 0.45, y);
            g.lineTo(x, y - SY * 0.5);
            g.strokeStyle = 'rgba(165, 243, 252, 0.22)';
            g.lineWidth = 1;
            g.stroke();

            // bump: raised scale centers
            const rg = b.createRadialGradient(x, y, 0, x, y, SX * 0.55);
            rg.addColorStop(0, '#c8c8c8');
            rg.addColorStop(1, '#606060');
            b.fillStyle = rg;
            b.beginPath();
            b.moveTo(x, y - SY * 0.55);
            b.lineTo(x + SX * 0.5, y);
            b.lineTo(x, y + SY * 0.55);
            b.lineTo(x - SX * 0.5, y);
            b.closePath();
            b.fill();
        }
    }

    // belly plates (ventral scutes)
    for (let x = 0; x < W; x += 14) {
        g.strokeStyle = PALETTE.bellyLine;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, H * 0.38);
        g.quadraticCurveTo(x + 5, H * 0.5, x, H * 0.62);
        g.stroke();
        b.fillStyle = '#a8a8a8';
        b.fillRect(x + 2, H * 0.38, 10, H * 0.24);
        b.fillStyle = '#505050';
        b.fillRect(x, H * 0.38, 2, H * 0.24);
    }

    return { color, bump };
}

// Hood back: navy with the classic white-cyan "spectacle" marking.
function paintHoodBack() {
    const W = 256, H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(W / 2, H * 0.55, 10, W / 2, H * 0.55, W * 0.7);
    grad.addColorStop(0, PALETTE.blue);
    grad.addColorStop(0.6, PALETTE.navy);
    grad.addColorStop(1, PALETTE.ink);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);

    // scales
    for (let y = 0; y < H; y += 12) {
        for (let x = (y / 12) % 2 ? 8 : 0; x < W; x += 16) {
            g.strokeStyle = 'rgba(165, 243, 252, 0.12)';
            g.lineWidth = 1;
            g.beginPath();
            g.arc(x, y, 7, Math.PI * 0.1, Math.PI * 0.9);
            g.stroke();
        }
    }

    // spectacle: two loops joined by a bridge
    g.lineCap = 'round';
    const cy = H * 0.5;
    [[-1], [1]].forEach(([s]) => {
        const cx = W / 2 + s * 46;
        g.strokeStyle = 'rgba(8, 18, 38, 0.9)';
        g.lineWidth = 22;
        g.beginPath(); g.ellipse(cx, cy, 30, 24, 0, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#e0fbff';
        g.lineWidth = 12;
        g.beginPath(); g.ellipse(cx, cy, 30, 24, 0, 0, Math.PI * 2); g.stroke();
        g.fillStyle = PALETTE.ink;
        g.beginPath(); g.ellipse(cx, cy, 14, 11, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = PALETTE.cyan;
        g.beginPath(); g.ellipse(cx - 3, cy - 3, 5, 4, 0, 0, Math.PI * 2); g.fill();
    });
    g.strokeStyle = 'rgba(8, 18, 38, 0.9)';
    g.lineWidth = 20;
    g.beginPath(); g.moveTo(W / 2 - 20, cy + 22); g.quadraticCurveTo(W / 2, cy + 40, W / 2 + 20, cy + 22); g.stroke();
    g.strokeStyle = '#e0fbff';
    g.lineWidth = 10;
    g.beginPath(); g.moveTo(W / 2 - 20, cy + 22); g.quadraticCurveTo(W / 2, cy + 40, W / 2 + 20, cy + 22); g.stroke();

    // cyan rim
    g.strokeStyle = 'rgba(34, 211, 238, 0.55)';
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    return c;
}

// Hood front (throat side): pale belly scales with two dark throat bands.
function paintHoodFront() {
    const W = 256, H = 256;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, PALETTE.teal);
    grad.addColorStop(0.18, PALETTE.tealLight);
    grad.addColorStop(0.3, PALETTE.belly);
    grad.addColorStop(0.7, PALETTE.belly);
    grad.addColorStop(0.82, PALETTE.tealLight);
    grad.addColorStop(1, PALETTE.teal);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 10) {
        g.strokeStyle = 'rgba(14, 116, 144, 0.35)';
        g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(W * 0.25, y); g.quadraticCurveTo(W / 2, y + 4, W * 0.75, y); g.stroke();
    }
    g.fillStyle = 'rgba(20, 39, 94, 0.85)';
    g.fillRect(W * 0.2, H * 0.62, W * 0.6, 14);
    g.fillRect(W * 0.25, H * 0.74, W * 0.5, 10);
    return c;
}

/* ---------------- geometry helpers ---------------- */
// Hood: a cupped fan in head space (forward +x, up +y, side z).
// Built so its FRONT faces +x (the throat side).
function buildHoodGeometry() {
    const NA = 18, NB = 14;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= NB; j++) {
        const b = j / NB;                       // 0 bottom (neck) .. 1 top
        // rounded oval, widest a little below the middle, narrowing into the neck
        const e = (b - 0.5) / 0.5;
        let width = 0.92 * Math.sqrt(Math.max(0, 1 - e * e));
        if (b < 0.35) width = Math.max(width, 0.24);
        for (let i = 0; i <= NA; i++) {
            const a = (i / NA) * 2 - 1;         // -1 .. 1 across
            const z = a * width;
            const y = -1.0 + b * 1.42;
            const x = 0.16 * a * a * width - 0.05 * Math.sin(Math.PI * b) - 0.14;
            pos.push(x, y, z);
            uv.push((a + 1) / 2, b);
        }
    }
    const row = NA + 1;
    for (let j = 0; j < NB; j++) {
        for (let i = 0; i < NA; i++) {
            const p = j * row + i;
            // (a, a+row, a+1) -> normal = dy x dz = +x  (front faces forward)
            idx.push(p, p + row, p + 1, p + 1, p + row, p + row + 1);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
}

// Skull: a sphere pushed into a wedge - flat crown, tapered snout,
// flat underside - with a navy crown fading to a pale-aqua chin.
function buildSkullGeometry() {
    const geo = new THREE.SphereGeometry(1, 32, 24);
    const p = geo.attributes.position;
    const colors = [];
    const top = new THREE.Color(PALETTE.navy);
    const side = new THREE.Color(PALETTE.teal);
    const chin = new THREE.Color(PALETTE.belly);
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const front = Math.max(0, x);
        const taper = 1 - 0.42 * front;
        let Y = y * (y > 0 ? 0.26 : 0.16) * taper;
        const Z = z * 0.32 * (1 - 0.32 * front);
        if (Y > 0) Y *= 1 - 0.3 * Math.abs(z);          // flat crown
        p.setXYZ(i, x * 0.6, Y, Z);
        const h = THREE.MathUtils.clamp((Y + 0.16) / 0.42, 0, 1);
        if (h > 0.55) tmp.copy(side).lerp(top, (h - 0.55) / 0.45);
        else tmp.copy(chin).lerp(side, h / 0.55);
        colors.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
}

function smoothstep(a, b, x) {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

// Tongue flicks come in quick bursts, like a real snake tasting the air.
function tongueOut(t) {
    const cycle = 2.3;
    const ph = (t % cycle) / cycle;
    if (ph > 0.32) return 0;
    return Math.max(0, Math.sin((ph / 0.32) * Math.PI * 3));
}

/* ============================================================ */
export function createCobra(opts = {}) {
    const headScale = opts.headScale || 1;
    const hoodTilt = opts.hoodTilt || 0;   // extra lean on top of following the neck
    const maxPoints = opts.maxPoints || 64;
    const castShadow = opts.castShadow !== false;

    const group = new THREE.Group();
    const disposables = [];
    const keep = (x) => { disposables.push(x); return x; };

    /* ---------- skins ---------- */
    const skin = paintBodySkin();
    const bodyMap = keep(new THREE.CanvasTexture(skin.color));
    bodyMap.colorSpace = THREE.SRGBColorSpace;
    bodyMap.wrapS = THREE.RepeatWrapping;
    bodyMap.anisotropy = 4;
    const bodyBump = keep(new THREE.CanvasTexture(skin.bump));
    bodyBump.wrapS = THREE.RepeatWrapping;

    const bodyMat = keep(new THREE.MeshStandardMaterial({
        map: bodyMap, bumpMap: bodyBump, bumpScale: 0.6,
        roughness: 0.38, metalness: 0.12,
        emissive: 0x0c2a4d, emissiveIntensity: 0.35,   // keeps the navy readable in dim scenes
    }));

    const hoodBackMap = keep(new THREE.CanvasTexture(paintHoodBack()));
    hoodBackMap.colorSpace = THREE.SRGBColorSpace;
    const hoodFrontMap = keep(new THREE.CanvasTexture(paintHoodFront()));
    hoodFrontMap.colorSpace = THREE.SRGBColorSpace;
    const hoodBackMat = keep(new THREE.MeshStandardMaterial({ map: hoodBackMap, roughness: 0.42, metalness: 0.1, side: THREE.BackSide }));
    const hoodFrontMat = keep(new THREE.MeshStandardMaterial({ map: hoodFrontMap, roughness: 0.5, metalness: 0.05, side: THREE.FrontSide }));

    const skullMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15 }));
    const browMat = keep(new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.35, metalness: 0.15 }));
    const jawMat = keep(new THREE.MeshStandardMaterial({ color: PALETTE.belly, roughness: 0.45 }));
    const mouthMat = keep(new THREE.MeshStandardMaterial({ color: 0x9f1239, roughness: 0.7 }));
    const irisMat = keep(new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0x7c4a03, emissiveIntensity: 0.6, roughness: 0.15 }));
    const pupilMat = keep(new THREE.MeshBasicMaterial({ color: 0x050a14 }));
    const glintMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const lidMat = keep(new THREE.MeshStandardMaterial({ color: PALETTE.navy, roughness: 0.4 }));
    const fangMat = keep(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.2 }));
    const tongueMat = keep(new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.35 }));

    const tintable = [bodyMat, hoodBackMat, hoodFrontMat, skullMat, jawMat, browMat];
    const baseColors = tintable.map(m => m.color.clone());

    /* ---------- body tube (rebuilt every frame) ---------- */
    const MAX_RINGS = maxPoints * SUBDIV + 4;
    const ringVerts = RADIAL + 1;
    const posArr = new Float32Array(MAX_RINGS * ringVerts * 3);
    const nrmArr = new Float32Array(MAX_RINGS * ringVerts * 3);
    const uvArr = new Float32Array(MAX_RINGS * ringVerts * 2);
    const index = [];
    for (let r = 0; r < MAX_RINGS - 1; r++) {
        for (let k = 0; k < RADIAL; k++) {
            const a = r * ringVerts + k;
            const b = a + ringVerts;
            index.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    const bodyGeo = keep(new THREE.BufferGeometry());
    bodyGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    bodyGeo.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3).setUsage(THREE.DynamicDrawUsage));
    bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2).setUsage(THREE.DynamicDrawUsage));
    bodyGeo.setIndex(index);
    bodyGeo.setDrawRange(0, 0);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = castShadow;
    body.receiveShadow = true;
    body.frustumCulled = false;
    group.add(body);

    /* ---------- head ---------- */
    const head = new THREE.Group();
    head.scale.setScalar(headScale);
    group.add(head);

    const skull = new THREE.Mesh(keep(buildSkullGeometry()), skullMat);
    skull.position.set(0.3, 0.02, 0);
    skull.castShadow = castShadow;
    head.add(skull);

    // brow ridges
    const browGeo = keep(new THREE.SphereGeometry(1, 12, 8));
    [-1, 1].forEach(s => {
        const br = new THREE.Mesh(browGeo, browMat);
        br.position.set(0.38, 0.2, s * 0.205);
        br.scale.set(0.14, 0.05, 0.07);
        br.rotation.y = s * 0.25;
        head.add(br);
    });

    // eyes: gold iris, vertical slit pupil, glint, closable lid
    const eyeGeo = keep(new THREE.SphereGeometry(1, 16, 12));
    const lids = [];
    [-1, 1].forEach(s => {
        const eye = new THREE.Group();
        eye.position.set(0.4, 0.12, s * 0.245);
        eye.rotation.y = s * 0.55;
        head.add(eye);
        const iris = new THREE.Mesh(eyeGeo, irisMat);
        iris.scale.setScalar(0.068);
        eye.add(iris);
        const pupil = new THREE.Mesh(eyeGeo, pupilMat);
        pupil.scale.set(0.012, 0.058, 0.02);
        pupil.position.set(0, 0, s * 0.058);
        eye.add(pupil);
        const glint = new THREE.Mesh(eyeGeo, glintMat);
        glint.scale.setScalar(0.014);
        glint.position.set(0.022, 0.03, s * 0.06);
        eye.add(glint);
        const lid = new THREE.Mesh(eyeGeo, lidMat);
        lid.scale.set(0.075, 0.001, 0.075);
        lid.position.set(0, 0.012, s * 0.004);
        eye.add(lid);
        lids.push(lid);
    });

    // nostrils
    [-1, 1].forEach(s => {
        const n = new THREE.Mesh(eyeGeo, pupilMat);
        n.scale.set(0.014, 0.01, 0.012);
        n.position.set(0.84, 0.09, s * 0.07);
        head.add(n);
    });

    // lower jaw (hinged at the back of the mouth) + mouth + fangs
    const jawPivot = new THREE.Group();
    jawPivot.position.set(0.0, -0.06, 0);
    head.add(jawPivot);
    const jawGeo = keep(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2));
    const jaw = new THREE.Mesh(jawGeo, jawMat);
    jaw.scale.set(0.5, 0.1, 0.25);
    jaw.position.set(0.32, 0.0, 0);
    jawPivot.add(jaw);
    const mouth = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 20)), mouthMat);
    mouth.rotation.x = -Math.PI / 2;
    mouth.scale.set(0.42, 0.2, 1);
    mouth.position.set(0.34, 0.012, 0);
    jawPivot.add(mouth);

    const fangs = new THREE.Group();
    const fangGeo = keep(new THREE.ConeGeometry(0.03, 0.17, 8));
    [-1, 1].forEach(s => {
        const f = new THREE.Mesh(fangGeo, fangMat);
        f.position.set(0.66, -0.12, s * 0.085);
        f.rotation.z = Math.PI - 0.2;
        fangs.add(f);
    });
    fangs.visible = false;
    head.add(fangs);

    // forked tongue
    const tongue = new THREE.Group();
    tongue.position.set(0.82, -0.04, 0);
    head.add(tongue);
    const tStem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.016, 0.02, 0.36, 8)), tongueMat);
    tStem.rotation.z = -Math.PI / 2;
    tStem.position.x = 0.18;
    tongue.add(tStem);
    const forks = [];
    const forkGeo = keep(new THREE.CylinderGeometry(0.004, 0.014, 0.17, 6));
    [-1, 1].forEach(s => {
        const pivot = new THREE.Group();
        pivot.position.x = 0.35;
        tongue.add(pivot);
        const fk = new THREE.Mesh(forkGeo, tongueMat);
        fk.rotation.z = -Math.PI / 2;
        fk.position.x = 0.08;
        pivot.add(fk);
        pivot.rotation.y = s * 0.42;
        forks.push({ pivot, s });
    });

    // hood (two faces: spectacle back, banded throat front)
    const hoodGeo = keep(buildHoodGeometry());
    const hood = new THREE.Group();
    hood.position.set(0, 0, 0);
    head.add(hood);
    const hoodFront = new THREE.Mesh(hoodGeo, hoodFrontMat);
    const hoodBack = new THREE.Mesh(hoodGeo, hoodBackMat);
    hoodFront.castShadow = castShadow;
    hood.add(hoodFront, hoodBack);

    /* ---------- per-frame state ---------- */
    const headPosition = new THREE.Vector3();
    const smoothPts = [];
    for (let i = 0; i < MAX_RINGS; i++) smoothPts.push(new THREE.Vector3());
    const smoothR = new Float32Array(MAX_RINGS);
    const arc = new Float32Array(MAX_RINGS);
    const curve = new THREE.CatmullRomCurve3([], false, 'centripetal');
    const up = new THREE.Vector3(0, 1, 0);
    const T = new THREE.Vector3(), S = new THREE.Vector3(), B = new THREE.Vector3();
    const prevS = new THREE.Vector3(0, 0, 1);
    const tmp = new THREE.Vector3();
    let flareNow = 0;
    let hoodAngle = 0;
    const invHead = new THREE.Matrix4();
    const neckLocal = new THREE.Vector3();
    let lidNow = 0;
    let jawNow = 0;

    function defaultRadius(s, rTail, rNeck) {
        return rTail + (rNeck - rTail) * smoothstep(0, 0.8, s);
    }

    function update(f) {
        const t = f.t || 0;
        const dt = Math.min(0.1, f.dt || 0.016);
        const down = !!f.down;
        const biting = !!f.biting;

        // ---- clean + smooth the path ----
        const raw = [];
        const rawR = [];
        const input = f.points || [];
        for (let i = 0; i < input.length; i++) {
            const p = input[i];
            if (raw.length && raw[raw.length - 1].distanceToSquared(p) < 1e-6) continue;
            raw.push(p);
            rawR.push(f.radii ? f.radii[i] : null);
        }
        if (raw.length < 2) {
            bodyGeo.setDrawRange(0, 0);
            if (raw.length === 1) head.position.copy(raw[0]);
            return;
        }
        const rTail = f.rTail != null ? f.rTail : 0.2;
        const rNeck = f.rNeck != null ? f.rNeck : 0.5;

        curve.points = raw;
        const n = Math.min(MAX_RINGS - 1, (raw.length - 1) * SUBDIV + 1);
        for (let i = 0; i < n; i++) {
            const u = i / (n - 1);
            curve.getPoint(u, smoothPts[i]);
            const s = u;
            let r;
            if (f.radii) {
                const fi = u * (raw.length - 1);
                const i0 = Math.floor(fi), i1 = Math.min(raw.length - 1, i0 + 1);
                const a = rawR[i0] != null ? rawR[i0] : defaultRadius(s, rTail, rNeck);
                const b = rawR[i1] != null ? rawR[i1] : defaultRadius(s, rTail, rNeck);
                r = a + (b - a) * (fi - i0);
            } else {
                r = defaultRadius(s, rTail, rNeck);
            }
            r *= Math.pow(Math.min(1, s / 0.2), 0.75);    // long pointed tail
            if (s > 0.96) r *= 0.82;                      // neck slips under the hood
            smoothR[i] = r;
        }

        // ---- rings (u measured from the head so the pattern travels with the body) ----
        let lenFromHead = 0;
        const lens = smoothR;
        for (let i = n - 2; i >= 0; i--) {
            lenFromHead += smoothPts[i].distanceTo(smoothPts[i + 1]);
            arc[i] = lenFromHead;
        }
        arc[n - 1] = 0;
        const uScale = 1 / Math.max(0.2, rNeck * 7.5);

        // inside the hood the neck slims down so the hood reads as the
        // neck's own flaps (and the spectacle mark stays visible)
        const hoodLen = 1.0 * headScale;
        for (let i = 0; i < n; i++) {
            if (arc[i] < hoodLen) lens[i] *= 0.4 + 0.6 * smoothstep(hoodLen * 0.55, hoodLen, arc[i]);
        }

        prevS.set(0, 0, 1);
        for (let i = 0; i < n; i++) {
            const a = smoothPts[Math.max(0, i - 1)];
            const b = smoothPts[Math.min(n - 1, i + 1)];
            T.subVectors(b, a).normalize();
            S.crossVectors(T, up);
            if (S.lengthSq() < 0.04) {
                S.copy(prevS).addScaledVector(T, -prevS.dot(T));
            }
            S.normalize();
            if (S.dot(prevS) < 0 && i > 0) S.negate();
            prevS.copy(S);
            B.crossVectors(S, T).normalize();   // "up" of the body
            if (B.y < 0 && Math.abs(T.y) < 0.9) { B.negate(); S.negate(); }

            const r = lens[i];
            const c = smoothPts[i];
            for (let k = 0; k <= RADIAL; k++) {
                const th = (k / RADIAL) * Math.PI * 2;
                const cb = Math.cos(th), sb = Math.sin(th);
                const flat = cb < 0 ? 0.62 : 0.92;          // flat belly, rounded back
                const o = (i * ringVerts + k) * 3;
                posArr[o] = c.x + (B.x * cb * flat + S.x * sb) * r;
                posArr[o + 1] = c.y + (B.y * cb * flat + S.y * sb) * r;
                posArr[o + 2] = c.z + (B.z * cb * flat + S.z * sb) * r;
                tmp.set(B.x * cb / flat + S.x * sb, B.y * cb / flat + S.y * sb, B.z * cb / flat + S.z * sb).normalize();
                nrmArr[o] = tmp.x; nrmArr[o + 1] = tmp.y; nrmArr[o + 2] = tmp.z;
                const uo = (i * ringVerts + k) * 2;
                uvArr[uo] = arc[i] * uScale;
                uvArr[uo + 1] = k / RADIAL;
            }
        }
        bodyGeo.attributes.position.needsUpdate = true;
        bodyGeo.attributes.normal.needsUpdate = true;
        bodyGeo.attributes.uv.needsUpdate = true;
        bodyGeo.setDrawRange(0, (n - 1) * RADIAL * 6);
        bodyGeo.computeBoundingSphere();

        // ---- head pose ----
        const hp = smoothPts[n - 1];
        const behind = smoothPts[Math.max(0, n - 1 - SUBDIV)];
        head.position.copy(hp);
        T.subVectors(hp, behind);
        const horiz = Math.hypot(T.x, T.z);
        const yaw = f.yaw != null ? f.yaw : (horiz > 1e-4 ? -Math.atan2(T.z, T.x) : head.rotation.y);
        const climb = horiz > 1e-4 ? Math.atan2(T.y, horiz) : 0;
        const sway = down ? 0 : Math.sin(t * 1.7) * 0.06;
        head.rotation.order = 'YZX';
        head.rotation.y = yaw + sway;
        head.rotation.z = down ? -0.85 : THREE.MathUtils.clamp(climb * 0.25, -0.3, 0.3);
        head.rotation.x = down ? 0.5 : Math.sin(t * 1.1) * 0.04;
        headPosition.copy(hp);

        // ---- hood flare ----
        const flareTarget = down ? -0.55 : Math.max(0, Math.min(1, f.flare || 0));
        flareNow += (flareTarget - flareNow) * Math.min(1, dt * 9);
        const breathe = down ? 0 : Math.sin(t * 2.1) * 0.03;
        hood.scale.set(1, 1 + flareNow * 0.12 + breathe, 1 + flareNow * 0.38 + breathe);
        // the hood follows the neck: its lower edge points down the neck
        let neckIdx = n - 1;
        const reach = 0.7 * headScale;
        while (neckIdx > 0 && arc[neckIdx] < reach) neckIdx--;
        head.updateMatrix();
        invHead.copy(head.matrix).invert();
        neckLocal.copy(smoothPts[neckIdx]).applyMatrix4(invHead);
        let target = Math.atan2(neckLocal.x, -neckLocal.y) * 0.75;
        target = THREE.MathUtils.clamp(target, -1.45, 0.5) + hoodTilt + (down ? 0.5 : 0);
        hoodAngle += (target - hoodAngle) * Math.min(1, dt * 10);
        hood.rotation.z = hoodAngle;

        // ---- jaw, fangs, tongue ----
        const jawTarget = biting ? 0.55 : 0;
        jawNow += (jawTarget - jawNow) * Math.min(1, dt * 14);
        jawPivot.rotation.z = -jawNow;
        fangs.visible = jawNow > 0.25;

        const out = biting || down ? 0 : tongueOut(t);
        tongue.visible = out > 0.02;
        tongue.scale.set(Math.max(0.02, out), 1, 1);
        forks.forEach(({ pivot, s }) => {
            pivot.rotation.y = s * (0.35 + Math.sin(t * 40) * 0.12 * out);
        });

        // ---- eyelids close when knocked out ----
        const lidTarget = down ? 1 : 0;
        lidNow += (lidTarget - lidNow) * Math.min(1, dt * 8);
        lids.forEach(l => { l.scale.y = 0.001 + lidNow * 0.074; });

        // ---- hurt flash ----
        const hurt = Math.max(0, Math.min(1, f.hurt || 0));
        tintable.forEach((m, i) => {
            m.color.copy(baseColors[i]);
            if (hurt > 0) m.color.lerp(HURT, hurt);
        });
    }

    const HURT = new THREE.Color(0xf87171);

    function dispose() {
        disposables.forEach(d => { if (d && d.dispose) d.dispose(); });
        disposables.length = 0;
    }

    return { group, head, update, dispose, headPosition };
}