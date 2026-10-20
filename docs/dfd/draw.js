// Browser side: window.drawDiagram(spec) -> lays out with ELK, draws SVG into #diagram.
(function () {
  const FONT = 'Arial, Helvetica, sans-serif';
  const NODE_PX = 14, LABEL_PX = 12.5, LINE = 1.2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  function textW(s, px, bold) {
    ctx.font = (bold ? 'bold ' : '') + px + 'px ' + FONT;
    return Math.max(...String(s).split('\n').map((l) => ctx.measureText(l).width));
  }
  const lines = (s) => String(s).split('\n');
  const storeCell = (n) => (n.num ? 40 : 12);  // the sample's stores have only a narrow blank cell

  function nodeSize(n) {
    const tw = textW(n.label, NODE_PX, n.type === 'system');
    const nl = lines(n.label).length;
    if (n.type === 'entity') return { width: Math.max(120, tw + 34), height: Math.max(58, nl * 16 + 30) };
    if (n.type === 'store') return { width: Math.max(130, tw + storeCell(n) + 26), height: 32 };
    if (n.type === 'system') return { width: Math.max(220, tw + 40), height: Math.max(130, nl * 17 + 60) };
    // a process with many lines on one side is made taller, so each line can leave
    // it level with the box at the other end and run straight
    return { width: Math.max(112, tw + 26), height: Math.max(24 + Math.max(58, nl * 16 + 26), (n.sideLines || 0) * 30 + 14) };
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const e = document.createElementNS(svgNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function text(parent, s, x, y, px, opts = {}) {
    const ls = lines(s);
    const lh = px * 1.22;
    const y0 = y - ((ls.length - 1) * lh) / 2;
    ls.forEach((l, i) => {
      const t = el('text', {
        x, y: y0 + i * lh, 'font-family': FONT, 'font-size': px,
        'text-anchor': opts.anchor || 'middle', 'dominant-baseline': 'central', fill: '#000',
        'font-weight': opts.bold ? 'bold' : 'normal',
      }, parent);
      if (opts.halo) { t.setAttribute('stroke', '#fff'); t.setAttribute('stroke-width', '4'); t.setAttribute('paint-order', 'stroke'); t.setAttribute('stroke-linejoin', 'round'); }
      t.textContent = l;
    });
  }


  // Context Diagram: the system in the middle and each user on one side (left,
  // right or bottom), joined by a pair of straight parallel arrows - in and out.
  function drawStar(spec) {
    const byId = Object.fromEntries(spec.nodes.map((n) => [n.id, n]));
    const center = spec.nodes.find((n) => n.type === 'process');
    const C = nodeSize(center), GAP = 14, PAD = 20, LH = LABEL_PX * 1.22;
    const sides = spec.star;
    const flowsOf = (id) => ({
      inn: spec.edges.find((e) => e.from === id), out: spec.edges.find((e) => e.to === id),
    });
    const block = (label) => ({ w: label ? textW(label, LABEL_PX) : 0, h: label ? lines(label).length * LH : 0 });
    const ent = {};
    Object.keys(sides).forEach((id) => { ent[id] = { ...nodeSize(byId[id]), ...flowsOf(id) }; });
    const hGap = (id) => (id ? Math.max(block(ent[id].inn && ent[id].inn.label).w, block(ent[id].out && ent[id].out.label).w) + 60 : 0);
    const left = Object.keys(sides).find((k) => sides[k] === 'left');
    const right = Object.keys(sides).find((k) => sides[k] === 'right');
    const bottom = Object.keys(sides).find((k) => sides[k] === 'bottom');
    const sideBlockH = (id) => (id ? Math.max(block(ent[id].inn && ent[id].inn.label).h, block(ent[id].out && ent[id].out.label).h) : 0);
    const above = Math.max(sideBlockH(left), sideBlockH(right)) + 16;
    const cx = PAD + (left ? ent[left].width + hGap(left) : 0) + C.width / 2;
    const cy = PAD + Math.max(above, left ? ent[left].height / 2 : 0, C.height / 2);
    const lowSide = cy + GAP / 2 + Math.max(sideBlockH(left), sideBlockH(right)) + 8;   // bottom of the side labels
    const bTop = Math.max(cy + C.height / 2, lowSide);
    const bGap = bottom ? Math.max(block(ent[bottom].inn && ent[bottom].inn.label).h, block(ent[bottom].out && ent[bottom].out.label).h) + 40 : 0;
    const W = Math.ceil(cx + C.width / 2 + (right ? hGap(right) + ent[right].width : 0) + PAD);
    const H = Math.ceil((bottom ? bTop + bGap + ent[bottom].height : cy + C.height / 2) + PAD);

    let host = document.getElementById('diagram');
    if (host) host.remove();
    host = document.createElement('div');
    host.id = 'diagram';
    host.style.cssText = `width:${W}px;height:${H}px;background:#fff;display:inline-block`;
    document.body.appendChild(host);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
    const m = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto', markerUnits: 'userSpaceOnUse' }, el('defs', {}, svg));
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#000' }, m);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, svg);
    const st = { fill: '#fff', stroke: '#000', 'stroke-width': LINE };
    const arrow = (x1, y1, x2, y2) => el('line', { x1, y1, x2, y2, stroke: '#000', 'stroke-width': LINE, 'marker-end': 'url(#arr)' }, svg);
    const box = (n, x, y) => {
      const { width: w, height: h } = nodeSize(n);
      if (n.type === 'process') {
        el('rect', { x, y, width: w, height: h, rx: 10, ...st }, svg);
        el('line', { x1: x, y1: y + 24, x2: x + w, y2: y + 24, stroke: '#000', 'stroke-width': LINE }, svg);
        text(svg, n.num, x + w / 2, y + 12, 12);
        text(svg, n.label, x + w / 2, y + 24 + (h - 24) / 2, NODE_PX);
      } else {
        el('rect', { x, y, width: w, height: h, ...st }, svg);
        text(svg, n.label, x + w / 2, y + h / 2, NODE_PX);
      }
    };
    const P = { x: cx - C.width / 2, y: cy - C.height / 2 };
    box(center, P.x, P.y);
    const yIn = cy - GAP / 2, yOut = cy + GAP / 2;
    if (left) {
      const e = ent[left], ex = PAD, ey = cy - e.height / 2;
      box(byId[left], ex, ey);
      const x1 = ex + e.width, x2 = P.x, mid = (x1 + x2) / 2;
      if (e.inn) { arrow(x1, yIn, x2, yIn); text(svg, e.inn.label, mid, yIn - 6 - block(e.inn.label).h / 2, LABEL_PX); }
      if (e.out) { arrow(x2, yOut, x1, yOut); text(svg, e.out.label, mid, yOut + 6 + block(e.out.label).h / 2, LABEL_PX); }
    }
    if (right) {
      const e = ent[right], ex = P.x + C.width + hGap(right), ey = cy - e.height / 2;
      box(byId[right], ex, ey);
      const x1 = P.x + C.width, x2 = ex, mid = (x1 + x2) / 2;
      if (e.inn) { arrow(x2, yIn, x1, yIn); text(svg, e.inn.label, mid, yIn - 6 - block(e.inn.label).h / 2, LABEL_PX); }
      if (e.out) { arrow(x1, yOut, x2, yOut); text(svg, e.out.label, mid, yOut + 6 + block(e.out.label).h / 2, LABEL_PX); }
    }
    if (bottom) {
      const e = ent[bottom], ey = bTop + bGap, ex = cx - e.width / 2, mid = (cy + C.height / 2 + ey) / 2;
      box(byId[bottom], ex, ey);
      const xIn = cx - GAP / 2, xOut = cx + GAP / 2;
      if (e.inn) { arrow(xIn, ey, xIn, P.y + C.height); text(svg, e.inn.label, xIn - 10 - block(e.inn.label).w / 2, mid, LABEL_PX); }
      if (e.out) { arrow(xOut, P.y + C.height, xOut, ey); text(svg, e.out.label, xOut + 10 + block(e.out.label).w / 2, mid, LABEL_PX); }
    }
    return { w: W, h: H, bends: 0, jogs: 0, edges: spec.edges.length, overlaps: [] };
  }


  // Column layout for Level 0 parts and Level 1: processes in one column in number
  // order, users on the left and data stores on the right.
  //  - A box used by one process sits level with it, so its lines are straight.
  //  - A user used by several processes is drawn once, above or below the column;
  //    each of its lines runs down (or up) and turns once into its process. Every
  //    choice of above / below and left-to-right order is tried and the one with the
  //    fewest crossing lines is kept; a crossing that cannot be avoided is drawn
  //    with a small hop.
  // Flows between processes run straight down to the next process; one that skips
  // ahead runs down a lane beside the process column.
  function drawColumn(spec) {
    const byId = Object.fromEntries(spec.nodes.map((n) => [n.id, n]));
    const procs = spec.nodes.filter((n) => n.type === 'process');
    const isP = (id) => byId[id].type === 'process';
    const LH = LABEL_PX * 1.22, PAIR = 14, PAD = 20, ROWGAP = 12, LANE = 14, HOP = 5;
    const PROC_W = Math.max(...procs.map((p) => nodeSize(p).width), 150);
    const blockH = (l) => (l ? lines(l).length * LH : 0);
    const blockW = (l) => (l ? textW(l, LABEL_PX) : 0);
    const index = Object.fromEntries(procs.map((p, i) => [p.id, i]));
    const sideOf = (id) => (byId[id].type === 'entity' ? 'left' : 'right');

    const usedBy = {};
    spec.edges.forEach((e) => {
      if (isP(e.from) === isP(e.to)) return;
      const [p, o] = isP(e.from) ? [e.from, e.to] : [e.to, e.from];
      (usedBy[o] = usedBy[o] || new Set()).add(p);
    });
    const shared = (id) => sideOf(id) === 'left' && usedBy[id].size > 1;
    const groups = procs.map((p) => ({ p, slots: { left: [], right: [] } }));
    spec.edges.forEach((e) => {
      if (isP(e.from) === isP(e.to)) return;
      const [p, o] = isP(e.from) ? [e.from, e.to] : [e.to, e.from];
      const g = groups[index[p]], side = sideOf(o);
      let sl = g.slots[side].find((x) => x.id === o);
      if (!sl) g.slots[side].push(sl = { id: o, shared: shared(o), inn: null, out: null });
      if (e.to === p) sl.inn = e; else sl.out = e;
    });
    const users = Object.keys(usedBy).filter(shared);

    const slotSize = (sl) => {
      const n = (sl.inn ? 1 : 0) + (sl.out ? 1 : 0);
      const first = sl.inn || sl.out, second = sl.inn && sl.out ? sl.out : null;
      const above = blockH(first.label) + 4, below = second ? blockH(second.label) + 4 : 0;
      const box = sl.shared ? 0 : nodeSize(byId[sl.id]).height;
      const linesH = (n - 1) * PAIR;
      return { h: Math.max(above + linesH + below, box) + ROWGAP, above, linesH, box, first, second };
    };
    const stackH = (slots) => slots.reduce((t, sl) => t + slotSize(sl).h, 0);
    const allSlots = (side) => groups.flatMap((g) => g.slots[side]);
    const maxLabel = (side) => Math.max(0, ...allSlots(side).flatMap((sl) => [blockW(sl.inn && sl.inn.label), blockW(sl.out && sl.out.label)]));
    const rowW = (side) => Math.max(0, ...allSlots(side).filter((sl) => !sl.shared).map((sl) => nodeSize(byId[sl.id]).width));
    const linesOf = (id) => allSlots('left').filter((sl) => sl.id === id).reduce((t, sl) => t + (sl.inn ? 1 : 0) + (sl.out ? 1 : 0), 0);
    const colW = (id) => Math.max(nodeSize(byId[id]).width, linesOf(id) * LANE + 16);
    const inner = spec.edges.filter((e) => isP(e.from) && isP(e.to));
    const skips = (i) => inner.filter((e) => index[e.from] === i && index[e.to] > i + 1);
    const gapAfter = procs.map((p, i) => {
      const here = inner.filter((e) => Math.min(index[e.from], index[e.to]) === i && Math.abs(index[e.to] - index[e.from]) === 1);
      const next = here.length ? Math.max(...here.map((e) => blockH(e.label))) + 36 : 24;
      return Math.max(next, ...skips(i).map((e) => blockH(e.label) + 30));
    });
    const bandOf = (ids) => (ids.length ? Math.max(...ids.map((id) => nodeSize(byId[id]).height)) + 34 : 0);

    // Lay the diagram out for one choice: order = shared users outer to inner,
    // band[id] = 'top' or 'bottom'. Returns the geometry and every line as points.
    function plan(order, band) {
      const col = Object.fromEntries(order.map((id, k) => [id, k]));
      // within a process: users from above (inner one higher), level boxes, users from below (outer one higher)
      // a user line arrives from above (top band, or a user placed in a gap above this row)
      // or from below (bottom band, or a gap below this row)
      const fromAbove = (id, row) => band[id] === 'top' || (typeof band[id] === 'number' && row > band[id]);
      const rank = (sl, row) => (!sl.shared ? [1, 0] : fromAbove(sl.id, row) ? [0, -col[sl.id]] : [2, col[sl.id]]);
      groups.forEach((g, row) => g.slots.left.sort((a, b) => { const ra = rank(a, row), rb = rank(b, row); return ra[0] - rb[0] || ra[1] - rb[1]; }));
      // a user placed between two processes makes room for itself in that gap
      const gaps = gapAfter.slice();
      order.forEach((id) => { if (typeof band[id] === 'number') gaps[band[id]] = Math.max(gaps[band[id]], nodeSize(byId[id]).height + 44); });
      const leftRow = rowW('left'), rightRow = rowW('right');
      const leftGap = allSlots('left').length ? maxLabel('left') + 70 : 0, rightGap = allSlots('right').length ? maxLabel('right') + 50 : 0;
      const colX = {};
      let x = PAD;
      order.forEach((id) => { colX[id] = x; x += colW(id) + 20; });
      const rowEntRight = x + leftRow, procX = rowEntRight + leftGap, rowStoreX = procX + PROC_W + rightGap;
      const W = Math.ceil(rowStoreX + rightRow + PAD);
      const topIds = order.filter((id) => band[id] === 'top'), botIds = order.filter((id) => band[id] === 'bottom');
      const midCount = order.filter((id) => typeof band[id] === 'number').length;
      const topH = bandOf(topIds), botH = bandOf(botIds);
      let y = PAD + topH;
      const placed = groups.map((g, i) => {
        const h = Math.max(stackH(g.slots.left), stackH(g.slots.right), nodeSize(g.p).height + ROWGAP);
        const top = y;
        y += h + (i < groups.length - 1 ? gaps[i] : 0);
        return { ...g, top, h };
      });
      const H = Math.ceil(y + botH + PAD);
      const boxes = [], labels = [], flows = [], procBox = {}, sharedLines = {};
      placed.forEach(({ p, slots, top, h }) => {
        procBox[p.id] = { x: procX, y: top, w: PROC_W, h: h - ROWGAP };
        ['left', 'right'].forEach((side) => {
          let ry = top + (h - stackH(slots[side])) / 2;
          const edgeX = side === 'left' ? procX : procX + PROC_W;
          const gapMid = side === 'left' ? (rowEntRight + procX) / 2 : (procX + PROC_W + rowStoreX) / 2;
          slots[side].forEach((sl) => {
            const sz = slotSize(sl), n = byId[sl.id];
            const lineTop = ry + Math.max(sz.above, (sz.box - sz.linesH) / 2), lineBot = lineTop + sz.linesH;
            labels.push([sz.first.label, gapMid, lineTop - 4 - blockH(sz.first.label) / 2]);
            if (sz.second) labels.push([sz.second.label, gapMid, lineBot + 4 + blockH(sz.second.label) / 2]);
            const ys = [[sz.first, lineTop], ...(sz.second ? [[sz.second, lineBot]] : [])];
            if (!sl.shared) {
              const { width: bw, height: bh } = nodeSize(n);
              const bx = side === 'left' ? rowEntRight - bw : rowStoreX;
              boxes.push([n, bx, (lineTop + lineBot) / 2 - bh / 2, bw, bh]);
              const near = side === 'left' ? bx + bw : bx;
              ys.forEach(([e, yy]) => flows.push(e === sl.inn ? [{ x: near, y: yy }, { x: edgeX, y: yy }] : [{ x: edgeX, y: yy }, { x: near, y: yy }]));
            } else {
              ys.forEach(([e, yy]) => (sharedLines[sl.id] = sharedLines[sl.id] || []).push({ y: yy, toProc: e === sl.inn }));
            }
            ry += sz.h;
          });
        });
      });
      order.forEach((id) => {
        const n = byId[id], { width: bw, height: bh } = nodeSize(n), b = band[id];
        const bx = colX[id] + (colW(id) - bw) / 2;
        let by;
        if (b === 'top') by = PAD + (topH - 34 - bh) / 2;
        else if (b === 'bottom') by = H - PAD - botH + 34 + (botH - 34 - bh) / 2 - 10;
        else by = (placed[b].top + placed[b].h - ROWGAP + placed[b + 1].top) / 2 - bh / 2;
        boxes.push([n, bx, by, bw, bh]);
        // lines to processes above leave the box's top, lines to processes below its bottom;
        // in each group the line to the farthest process is outermost, so they never cross
        const up = sharedLines[id].filter((l) => l.y < by).sort((a, c) => a.y - c.y);
        const down = sharedLines[id].filter((l) => l.y >= by).sort((a, c) => c.y - a.y);
        [[up, by], [down, by + bh]].forEach(([ls, edgeY]) => {
          const start = bx + bw / 2 - ((ls.length - 1) * LANE) / 2;
          ls.forEach((l, k) => {
            const lx = start + k * LANE;
            flows.push(l.toProc ? [{ x: lx, y: edgeY }, { x: lx, y: l.y }, { x: procX, y: l.y }] : [{ x: procX, y: l.y }, { x: lx, y: l.y }, { x: lx, y: edgeY }]);
          });
        });
      });
      const cx = procX + PROC_W / 2;
      let lane = 0;
      inner.forEach((e) => {
        const a = procBox[e.from], b = procBox[e.to], down = index[e.to] > index[e.from];
        const siblings = inner.filter((o) => Math.min(index[o.from], index[o.to]) === Math.min(index[e.from], index[e.to]) && Math.abs(index[o.to] - index[o.from]) === 1);
        if (Math.abs(index[e.to] - index[e.from]) === 1) {
          const k = siblings.indexOf(e), lx = cx + (k - (siblings.length - 1) / 2) * 30;
          const y1 = down ? a.y + a.h : a.y, y2 = down ? b.y : b.y + b.h;
          flows.push([{ x: lx, y: y1 }, { x: lx, y: y2 }]);
          labels.push([e.label, lx + 8 + blockW(e.label) / 2, (y1 + y2) / 2]);
        } else {
          const lx = procX - 18 - lane++ * 12, yOut = a.y + a.h - 16, yIn = b.y + 34;
          flows.push([{ x: procX, y: yOut }, { x: lx, y: yOut }, { x: lx, y: yIn }, { x: procX, y: yIn }]);
          const next = procs[index[e.from] + 1];
          labels.push([e.label, lx - 8 - blockW(e.label) / 2, (a.y + a.h + procBox[next.id].y) / 2]);
        }
      });
      // crossings: a horizontal piece of one line passing a vertical piece of another
      const hs = [], vs = [];
      flows.forEach((pts, f) => pts.slice(1).forEach((q, k) => {
        const a = pts[k];
        if (Math.abs(a.y - q.y) < 0.5) hs.push({ f, y: a.y, x1: Math.min(a.x, q.x), x2: Math.max(a.x, q.x) });
        else vs.push({ f, x: a.x, y1: Math.min(a.y, q.y), y2: Math.max(a.y, q.y) });
      }));
      const crossings = [];
      hs.forEach((h) => vs.forEach((v) => {
        if (h.f !== v.f && v.x > h.x1 + 1 && v.x < h.x2 - 1 && h.y > v.y1 + 1 && h.y < v.y2 - 1) crossings.push({ f: h.f, x: v.x, y: h.y });
      }));
      const length = flows.reduce((t, pts) => t + pts.slice(1).reduce((u, q, k) => u + Math.abs(q.x - pts[k].x) + Math.abs(q.y - pts[k].y), 0), 0);
      return { W, H, boxes, labels, flows, procBox, crossings, length, bands: botIds.length + midCount };
    }

    // try every order and every above / below choice for the shared users
    const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((r) => [x, ...r])));
    let best = null;
    (users.length <= 5 ? perms(users) : [users]).forEach((order) => {
      // each user can sit above the column, below it, or in a gap between two of its processes
      const options = order.map((id) => {
        const rows = [...usedBy[id]].map((p) => index[p]);
        const o = ['top', 'bottom'];
        for (let g = Math.min(...rows); g < Math.max(...rows); g++) o.push(g);
        return o;
      });
      const combos = options.reduce((acc, o) => acc.flatMap((c) => o.map((v) => [...c, v])), [[]]);
      for (const combo of combos) {
        const band = Object.fromEntries(order.map((id, k) => [id, combo[k]]));
        const r = plan(order, band);
        const score = [r.crossings.length, r.bands, r.length];
        if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { ...r, score };
      }
    });
    const { W, H, boxes, labels, flows, procBox, crossings } = best;

    let host = document.getElementById('diagram');
    if (host) host.remove();
    host = document.createElement('div');
    host.id = 'diagram';
    host.style.cssText = `width:${W}px;height:${H}px;background:#fff;display:inline-block`;
    document.body.appendChild(host);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
    const mk = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto', markerUnits: 'userSpaceOnUse' }, el('defs', {}, svg));
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#000' }, mk);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, svg);
    const gL = el('g', {}, svg), gB = el('g', {}, svg), gT = el('g', {}, svg);
    const st = { fill: '#fff', stroke: '#000', 'stroke-width': LINE };
    flows.forEach((pts, f) => {
      // a crossing on this line's horizontal piece is drawn as a small hop over the other line
      let d = `M${pts[0].x},${pts[0].y}`;
      pts.slice(1).forEach((q, k) => {
        const a = pts[k];
        if (Math.abs(a.y - q.y) < 0.5) {
          const dir = Math.sign(q.x - a.x);
          crossings.filter((c) => c.f === f && Math.abs(c.y - a.y) < 0.5 && (c.x - a.x) * dir > 0 && (q.x - c.x) * dir > 0)
            .sort((c1, c2) => (c1.x - c2.x) * dir)
            .forEach((c) => { d += ` L${c.x - dir * HOP},${a.y} A${HOP},${HOP} 0 0 ${dir > 0 ? 1 : 0} ${c.x + dir * HOP},${a.y}`; });
        }
        d += ` L${q.x},${q.y}`;
      });
      el('path', { d, 'data-points': pts.map((q) => `${q.x},${q.y}`).join(' '), fill: 'none', stroke: '#000', 'stroke-width': LINE, 'marker-end': 'url(#arr)' }, gL);
    });
    const drawBox = (n, bx, by, w, h) => {
      if (n.type === 'process') {
        el('rect', { x: bx, y: by, width: w, height: h, rx: 10, ...st }, gB);
        el('line', { x1: bx, y1: by + 24, x2: bx + w, y2: by + 24, stroke: '#000', 'stroke-width': LINE }, gB);
        text(gB, n.num, bx + w / 2, by + 12, 12);
        text(gB, n.label, bx + w / 2, by + 24 + (h - 24) / 2, NODE_PX);
      } else if (n.type === 'entity') {
        el('rect', { x: bx, y: by, width: w, height: h, ...st }, gB);
        text(gB, n.label, bx + w / 2, by + h / 2, NODE_PX);
      } else {
        const c = storeCell(n);
        el('rect', { x: bx, y: by, width: w, height: h, ...st }, gB);
        el('line', { x1: bx + c, y1: by, x2: bx + c, y2: by + h, stroke: '#000', 'stroke-width': LINE }, gB);
        if (n.duplicate) el('line', { x1: bx + 5, y1: by, x2: bx + 5, y2: by + h, stroke: '#000', 'stroke-width': LINE }, gB);
        text(gB, n.num, bx + c / 2 + (n.duplicate ? 2 : 0), by + h / 2, 12);
        text(gB, n.label, bx + c + 10, by + h / 2, NODE_PX, { anchor: 'start' });
      }
    };
    boxes.forEach((b) => drawBox(...b));
    procs.forEach((p) => { const b = procBox[p.id]; drawBox(p, b.x, b.y, b.w, b.h); });
    labels.forEach(([t, lx, ly]) => text(gT, t, lx, ly, LABEL_PX, { halo: true }));
    return { w: W, h: H, bends: 0, jogs: 0, edges: spec.edges.length, overlaps: [], crossings: crossings.length };
  }

  // Checks the finished drawing: no flow line through a label or a box, no labels on top of each other.
  window.checkDrawing = function () {
    const svg = document.querySelector('#diagram svg');
    const out = [];
    const segs = [];
    svg.querySelectorAll('polyline, line, path[data-points]').forEach((l) => {
      if (l.closest('defs')) return;
      let pts;
      if (l.tagName === 'line') pts = [[+l.getAttribute('x1'), +l.getAttribute('y1')], [+l.getAttribute('x2'), +l.getAttribute('y2')]];
      else pts = (l.getAttribute('points') || l.getAttribute('data-points')).trim().split(/\s+/).map((p) => p.split(',').map(Number));
      if (!l.getAttribute('marker-end') && !l.getAttribute('marker-start')) return;  // box details, not flows
      for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
    });
    const hits = (r, [a, b], m) => Math.max(a[0], b[0]) > r.x + m && Math.min(a[0], b[0]) < r.x + r.width - m
      && Math.max(a[1], b[1]) > r.y + m && Math.min(a[1], b[1]) < r.y + r.height - m;
    const labels = [...svg.querySelectorAll('text[stroke]')].map((t) => ({ t: t.textContent, r: t.getBBox() }));
    const boxes = [...svg.querySelectorAll('rect')].slice(1).map((r) => r.getBBox());
    labels.forEach((l) => segs.forEach((sg) => { if (hits(l.r, sg, 1)) out.push(`line through label "${l.t}"`); }));
    boxes.forEach((b) => segs.forEach((sg) => { if (hits(b, sg, 2)) out.push(`line through a box at ${Math.round(b.x)},${Math.round(b.y)}`); }));
    labels.forEach((a, i) => labels.slice(i + 1).forEach((b) => {
      const r1 = a.r, r2 = b.r;
      if (r1.x < r2.x + r2.width && r1.x + r1.width > r2.x && r1.y < r2.y + r2.height - 1 && r1.y + r1.height - 1 > r2.y && a.t !== b.t) out.push(`labels "${a.t}" and "${b.t}" overlap`);
    }));
    return [...new Set(out)];
  };

  window.drawDiagram = async function (spec) {
    if (spec.star) return drawStar(spec);
    if (spec.column) return drawColumn(spec);
    const partOf = { entity: 0, process: 1, system: 1, store: 2 };
    const nById = Object.fromEntries(spec.nodes.map((n) => [n.id, n]));
    const rank = (id) => { const n = nById[id]; return n.part != null ? n.part : partOf[n.type]; };
    // Lay every flow out left-to-right; a flow that really goes right-to-left gets its arrow at the start.
    const flip = (e) => rank(e.from) > rank(e.to);
    const flipped = new Set(spec.edges.map((e, i) => (flip(e) ? 'e' + i : null)).filter(Boolean));
    // lines on the busier side (left or right) of each box
    const sideLines = (id) => {
      const counts = [0, 0];
      spec.edges.forEach((e) => {
        if (e.from !== id && e.to !== id) return;
        const other = e.from === id ? e.to : e.from;
        counts[rank(other) < rank(id) ? 0 : 1]++;
      });
      return Math.max(...counts);
    };
    const graph = {
      id: 'root',
      layoutOptions: Object.assign({
        'elk.algorithm': 'layered',
        'elk.layered.layering.strategy': 'LONGEST_PATH',
        'elk.direction': 'RIGHT',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.layered.spacing.nodeNodeBetweenLayers': '34',
        'elk.spacing.nodeNode': '26',
        'elk.spacing.edgeEdge': '10',
        'elk.spacing.edgeNode': '12',
        'elk.layered.spacing.edgeNodeBetweenLayers': '12',
        'elk.layered.spacing.edgeEdgeBetweenLayers': '9',
        'elk.spacing.edgeLabel': '3',
        'elk.layered.edgeLabels.sideSelection': 'SMART_UP',
        'elk.partitioning.activate': 'true',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
        'elk.layered.thoroughness': '30',
        'elk.padding': '[top=16,left=16,bottom=16,right=16]',
      }, spec.layout || {}),
      children: spec.nodes.map((n) => ({
        id: n.id, ...nodeSize(Object.assign(n, { sideLines: sideLines(n.id) })),
        layoutOptions: Object.assign({ 'elk.partitioning.partition': String(rank(n.id)) },
          rank(n.id) === 0 ? { 'elk.layered.layering.layerConstraint': 'FIRST' } : {},
          rank(n.id) === 2 ? { 'elk.layered.layering.layerConstraint': 'LAST' } : {}),
      })),
      edges: spec.edges.map((e, i) => ({
        id: 'e' + i, sources: [flip(e) ? e.to : e.from], targets: [flip(e) ? e.from : e.to],
        labels: e.label ? [{ text: e.label, width: textW(e.label, LABEL_PX) + 6, height: lines(e.label).length * LABEL_PX * 1.22 + 2,
          layoutOptions: { 'elk.edgeLabels.placement': spec.labelPlacement || 'CENTER' } }] : [],
      })),
    };
    const res = await new ELK().layout(graph);
    const W = Math.ceil(res.width), H = Math.ceil(res.height);
    let host = document.getElementById('diagram');
    if (host) host.remove();
    host = document.createElement('div');
    host.id = 'diagram';
    host.style.cssText = `width:${W}px;height:${H}px;background:#fff;display:inline-block`;
    document.body.appendChild(host);
    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, host);
    const defs = el('defs', {}, svg);
    const m = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 9, markerHeight: 9, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#000' }, m);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: '#fff' }, svg);

    const byId = Object.fromEntries(spec.nodes.map((n) => [n.id, n]));
    const gEdges = el('g', {}, svg), gNodes = el('g', {}, svg), gLabels = el('g', {}, svg);

    // Remove the small steps ELK leaves next to a box: when a line runs straight, makes a
    // short jog and runs on in the same direction, slide the end that touches the box so
    // the line goes in straight - as long as it still lands on that box's side.
    const boxes = Object.fromEntries(res.children.map((c) => [c.id, c]));
    const labelRects = [];
    res.edges.forEach((e) => (e.labels || []).forEach((l) => labelRects.push({ x: l.x - 2, y: l.y - 2, w: l.width + 4, h: l.height + 4 })));
    const crossesLabel = (a, b) => labelRects.some((r) => {
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
    });
    const JOG = 14;
    function straighten(pts, srcId, dstId) {
      const ax = (a, b) => (Math.abs(a.y - b.y) < 0.5 ? 'h' : Math.abs(a.x - b.x) < 0.5 ? 'v' : null);
      const along = (p, box, dir) => (dir === 'h' ? p.y > box.y + 4 && p.y < box.y + box.height - 4 : p.x > box.x + 4 && p.x < box.x + box.width - 4);
      const len = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      let changed = true;
      while (changed && pts.length >= 4) {
        changed = false;
        // start end: p0 -> p1 (dir d), p1 -> p2 short jog, p2 -> p3 (same dir d)
        const d0 = ax(pts[0], pts[1]);
        if (d0 && ax(pts[1], pts[2]) && ax(pts[2], pts[3]) === d0 && len(pts[1], pts[2]) < JOG) {
          const np = d0 === 'h' ? { x: pts[0].x, y: pts[2].y } : { x: pts[2].x, y: pts[0].y };
          if (along(np, boxes[srcId], d0) && !crossesLabel(np, pts[3])) { pts.splice(0, 3, np); changed = true; continue; }
        }
        const n = pts.length;
        const d1 = ax(pts[n - 1], pts[n - 2]);
        if (d1 && ax(pts[n - 2], pts[n - 3]) && ax(pts[n - 3], pts[n - 4]) === d1 && len(pts[n - 2], pts[n - 3]) < JOG) {
          const np = d1 === 'h' ? { x: pts[n - 1].x, y: pts[n - 3].y } : { x: pts[n - 3].x, y: pts[n - 1].y };
          if (along(np, boxes[dstId], d1) && !crossesLabel(pts[n - 4], np)) { pts.splice(n - 3, 3, np); changed = true; }
        }
      }
      return pts;
    }
    res.edges.forEach((e) => {
      (e.sections || []).forEach((s) => {
        const pts = straighten([s.startPoint, ...(s.bendPoints || []), s.endPoint], e.sources[0], e.targets[0]);
        s.startPoint = pts[0]; s.endPoint = pts[pts.length - 1]; s.bendPoints = pts.slice(1, -1);
        el('polyline', { points: pts.map((p) => `${p.x},${p.y}`).join(' '), fill: 'none', stroke: '#000', 'stroke-width': LINE, [flipped.has(e.id) ? 'marker-start' : 'marker-end']: 'url(#arr)' }, gEdges);
      });
      (e.labels || []).forEach((l) => text(gLabels, l.text, l.x + l.width / 2, l.y + l.height / 2, LABEL_PX, { halo: true }));
    });

    res.children.forEach((c) => {
      const n = byId[c.id];
      const { x, y, width: w, height: h } = c;
      const st = { fill: '#fff', stroke: '#000', 'stroke-width': LINE };
      if (n.type === 'entity') {
        el('rect', { x, y, width: w, height: h, ...st }, gNodes);
        text(gNodes, n.label, x + w / 2, y + h / 2, NODE_PX);
        // Gane-Sarson duplicate mark: a diagonal line across the lower right corner
        if (n.duplicate) el('line', { x1: x + w - 16, y1: y + h, x2: x + w, y2: y + h - 16, stroke: '#000', 'stroke-width': LINE }, gNodes);
      } else if (n.type === 'system') {
        el('rect', { x, y, width: w, height: h, rx: 18, ...st }, gNodes);
        text(gNodes, n.label, x + w / 2, y + h / 2, NODE_PX, { bold: true });
      } else if (n.type === 'process') {
        el('rect', { x, y, width: w, height: h, rx: 10, ...st }, gNodes);
        el('line', { x1: x, y1: y + 24, x2: x + w, y2: y + 24, stroke: '#000', 'stroke-width': LINE }, gNodes);
        text(gNodes, n.num, x + w / 2, y + 12, 12);
        text(gNodes, n.label, x + w / 2, y + 24 + (h - 24) / 2, NODE_PX);
      } else if (n.type === 'store') {
        el('rect', { x, y, width: w, height: h, fill: '#fff', stroke: 'none' }, gNodes);
        el('rect', { x, y, width: w, height: h, fill: '#fff', stroke: '#000', 'stroke-width': LINE }, gNodes);
        const c = storeCell(n);
        el('line', { x1: x + c, y1: y, x2: x + c, y2: y + h, stroke: '#000', 'stroke-width': LINE }, gNodes);
        // Gane-Sarson duplicate mark: a second line in the ID strip
        if (n.duplicate) el('line', { x1: x + 5, y1: y, x2: x + 5, y2: y + h, stroke: '#000', 'stroke-width': LINE }, gNodes);
        if (n.num) text(gNodes, n.num, x + c / 2 + (n.duplicate ? 2 : 0), y + h / 2, 12);
        text(gNodes, n.label, x + c + 10, y + h / 2, NODE_PX, { anchor: 'start' });
      }
    });
    // Bends per diagram (small jogs < 6px counted separately) - used to compare layout settings.
    let bends = 0, jogs = 0;
    res.edges.forEach((e) => (e.sections || []).forEach((sec) => {
      const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
      for (let i = 1; i < pts.length - 1; i++) bends++;
      for (let i = 1; i < pts.length; i++) {
        const d = Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
        if (d < 12 && i > 1 && i < pts.length - 1) jogs++;
      }
    }));
    // Overlaps: a label touching a line of another flow, a box, or another label.
    const overlaps = [];
    const labels = [];
    res.edges.forEach((e) => (e.labels || []).forEach((l) => labels.push({ e, r: { x: l.x - 1, y: l.y - 1, w: l.width + 2, h: l.height + 2 }, text: l.text })));
    const hit = (r, a, b) => {  // axis-aligned segment a-b crosses rectangle r
      const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
      return x2 > r.x && x1 < r.x + r.w && y2 > r.y && y1 < r.y + r.h;
    };
    const boxHit = (r, c) => r.x < c.x + c.width && r.x + r.w > c.x && r.y < c.y + c.height && r.y + r.h > c.y;
    labels.forEach(({ e, r, text: t }) => {
      res.edges.forEach((o) => {
        (o.sections || []).forEach((sec) => {
          const pts = [sec.startPoint, ...(sec.bendPoints || []), sec.endPoint];
          for (let i = 1; i < pts.length; i++) if (hit(r, pts[i - 1], pts[i])) { overlaps.push(`"${t.split('\n')[0]}" crosses a line`); return; }
        });
      });
      res.children.forEach((c) => { if (boxHit(r, c)) overlaps.push(`"${t.split('\n')[0]}" touches box ${c.id}`); });
    });
    labels.forEach((a, i) => labels.slice(i + 1).forEach((b) => {
      if (a.r.x < b.r.x + b.r.w && a.r.x + a.r.w > b.r.x && a.r.y < b.r.y + b.r.h && a.r.y + a.r.h > b.r.y) overlaps.push(`"${a.text.split('\n')[0]}" and "${b.text.split('\n')[0]}" overlap`);
    }));
    return { w: W, h: H, bends, jogs, edges: res.edges.length, overlaps };
  };
})();
