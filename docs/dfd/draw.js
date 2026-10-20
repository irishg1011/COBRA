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
    return { width: Math.max(112, tw + 26), height: 24 + Math.max(58, nl * 16 + 26) };
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

  window.drawDiagram = async function (spec) {
    const partOf = { entity: 0, process: 1, system: 1, store: 2 };
    const nById = Object.fromEntries(spec.nodes.map((n) => [n.id, n]));
    const rank = (id) => { const n = nById[id]; return n.part != null ? n.part : partOf[n.type]; };
    // Lay every flow out left-to-right; a flow that really goes right-to-left gets its arrow at the start.
    const flip = (e) => rank(e.from) > rank(e.to);
    const flipped = new Set(spec.edges.map((e, i) => (flip(e) ? 'e' + i : null)).filter(Boolean));
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
        id: n.id, ...nodeSize(n),
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
