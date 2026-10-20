// Diagram definitions for the CobraByte Context Diagram and DFDs (Gane-Sarson).
//
// Only the nine Level 1 diagrams are written by hand. Level 0 is built from
// their boundary flows and the Context Diagram from Level 0's user flows, so the
// levels always balance: every flow into or out of a process on one level
// appears, with the same label, on the level below. check.js tests the rules.

const STORES = {
  D1: 'Accounts', D2: 'Login Logs', D3: 'Sessions', D4: 'Chapters', D5: 'Modules',
  D6: 'Lessons', D7: 'Video Tutorials', D8: 'Learning Activities', D9: 'Coding Exercises',
  D10: 'Game Settings', D11: 'Learner Answers', D12: 'Exercise Submissions',
  D13: 'Learner Progress', D14: 'Badges', D15: 'Certificates', D16: 'Recommendations',
  D17: 'Audit Logs',
};

const ENTITIES = { admin: 'Admin', mentor: 'Mentor', learner: 'Learner' };

// Flows are [from, label, to] or [from, label, to, level0Label]: a Level 1 flow
// that is one part of a broader Level 0 flow names that flow as its 4th item
// (for example "Chapter Details" is part of "Course Content").
const LEVEL1 = [
  {
    num: '1.0', name: 'Register Account',
    processes: [['1.1', 'Validate\nRegistration'], ['1.2', 'Save Learner\nAccount'], ['1.3', 'Create Staff\nAccount']],
    flows: [
      ['learner', 'Registration Details', '1.1'],
      ['D1', 'Account Records', '1.1'],
      ['1.1', 'Verification Code', 'learner'],
      ['1.1', 'Validated Details', '1.2'],
      ['learner', 'Verification Code', '1.2'],
      ['1.2', 'Account Record', 'D1'],
      ['admin', 'Staff Account Details', '1.3'],
      ['D1', 'Account Records', '1.3'],
      ['1.3', 'Account Record', 'D1'],
      ['1.3', 'Account Details', 'admin'],
    ],
  },
  {
    num: '2.0', name: 'Authenticate User',
    processes: [['2.1', 'Verify\nCredentials'], ['2.2', 'Create\nSession']],
    flows: [
      ['learner', 'Login Credentials', '2.1'],
      ['mentor', 'Login Credentials', '2.1'],
      ['admin', 'Login Credentials', '2.1'],
      ['D1', 'Account Records', '2.1'],
      ['2.1', 'Login Status', 'D1'],
      ['2.1', 'Login Record', 'D2'],
      ['2.1', 'Verified User', '2.2'],
      ['2.2', 'Session Record', 'D3'],
      ['2.2', 'System Access', 'learner'],
      ['2.2', 'System Access', 'mentor'],
      ['2.2', 'System Access', 'admin'],
    ],
  },
  {
    num: '3.0', name: 'Manage Course Content',
    processes: [['3.1', 'Add\nChapter'], ['3.2', 'Add\nModule'], ['3.3', 'Add\nLesson'], ['3.4', 'Attach Video\nTutorial']],
    flows: [
      ['mentor', 'Chapter Details', '3.1', 'Course Content'],
      ['3.1', 'Chapter Record', 'D4'],
      ['mentor', 'Module Details', '3.2', 'Course Content'],
      ['D4', 'Chapter List', '3.2'],
      ['3.2', 'Module Record', 'D5'],
      ['mentor', 'Lesson Details', '3.3', 'Course Content'],
      ['D5', 'Module List', '3.3'],
      ['3.3', 'Lesson Record', 'D6'],
      ['mentor', 'Video Link', '3.4', 'Course Content'],
      ['D6', 'Lesson List', '3.4'],
      ['3.4', 'Video Record', 'D7'],
    ],
  },
  {
    num: '4.0', name: 'Manage Learning Activities',
    processes: [['4.1', 'Create\nActivity'], ['4.2', 'Add Question\nItems'], ['4.3', 'Create Coding\nExercise'], ['4.4', 'Set Question\nTimer']],
    flows: [
      ['mentor', 'Activity Details', '4.1', 'Activities and Exercises'],
      ['D6', 'Lesson List', '4.1'],
      ['4.1', 'Activity Record', 'D8'],
      ['4.1', 'New Activity', '4.2'],
      ['mentor', 'Question Items', '4.2', 'Activities and Exercises'],
      ['4.2', 'Activity Record', 'D8'],
      ['mentor', 'Exercise Details', '4.3', 'Activities and Exercises'],
      ['D6', 'Lesson List', '4.3'],
      ['4.3', 'Exercise Record', 'D9'],
      ['admin', 'Timer Settings', '4.4'],
      ['4.4', 'Timer Settings', 'D10'],
    ],
  },
  {
    num: '5.0', name: 'Publish Content',
    processes: [['5.1', 'Review\nContent'], ['5.2', 'Update Publish\nStatus']],
    flows: [
      ['mentor', 'Publishing Decision', '5.1'],
      ['D6', 'Lesson Content', '5.1'],
      ['D8', 'Activity Content', '5.1'],
      ['D9', 'Exercise Content', '5.1'],
      ['5.1', 'Content Preview', 'mentor'],
      ['5.1', 'Approved Content', '5.2'],
      ['5.2', 'Publishing Status', 'D6'],
      ['5.2', 'Publishing Status', 'D8'],
      ['5.2', 'Publishing Status', 'D9'],
    ],
  },
  {
    num: '6.0', name: 'Deliver Lessons\nand Activities',
    processes: [['6.1', 'Display\nLesson'], ['6.2', 'Check Activity\nAnswers'], ['6.3', 'Check Exercise\nCode']],
    flows: [
      ['D13', 'Unlocked Lessons', '6.1'],
      ['D6', 'Published Lessons', '6.1'],
      ['D7', 'Video Link', '6.1'],
      ['6.1', 'Lesson Content', 'learner', 'Lessons and Activities'],
      ['6.1', 'Lesson Progress', 'D13'],
      ['D8', 'Published Activities', '6.2'],
      ['D10', 'Timer Settings', '6.2'],
      ['6.2', 'Activity Questions', 'learner', 'Lessons and Activities'],
      ['learner', 'Activity Answers', '6.2', 'Answers and Code'],
      ['6.2', 'Answer Feedback', 'learner', 'Results and Feedback'],
      ['6.2', 'Answer Record', 'D11'],
      ['6.2', 'Lesson Progress', 'D13'],
      ['D9', 'Published Exercises', '6.3'],
      ['learner', 'Exercise Code', '6.3', 'Answers and Code'],
      ['6.3', 'Exercise Result', 'learner', 'Results and Feedback'],
      ['6.3', 'Submission Record', 'D12'],
      ['6.3', 'Lesson Progress', 'D13'],
    ],
  },
  {
    num: '7.0', name: 'Track Progress\nand Rewards',
    processes: [['7.1', 'Compute Lesson\nScore'], ['7.2', 'Check Module\nPass'], ['7.3', 'Find Weak\nSpots'], ['7.4', 'Award Badges and\nCertificate'], ['7.5', 'Define\nBadges']],
    flows: [
      ['D11', 'Answer Record', '7.1'],
      ['D12', 'Submission Record', '7.1'],
      ['7.1', 'Lesson Score', '7.2'],
      ['D13', 'Lesson Progress', '7.2'],
      ['7.2', 'Unlocked Lessons', 'D13'],
      ['7.2', 'Missed Items', '7.3'],
      ['7.2', 'Passed Modules', '7.4'],
      ['D6', 'Lesson Content', '7.3'],
      ['7.3', 'Recommendation Record', 'D16'],
      ['7.3', 'Weak Spot Review', 'learner', 'Results and Feedback'],
      ['D14', 'Badge Rules', '7.4'],
      ['7.4', 'Earned Badge', 'D14'],
      ['7.4', 'Certificate Record', 'D15'],
      ['7.4', 'Badges and Certificate', 'learner'],
      ['mentor', 'Badge Details', '7.5'],
      ['7.5', 'Badge Rules', 'D14'],
    ],
  },
  {
    num: '8.0', name: 'Manage Accounts',
    processes: [['8.1', 'Update Account\nStatus'], ['8.2', 'Update\nProfile']],
    flows: [
      ['admin', 'Account Action', '8.1'],
      ['D1', 'Account Records', '8.1'],
      ['8.1', 'Account Details', 'admin'],
      ['8.1', 'Account Updates', 'D1'],
      ['8.1', 'Audit Log Entry', 'D17'],
      ['learner', 'Profile Changes', '8.2'],
      ['D1', 'Account Records', '8.2'],
      ['8.2', 'Account Updates', 'D1'],
    ],
  },
  {
    num: '9.0', name: 'Generate Reports',
    processes: [['9.1', 'Generate Progress\nReport'], ['9.2', 'Generate System\nReport']],
    flows: [
      ['D13', 'Lesson Progress', '9.1'],
      ['D11', 'Answer Record', '9.1'],
      ['D16', 'Recommendation Record', '9.1'],
      ['9.1', 'Learner Progress Report', 'mentor'],
      ['9.1', 'Learner Progress Report', 'admin'],
      ['D1', 'Account Records', '9.2'],
      ['D2', 'Login Record', '9.2'],
      ['D15', 'Certificate Record', '9.2'],
      ['D17', 'Audit Log Entry', '9.2'],
      ['9.2', 'System Report', 'admin'],
    ],
  },
];

const isProc = (k) => !ENTITIES[k] && !STORES[k];

// Build one diagram. Flows between the same two boxes in the same direction share
// one arrow with stacked labels (each label once).
function diagram(id, title, level, processes, flows, order, opts = {}) {
  const nodes = [];
  const seen = new Set();
  const add = (n) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  processes.forEach(([num, label]) => add({ id: 'p' + num, type: 'process', num, label }));
  const ref = (k) => {
    if (ENTITIES[k]) { add({ id: k, type: 'entity', label: ENTITIES[k] }); return k; }
    if (STORES[k]) { add({ id: k, type: 'store', num: k, label: STORES[k] }); return k; }
    return 'p' + k;
  };
  (order || []).forEach(ref);
  const merged = new Map();
  flows.forEach(([from, label, to]) => {
    const key = from + '>' + to;
    if (!merged.has(key)) merged.set(key, { from, to, labels: [] });
    const m = merged.get(key);
    if (!m.labels.includes(label)) m.labels.push(label);
  });
  // with repeat, each process gets its own copy of a user or store (id 'D1@3.0');
  // a box drawn more than once carries the duplicate mark
  const uses = {};
  merged.forEach(({ from, to }) => [[from, to], [to, from]].forEach(([k, p]) => {
    if (!isProc(k)) (uses[k] = uses[k] || new Set()).add(p);
  }));
  const storeRef = (k, proc) => {
    if (!opts.repeat || isProc(k)) return ref(k);
    const id = `${k}@${proc}`;
    add({ id, type: STORES[k] ? 'store' : 'entity', num: STORES[k] ? k : undefined, label: STORES[k] || ENTITIES[k], duplicate: uses[k].size > 1 });
    return id;
  };
  const edges = [...merged.values()].map(({ from, to, labels }) => ({
    from: storeRef(from, to), to: storeRef(to, from), label: labels.join('\n'),
  }));
  return { id, title, level, nodes, edges, flows, processes };
}

// Level 0: each Level 1's flows that cross its boundary, with the sub-process
// replaced by the parent process.
const level0Flows = [];
LEVEL1.forEach((p) => p.flows.forEach(([a, own, b, parent]) => {
  const label = parent || own;
  if (isProc(a) && isProc(b)) return;  // internal to the process
  const f = [isProc(a) ? p.num : a, label, isProc(b) ? p.num : b];
  if (!level0Flows.some((g) => g.join('|') === f.join('|'))) level0Flows.push(f);
}));
const LEVEL0_PROCESSES = LEVEL1.map((p) => [p.num, p.name]);

// Context: Level 0's flows with the users, all through process 0.
const contextFlows = [];
level0Flows.forEach(([a, label, b]) => {
  if (!ENTITIES[a] && !ENTITIES[b]) return;
  const f = [ENTITIES[a] ? a : '0', label, ENTITIES[b] ? b : '0'];
  if (!contextFlows.some((g) => g.join('|') === f.join('|'))) contextFlows.push(f);
});

const specs = [];
module.exports = specs;
module.exports.STORES = STORES;
module.exports.ENTITIES = ENTITIES;
module.exports.LEVEL1 = LEVEL1;

const context = diagram('context', 'Context Diagram of CobraByte', 'Context',
  [['0', 'CobraByte:\nLearn Python\nthe Interactive Way']], contextFlows);
context.parts = { admin: 0, mentor: 0, learner: 2 };
context.star = { admin: 'left', mentor: 'right', learner: 'bottom' };  // drawn by hand: straight arrows
context.layout = { 'elk.direction': 'RIGHT' };
context.nodes.forEach((n) => { if (context.parts[n.id] != null) n.part = context.parts[n.id]; });
specs.push(context);

// Level 0 draws each user and data store again next to every process that uses it
// (as in the reference paper), with the Gane-Sarson duplicate mark, so no line
// has to cross the whole diagram.
const level0 = diagram('level0', 'Data Flow Diagram Level 0', '0', LEVEL0_PROCESSES, level0Flows,
  [], { repeat: true });
level0.flows = level0Flows;
level0.layout = { 'elk.layered.considerModelOrder.components': 'MODEL_ORDER', 'elk.aspectRatio': '1.45', 'elk.spacing.componentComponent': '40', 'elk.direction': 'RIGHT' };
level0.inDocument = false;  // printed as the three parts below
specs.push(level0);

// Level 0 has close to 100 flows, too many to read on one page. Each process sits in
// its own group (its users and stores are repeated), so the figure is printed in
// one column across three pages.
const LEVEL0_PARTS = [['1.0', '2.0', '3.0', '4.0', '5.0'], ['6.0', '7.0'], ['8.0', '9.0']];
LEVEL0_PARTS.forEach((nums, i) => {
  const part = diagram(`level0_part${i + 1}`,
    `Data Flow Diagram Level 0 (Part ${i + 1} of ${LEVEL0_PARTS.length}: ${nums[0]} to ${nums[nums.length - 1]})`, '0',
    LEVEL0_PROCESSES.filter(([n]) => nums.includes(n)),
    level0Flows.filter(([a, , b]) => nums.includes(a) || nums.includes(b)), [], { repeat: true });
  part.layout = { 'elk.layered.considerModelOrder.components': 'MODEL_ORDER', 'elk.aspectRatio': '0.2', 'elk.spacing.componentComponent': '40', 'elk.direction': 'RIGHT' };
  part.figure = 'level0';  // one figure number for all parts
  part.column = true;
  part.isCheckedElsewhere = true;
  specs.push(part);
});

const IN_ORDER = { 'elk.layered.considerModelOrder.components': 'MODEL_ORDER', 'elk.spacing.componentComponent': '30' };
LEVEL1.forEach((p) => specs.push(Object.assign(diagram(
  'l1_' + p.num.split('.')[0],
  `Data Flow Diagram Level 1 - ${p.num} ${p.name.replace(/\n/g, ' ')}`,
  '1', p.processes, p.flows,
  [], { repeat: true },  // users and stores drawn next to each sub-process: straight lines
), { column: true, layout: { 'elk.direction': 'RIGHT' } })));
