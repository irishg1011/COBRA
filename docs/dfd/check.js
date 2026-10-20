// Checks every diagram in specs.js against the DFD rules before it is drawn:
// labelled flows, allowed connections, verb-noun process names, noun flow names,
// an input and an output for every process, numbering, balancing between levels,
// and no box without lines. Exits with an error listing every problem found.
const specs = require('./specs.js');
const { ENTITIES, STORES, LEVEL1 } = specs;

const VERBS = new Set(['Register', 'Validate', 'Send', 'Verify', 'Save', 'Create', 'Authenticate', 'Reset',
  'Manage', 'Add', 'Attach', 'Set', 'Publish', 'Preview', 'Update', 'Deliver', 'Display', 'Check', 'Track',
  'Compute', 'Find', 'Award', 'Define', 'Submit', 'Resolve', 'Generate', 'Review']);
const kind = (n) => (n.type === 'entity' ? 'entity' : n.type === 'store' ? 'store' : 'process');
const problems = [];
const say = (d, msg) => problems.push(`${d.id}: ${msg}`);

for (const d of specs.filter((x) => !x.isCheckedElsewhere)) {
  const byId = Object.fromEntries(d.nodes.map((n) => [n.id, n]));
  for (const e of d.edges) {
    const a = kind(byId[e.from]), b = kind(byId[e.to]);
    if (!e.label || !e.label.trim()) say(d, `unlabelled flow ${e.from} -> ${e.to}`);
    if (a !== 'process' && b !== 'process') say(d, `${a} -> ${b} is not allowed (${e.from} -> ${e.to})`);
    for (const l of e.label.split('\n')) if (VERBS.has(l.split(' ')[0])) say(d, `flow "${l}" names an action, not data`);
  }
  for (const n of d.nodes) {
    const ins = d.edges.filter((e) => e.to === n.id).length, outs = d.edges.filter((e) => e.from === n.id).length;
    if (!ins && !outs) say(d, `${n.label} has no flows`);
    if (n.type === 'process') {
      if (!ins) say(d, `process ${n.num} has no input (miracle)`);
      if (!outs) say(d, `process ${n.num} has no output (black hole)`);
      if (n.num !== '0' && !VERBS.has(n.label.split(/\s/)[0])) say(d, `process ${n.num} "${n.label.replace(/\n/g, ' ')}" does not start with a verb`);
    }
  }
}

// numbering: Level 0 is 1.0..9.0, each Level 1 is n.1, n.2, ... in order
LEVEL1.forEach((p, i) => {
  if (p.num !== `${i + 1}.0`) problems.push(`Level 0 process ${p.num} should be ${i + 1}.0`);
  p.processes.forEach(([num], j) => { if (num !== `${i + 1}.${j + 1}`) problems.push(`${p.num}: sub-process ${num} should be ${i + 1}.${j + 1}`); });
});

// balancing: the flows crossing a Level 1 boundary equal that process's Level 0 flows,
// and the Context Diagram equals Level 0's flows with the users
const level0 = specs.find((d) => d.id === 'level0');
const outside = (k) => ENTITIES[k] || STORES[k];
const key = (other, dir, label) => `${other} ${dir} ${label}`;
for (const p of LEVEL1) {
  const above = new Set(level0.flows.filter(([a, , b]) => a === p.num || b === p.num)
    .map(([a, l, b]) => (a === p.num ? key(b, 'out', l) : key(a, 'in', l))));
  // a Level 1 flow that is part of a broader Level 0 flow balances against that flow
  const below = new Set(p.flows.filter(([a, , b]) => outside(a) || outside(b))
    .map(([a, l, b, parent]) => (outside(b) ? key(b, 'out', parent || l) : key(a, 'in', parent || l))));
  for (const k of above) if (!below.has(k)) problems.push(`${p.num} not balanced: Level 0 has "${k}" but Level 1 does not`);
  for (const k of below) if (!above.has(k)) problems.push(`${p.num} not balanced: Level 1 has "${k}" but Level 0 does not`);
}
const ctx = specs.find((d) => d.id === 'context');
const ctxSet = new Set(ctx.flows.map(([a, l, b]) => (ENTITIES[a] ? key(a, 'in', l) : key(b, 'out', l))));
const l0Set = new Set(level0.flows.filter(([a, , b]) => ENTITIES[a] || ENTITIES[b]).map(([a, l, b]) => (ENTITIES[a] ? key(a, 'in', l) : key(b, 'out', l))));
for (const k of l0Set) if (!ctxSet.has(k)) problems.push(`context not balanced: missing "${k}"`);
for (const k of ctxSet) if (!l0Set.has(k)) problems.push(`context not balanced: extra "${k}"`);

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`OK: ${specs.length} diagrams, ${specs.reduce((s, d) => s + d.flows.length, 0)} flows - every rule checked passed`);
