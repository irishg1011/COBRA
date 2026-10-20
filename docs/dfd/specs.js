// Diagram definitions for the CobraByte Context Diagram and DFDs.
// Store numbers (D1..D23) are shared by every diagram; see STORES.

const STORES = {
  D1: 'Accounts', D2: 'Login Logs', D3: 'Sessions', D4: 'Consent',
  D5: 'Chapters', D6: 'Modules', D7: 'Lessons', D8: 'Video Tutorials',
  D9: 'Learning Activities', D10: 'Coding Exercises', D11: 'Learner Answers',
  D12: 'Exercise Submissions', D13: 'Learner Progress', D14: 'Badges',
  D15: 'Certificates', D16: 'Recommendations', D17: 'Notifications',
  D18: 'Coding Sandbox', D19: 'Help Requests', D20: 'Audit Logs',
  D21: 'Title History', D22: 'Game Settings', D23: 'System Settings',
};

const ENTITIES = { admin: 'Admin', mentor: 'Mentor', learner: 'Learner', user: 'User\n(Learner, Mentor,\nAdmin)' };

// Build one diagram. nodes: entity keys, store keys ('D1'), or processes
// written as ['1.0', 'Registration'] (id = number). part overrides the column.
function diagram(id, title, level, opts) {
  const nodes = [];
  const seen = new Set();
  const add = (n) => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
  (opts.processes || []).forEach(([num, label, part]) => add({ id: 'p' + num, type: 'process', num, label, part }));
  (opts.nodes || []).forEach((n) => add(n));
  const ref = (k) => {
    if (ENTITIES[k]) { add({ id: k, type: 'entity', label: ENTITIES[k], part: opts.parts && opts.parts[k] }); return k; }
    if (STORES[k]) { add({ id: k, type: 'store', num: '', label: STORES[k], part: opts.parts && opts.parts[k] }); return k; }
    if (seen.has('p' + k)) return 'p' + k;
    if (seen.has(k)) return k;
    throw new Error(`${id}: unknown node ${k}`);
  };
  // Like the sample: flows between the same two boxes in the same direction share one
  // arrow with stacked labels, and Level 0/1 leave out writes to the log stores
  // (Login Logs, Audit Logs) - those side effects are drawn from Level 2 down.
  const LOG_STORES = new Set(['D2', 'D20']);
  const merged = new Map();
  opts.flows
    .filter(([from, , to]) => !((level === '0' || level === '1') && LOG_STORES.has(to) && !STORES[from]))
    .forEach(([from, label, to]) => {
      const key = from + '>' + to;
      if (merged.has(key)) { const m = merged.get(key); if (!m.label.split('\n').includes(label)) m.label += '\n' + label; }
      else merged.set(key, { from, to, label });
    });
  const used = new Set([...merged.values()].flatMap(({ from, to }) => [from, to]));
  (opts.order || []).filter((k) => used.has(k)).forEach(ref);  // never add a box with no lines
  const edges = [...merged.values()].map(({ from, to, label }) => ({ from: ref(from), to: ref(to), label }));
  return { id, title, level, intro: opts.intro, layout: opts.layout, nodes, edges };
}

// One copy of a diagram per user: only that user's flows, the processes they
// reach, and those processes' flows with the data stores. A flow can name the
// users it belongs to as a 4th item; processes with no user flow of their own
// are listed in opts.roles ({ '7.1': ['learner'] }) or appear for every user.
function byUser(users, id, title, level, opts) {
  const procNums = new Set((opts.processes || []).map(([num]) => num));
  return users.map((u) => {
    const touchesUser = (num) => opts.flows.some(([a, , b]) => (a === u && b === num) || (b === u && a === num));
    const usedBy = (num) => (opts.roles && opts.roles[num]) || null;
    const keep = new Set([...procNums].filter((num) => (usedBy(num) ? usedBy(num).includes(u) : touchesUser(num) || !opts.flows.some(([a, , b]) => (a === num && ENTITIES[b]) || (b === num && ENTITIES[a])))));
    const ok = (k) => k === u || keep.has(k) || STORES[k];
    const flows = opts.flows.filter(([a, , b, only]) => ok(a) && ok(b) && (keep.has(a) || keep.has(b)) && (!only || only.includes(u)));
    const used = new Set(flows.flatMap(([a, , b]) => [a, b]));
    const name = ENTITIES[u];
    return diagram(`${id}_${u}`, level === '0' ? `${title} – ${name}` : `${title} (${name})`, level, {
      ...opts,
      processes: opts.processes.filter(([num]) => keep.has(num)),
      order: (opts.order || []).filter((k) => used.has(k)),
      flows,
    });
  });
}

const specs = [];
module.exports = specs;
module.exports.STORES = STORES;

// ---------------------------------------------------------------- Context
specs.push(diagram('context', 'Context Diagram', 'Context', {
  nodes: [{ id: 'sys', type: 'system', label: 'CobraByte:\nLearn Python\nthe Interactive Way' }],
  parts: { admin: 0, mentor: 0, learner: 2 },
  flows: [
    ['admin', 'Username and Password', 'sys'],
    ['admin', 'Admin and Mentor Details', 'sys'],
    ['admin', 'Account Actions', 'sys'],
    ['admin', 'Help Request Actions', 'sys'],
    ['admin', 'Game Settings', 'sys'],
    ['sys', 'User Access', 'admin'],
    ['sys', 'Reports and Analytics', 'admin'],
    ['sys', 'Login and Activity Logs', 'admin'],
    ['sys', 'Help Requests', 'admin'],
    ['mentor', 'Username and Password', 'sys'],
    ['mentor', 'Course Content', 'sys'],
    ['mentor', 'Learning Activities and\nCoding Exercises', 'sys'],
    ['mentor', 'Publishing Actions', 'sys'],
    ['mentor', 'Badge Details', 'sys'],
    ['mentor', 'Help Request', 'sys'],
    ['sys', 'User Access', 'mentor'],
    ['sys', 'Content Preview', 'mentor'],
    ['sys', 'Learner Progress and\nRecommendations', 'mentor'],
    ['learner', 'Registration Details', 'sys'],
    ['learner', 'Username and Password', 'sys'],
    ['learner', 'Verification Code', 'sys'],
    ['learner', 'Answers and Code', 'sys'],
    ['learner', 'Profile Changes', 'sys'],
    ['sys', 'User Access', 'learner'],
    ['sys', 'Lessons, Videos and Activities', 'learner'],
    ['sys', 'Scores and Feedback', 'learner'],
    ['sys', 'Badges, Certificate and\nNotifications', 'learner'],
    ['sys', 'Verification Code', 'learner'],
  ],
}));

// ---------------------------------------------------------------- Level 0
specs.push(...byUser(['admin', 'mentor', 'learner'], 'level0', 'DFD Level 0', '0', {
  order: ['mentor', 'admin', 'learner', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'D14', 'D15', 'D16', 'D17', 'D19', 'D20'],
  layout: { 'elk.layered.crossingMinimization.forceNodeModelOrder': 'true' },
  processes: [
    ['1.0', 'Registration'], ['2.0', 'User\nAuthentication'], ['3.0', 'Course Content\nManagement'],
    ['4.0', 'Learning Activity\nManagement'], ['5.0', 'Publishing'], ['6.0', 'Learning'],
    ['7.0', 'Progress and\nAchievements'], ['8.0', 'Account\nManagement'], ['9.0', 'Reports and\nMonitoring'],
  ],
  flows: [
    ['learner', 'Registration Details', '1.0'],
    ['admin', 'Admin and Mentor Details', '1.0'],
    ['1.0', 'Verification Code', 'learner'],
    ['1.0', 'New Account', 'D1'],
    ['learner', 'Username and Password', '2.0'],
    ['mentor', 'Username and Password', '2.0'],
    ['admin', 'Username and Password', '2.0'],
    ['2.0', 'User Access', 'learner'],
    ['2.0', 'User Access', 'mentor'],
    ['2.0', 'User Access', 'admin'],
    ['2.0', 'Reset Code', 'learner'],
    ['D1', 'Account Verification', '2.0'],
    ['2.0', 'Login Attempt', 'D2'],
    ['2.0', 'Active Session', 'D3'],
    ['2.0', 'Accepted Terms', 'D4', ['learner']],
    ['mentor', 'Chapter, Module and\nLesson Details', '3.0'],
    ['3.0', 'Chapters', 'D5'],
    ['3.0', 'Modules', 'D6'],
    ['3.0', 'Lessons', 'D7'],
    ['3.0', 'Video Links', 'D8'],
    ['mentor', 'Activity and\nExercise Details', '4.0'],
    ['D7', 'Lesson List', '4.0'],
    ['4.0', 'Activity Items', 'D9'],
    ['4.0', 'Exercises and\nTest Cases', 'D10'],
    ['mentor', 'Publishing Actions', '5.0'],
    ['admin', 'Preview Request', '5.0'],
    ['D7', 'Content Tree', '5.0'],
    ['5.0', 'Content Status', 'D7', ['mentor']],
    ['5.0', 'Activity Status', 'D9', ['mentor']],
    ['5.0', 'Content Preview', 'admin'],
    ['5.0', 'Content Preview', 'mentor'],
    ['learner', 'Answers and Code', '6.0'],
    ['D7', 'Published Lessons', '6.0'],
    ['D9', 'Published Activities', '6.0'],
    ['D10', 'Published Exercises', '6.0'],
    ['6.0', 'Lessons and Feedback', 'learner'],
    ['6.0', 'Answers and Scores', 'D11'],
    ['6.0', 'Code Submissions', 'D12'],
    ['6.0', 'Lesson Progress', 'D13'],
    ['D11', 'Scores', '7.0', ['learner']],
    ['D12', 'Exercise Results', '7.0', ['learner']],
    ['mentor', 'Badge Details', '7.0'],
    ['7.0', 'Unlocks', 'D13', ['learner']],
    ['7.0', 'Earned Badges', 'D14', ['learner']],
    ['7.0', 'Badge Rules', 'D14', ['mentor']],
    ['7.0', 'Certificate', 'D15', ['learner']],
    ['7.0', 'Weak Spots', 'D16', ['learner']],
    ['D16', 'Recommendations', '7.0', ['mentor']],
    ['7.0', 'Recommendations', 'mentor'],
    ['7.0', 'Alerts', 'D17', ['learner']],
    ['7.0', 'Badges and Certificate', 'learner'],
    ['admin', 'Account Actions', '8.0'],
    ['learner', 'Profile Changes', '8.0'],
    ['mentor', 'Help Request', '8.0'],
    ['8.0', 'Account Changes', 'D1'],
    ['8.0', 'Help Requests', 'D19', ['mentor', 'admin']],
    ['8.0', 'Action Log', 'D20', ['admin']],
    ['D1', 'Accounts', '9.0', ['admin']],
    ['D2', 'Login Logs', '9.0', ['admin']],
    ['D13', 'Progress', '9.0'],
    ['D20', 'Activity Log', '9.0', ['admin']],
    ['D9', 'Content Status', '9.0', ['mentor']],
    ['9.0', 'Reports and Analytics', 'admin'],
    ['9.0', 'Learner Progress', 'mentor'],
  ],
}));

// ================================================================ 1.0 Registration
specs.push(...byUser(['admin', 'learner'], 'l1_registration', 'Registration – DFD Level 1', '1', {
  processes: [['1.1', 'Enter\nRegistration\nDetails'], ['1.2', 'Validate\nRegistration'], ['1.3', 'Send\nVerification\nCode'], ['1.4', 'Verify Code'], ['1.5', 'Create Learner\nAccount'], ['1.6', 'Create Admin /\nMentor Account']],
  flows: [
    ['learner', 'Name, Birthdate, Gender,\nEmail, Username, Password', '1.1'],
    ['D1', 'Gender List', '1.1'],
    ['1.1', 'Registration Details', '1.2'],
    ['D1', 'Existing Emails\nand Usernames', '1.2'],
    ['1.2', 'Validation Errors', 'learner'],
    ['1.2', 'Valid Email', '1.3'],
    ['1.3', 'Verification Code\n(valid 5 minutes)', 'learner'],
    ['learner', 'Verification Code', '1.4'],
    ['1.4', 'Verified Details', '1.5'],
    ['1.5', 'New Learner Account\nand Profile', 'D1'],
    ['1.5', 'New Sign-up Alert', 'D17'],
    ['1.5', 'Registration Confirmation', 'learner'],
    ['admin', 'Admin / Mentor Details', '1.6'],
    ['D1', 'Next Account ID', '1.6'],
    ['1.6', 'New Staff Account', 'D1'],
    ['1.6', 'Account Created', 'D20'],
    ['1.6', 'Generated Account ID', 'admin'],
  ],
}));

specs.push(diagram('l2_validate_registration', 'Validate Registration – DFD Level 2', '2', {
  processes: [['1.2.1', 'Check Required\nFields'], ['1.2.2', 'Check Age\n(13 to 60)'], ['1.2.3', 'Check Password\nRules'], ['1.2.4', 'Check Email and\nUsername'], ['1.2.5', 'Accept\nRegistration']],
  flows: [
    ['learner', 'Registration Details', '1.2.1'],
    ['1.2.1', 'Complete Details', '1.2.2'],
    ['1.2.1', 'Missing Fields', 'learner'],
    ['1.2.2', 'Valid Birthdate', '1.2.3'],
    ['1.2.2', 'Age Not Allowed', 'learner'],
    ['1.2.3', 'Valid Password', '1.2.4'],
    ['1.2.3', 'Password Rules\nNot Met', 'learner'],
    ['D1', 'Existing Emails\nand Usernames', '1.2.4'],
    ['1.2.4', 'Email or Username\nTaken', 'learner'],
    ['1.2.4', 'Available Email\nand Username', '1.2.5'],
    ['1.2.5', 'Verification Code\nSent', 'learner'],
  ],
}));

// ================================================================ 2.0 User Authentication
specs.push(...byUser(['admin', 'mentor', 'learner'], 'l1_auth', 'User Authentication – DFD Level 1', '1', {
  processes: [['2.1', 'Log In'], ['2.2', 'Check Terms\nConsent'], ['2.3', 'Recover\nPassword'], ['2.4', 'Recover\nUsername'], ['2.5', 'Change\nPassword'], ['2.6', 'Log Out']],
  order: ['learner', 'mentor', 'admin'],
  flows: [
    ['learner', 'Username and Password', '2.1'],
    ['mentor', 'Username and Password', '2.1'],
    ['admin', 'Username and Password', '2.1'],
    ['D1', 'Account Verification', '2.1'],
    ['2.1', 'Failed Attempts, Lockout,\nLast Login', 'D1'],
    ['2.1', 'Login and Lockout Logs', 'D2'],
    ['2.1', 'Session Token', 'D3'],
    ['2.1', 'User Access', 'learner'],
    ['2.1', 'User Access', 'mentor'],
    ['2.1', 'User Access', 'admin'],
    ['D3', 'Signed-in Learner', '2.2'],
    ['D4', 'Accepted Versions', '2.2'],
    ['learner', 'Terms and Privacy\nAcceptance', '2.2'],
    ['2.2', 'Consent Record', 'D4'],
    ['learner', 'Registered Email,\nReset Code, New Password', '2.3'],
    ['mentor', 'Registered Email,\nReset Code, New Password', '2.3'],
    ['admin', 'Registered Email,\nReset Code, New Password', '2.3'],
    ['D1', 'Account by Email', '2.3'],
    ['2.3', 'Reset Code', 'learner'],
    ['2.3', 'Reset Code', 'mentor'],
    ['2.3', 'Reset Code', 'admin'],
    ['2.3', 'New Password', 'D1'],
    ['2.3', 'Password Reset Log', 'D2'],
    ['learner', 'Registered Email\nand Code', '2.4'],
    ['D1', 'Account by Email', '2.4'],
    ['2.4', 'Username Code', 'learner'],
    ['2.4', 'Username', 'learner'],
    ['mentor', 'Old Password, Code,\nNew Password', '2.5'],
    ['learner', 'Old Password, Code,\nNew Password', '2.5'],
    ['admin', 'Old Password, Code,\nNew Password', '2.5'],
    ['2.5', 'Password Changes', 'D1'],
    ['2.5', 'Other Devices\nSigned Out', 'D3'],
    ['learner', 'Log Out Request', '2.6'],
    ['mentor', 'Log Out Request', '2.6'],
    ['admin', 'Log Out Request', '2.6'],
    ['2.6', 'Ended Session', 'D3'],
  ],
}));

specs.push(diagram('l2_login', 'Log In – DFD Level 2', '2', {
  processes: [['2.1.1', 'Check Login\nDoor and Role'], ['2.1.2', 'Check Account\nStatus'], ['2.1.3', 'Verify\nPassword'], ['2.1.4', 'Create\nSession'], ['2.1.5', 'Open Role\nHome Page']],
  flows: [
    ['user', 'Username and Password', '2.1.1'],
    ['D1', 'Account Role', '2.1.1'],
    ['2.1.1', 'Wrong Door: Invalid\nUsername or Password', 'user'],
    ['2.1.1', 'Failed Attempt', 'D2'],
    ['2.1.1', 'Matched Account', '2.1.2'],
    ['D1', 'Archived, Inactive,\nPending Deletion', '2.1.2'],
    ['2.1.2', 'Account Archived or\nRestore Prompt', 'user'],
    ['2.1.2', 'Active Account', '2.1.3'],
    ['2.1.3', 'Correct Password', '2.1.4'],
    ['2.1.3', 'Remaining Attempts\nor Lockout', 'user'],
    ['2.1.4', 'Last Login, Status Active', 'D1'],
    ['2.1.4', 'Successful Login', 'D2'],
    ['2.1.4', 'Session Token', 'D3'],
    ['2.1.4', 'Role', '2.1.5'],
    ['2.1.5', 'Role Home Page', 'user'],
  ],
}));

specs.push(diagram('l2_recover_password', 'Recover Password – DFD Level 2', '2', {
  processes: [['2.3.1', 'Find Account\nby Email'], ['2.3.2', 'Send Reset\nCode'], ['2.3.3', 'Verify Reset\nCode'], ['2.3.4', 'Check Password\nRules'], ['2.3.5', 'Save New\nPassword']],
  flows: [
    ['learner', 'Registered Email', '2.3.1'],
    ['D1', 'Account Details', '2.3.1'],
    ['2.3.1', 'Matched Account', '2.3.2'],
    ['2.3.2', 'Reset Code', 'learner'],
    ['learner', 'Reset Code', '2.3.3'],
    ['2.3.3', 'Invalid or\nExpired Code', 'learner'],
    ['2.3.3', 'Verified Code', '2.3.4'],
    ['learner', 'New and Confirm\nPassword', '2.3.4'],
    ['2.3.4', 'Password Rules\nNot Met', 'learner'],
    ['2.3.4', 'Valid Password', '2.3.5'],
    ['2.3.5', 'Password Hash', 'D1'],
    ['2.3.5', 'Password Reset Log', 'D2'],
    ['2.3.5', 'Password Changed', 'learner'],
  ],
}));

specs.push(diagram('l3_verify_password', 'User Authentication – DFD Level 3', '3', {
  processes: [['2.1.3.1', 'Check\nLockout'], ['2.1.3.2', 'Compare\nPassword Hash'], ['2.1.3.3', 'Handle Failed\nAttempt'], ['2.1.3.4', 'Clear Failed\nAttempts']],
  flows: [
    ['user', 'Password', '2.1.3.2'],
    ['D1', 'Lockout Until', '2.1.3.1'],
    ['2.1.3.1', 'Expired Lockout\nCleared', 'D1'],
    ['2.1.3.1', 'Try Again in\n1 Minute', 'user'],
    ['2.1.3.1', 'Not Locked', '2.1.3.2'],
    ['D1', 'Stored Password Hash', '2.1.3.2'],
    ['2.1.3.2', 'Wrong Password', '2.1.3.3'],
    ['2.1.3.2', 'Correct Password', '2.1.3.4'],
    ['2.1.3.3', 'Failed Attempts', 'D1'],
    ['2.1.3.3', 'Failed Login,\nLockout Event', 'D2'],
    ['2.1.3.3', 'Remaining Attempts\nor Locked', 'user'],
    ['2.1.3.4', 'Failed Attempts = 0', 'D1'],
    ['2.1.3.4', 'User Access', 'user'],
  ],
}));

specs.push(diagram('l4_failed_attempt', 'User Authentication – DFD Level 4', '4', {
  processes: [['2.1.3.3.1', 'Log Failed\nAttempt'], ['2.1.3.3.2', 'Add to Failed\nCount'], ['2.1.3.3.3', 'Check Attempt\nLimit (5)'], ['2.1.3.3.4', 'Lock Account\nfor 1 Minute'], ['2.1.3.3.5', 'Log Lockout\nand Alert Admins'], ['2.1.3.3.6', 'Show Remaining\nAttempts']],
  flows: [
    ['user', 'Wrong Password', '2.1.3.3.1'],
    ['2.1.3.3.1', 'Failed Login, IP Address', 'D2'],
    ['2.1.3.3.1', 'Failed Attempt', '2.1.3.3.2'],
    ['D1', 'Failed Attempts', '2.1.3.3.2'],
    ['2.1.3.3.2', 'New Count', '2.1.3.3.3'],
    ['2.1.3.3.3', 'Limit Reached', '2.1.3.3.4'],
    ['2.1.3.3.3', 'Below Limit', '2.1.3.3.6'],
    ['2.1.3.3.4', 'Lockout Until', 'D1'],
    ['2.1.3.3.4', 'Locked Account', '2.1.3.3.5'],
    ['2.1.3.3.4', 'Too Many Failed\nAttempts', 'user'],
    ['2.1.3.3.5', 'Lockout Event', 'D2'],
    ['2.1.3.3.5', 'Lockout Alert', 'D17'],
    ['2.1.3.3.6', 'Failed Attempts', 'D1'],
    ['2.1.3.3.6', 'Attempts Remaining', 'user'],
  ],
}));

// ================================================================ 3.0 Course Content Management
specs.push(diagram('l1_course', 'Course Content Management – DFD Level 1', '1', {
  processes: [['3.1', 'Manage\nChapters'], ['3.2', 'Manage\nModules'], ['3.3', 'Manage\nLessons'], ['3.4', 'Manage Video\nTutorials'], ['3.5', 'Archive and\nRestore Content'], ['3.6', 'Track Title\nHistory']],
  flows: [
    ['mentor', 'Chapter Details,\nSkip Settings', '3.1'],
    ['3.1', 'Chapter Records', 'D5'],
    ['mentor', 'Module Details', '3.2'],
    ['D5', 'Chapter List', '3.2'],
    ['3.2', 'Module Records', 'D6'],
    ['mentor', 'Lesson Title\nand Content', '3.3'],
    ['D6', 'Module List', '3.3'],
    ['3.3', 'Lesson Draft and\nContent, Images', 'D7'],
    ['mentor', 'YouTube Link', '3.4'],
    ['D7', 'Lesson List', '3.4'],
    ['3.4', 'Video ID', 'D8'],
    ['mentor', 'Archive / Restore /\nDelete Request', '3.5'],
    ['3.5', 'Archived Chapter', 'D5'],
    ['3.5', 'Archived Module', 'D6'],
    ['3.5', 'Archived Lesson', 'D7'],
    ['3.5', 'Content Action', 'D20'],
    ['3.1', 'Title Change', '3.6'],
    ['3.2', 'Title Change', '3.6'],
    ['3.3', 'Title Change', '3.6'],
    ['mentor', 'Revert Request', '3.6'],
    ['3.6', 'Created / Renamed /\nReverted Title', 'D21'],
    ['3.6', 'Title History', 'mentor'],
  ],
}));

specs.push(diagram('l2_lessons', 'Manage Lessons – DFD Level 2', '2', {
  processes: [['3.3.1', 'Select Chapter\nand Module'], ['3.3.2', 'Check Lesson\nName'], ['3.3.3', 'Write Lesson\nContent'], ['3.3.4', 'Upload\nImages'], ['3.3.5', 'Save Draft'], ['3.3.6', 'Mark Ready\nto Publish']],
  flows: [
    ['D5', 'Chapter List', '3.3.1'],
    ['D6', 'Modules by Chapter', '3.3.1'],
    ['mentor', 'Chapter and Module', '3.3.1'],
    ['3.3.1', 'Selected Module', '3.3.5'],
    ['mentor', 'Lesson Name', '3.3.2'],
    ['D7', 'Existing Lesson Names', '3.3.2'],
    ['3.3.2', 'Name Taken or\nNot Sentence Case', 'mentor'],
    ['3.3.2', 'Valid Name', '3.3.5'],
    ['mentor', 'Rich-Text Content', '3.3.3'],
    ['mentor', 'Image File', '3.3.4'],
    ['3.3.4', 'Uploaded Image', 'D7'],
    ['3.3.4', 'Image Link', '3.3.3'],
    ['3.3.3', 'Lesson Content', '3.3.5'],
    ['3.3.5', 'Draft Lesson\nand Content', 'D7'],
    ['3.3.5', 'Title Change', 'D21'],
    ['3.3.5', 'Draft Saved', 'mentor'],
    ['mentor', 'Mark Ready Request', '3.3.6'],
    ['3.3.6', 'Ready to Publish', 'D7'],
  ],
}));

specs.push(diagram('l2_archive', 'Archive and Restore Content – DFD Level 2', '2', {
  processes: [['3.5.1', 'Check Archive\nImpact'], ['3.5.2', 'Archive Item'], ['3.5.3', 'Choose Restore\nOptions'], ['3.5.4', 'Restore Items'], ['3.5.5', 'Permanently\nDelete']],
  flows: [
    ['mentor', 'Archive Request', '3.5.1'],
    ['D7', 'Lessons, Activities\nand Exercises Inside', '3.5.1'],
    ['3.5.1', 'Items Affected', 'mentor'],
    ['mentor', 'Confirm Archive', '3.5.2'],
    ['3.5.2', 'Archived Chapter\nor Module', 'D6'],
    ['3.5.2', 'Archived Lesson', 'D7'],
    ['3.5.2', 'Archive Log', 'D20'],
    ['mentor', 'Restore Request', '3.5.3'],
    ['D6', 'Archived Items', '3.5.3'],
    ['3.5.3', 'Selected Items', '3.5.4'],
    ['3.5.4', 'Restored Module', 'D6'],
    ['3.5.4', 'Restored Lesson', 'D7'],
    ['3.5.4', 'Restore Log', 'D20'],
    ['mentor', 'Delete Request', '3.5.5'],
    ['3.5.5', 'Removed Record', 'D7'],
    ['3.5.5', 'Delete Log', 'D20'],
  ],
}));

// ================================================================ 4.0 Learning Activity Management
specs.push(...byUser(['admin', 'mentor'], 'l1_activities', 'Learning Activity Management – DFD Level 1', '1', {
  processes: [['4.1', 'Enter Activity\nInformation'], ['4.2', 'Build Multiple\nChoice Items'], ['4.3', 'Build Fill in\nthe Blanks'], ['4.4', 'Build\nFlashcards'], ['4.5', 'Create Coding\nExercise'], ['4.6', 'Quick Edit\nItems'], ['4.7', 'Set Game\nSettings']],
  order: ['mentor', 'admin'],
  flows: [
    ['mentor', 'Title, Lesson, Type,\nPoints', '4.1'],
    ['D7', 'Lessons by Module', '4.1'],
    ['4.1', 'Activity Draft', 'D9'],
    ['4.1', 'Multiple Choice', '4.2'],
    ['4.1', 'Fill in the Blanks', '4.3'],
    ['4.1', 'Flashcards', '4.4'],
    ['mentor', 'Questions and Options', '4.2'],
    ['4.2', 'MCQ Questions\nand Options', 'D9'],
    ['mentor', 'Code with Blanks,\nAnswers', '4.3'],
    ['4.3', 'Fill in the Blanks Items', 'D9'],
    ['mentor', 'Front and Back', '4.4'],
    ['4.4', 'Flashcards', 'D9'],
    ['mentor', 'Instructions, Expected\nOutput, Required Tags', '4.5'],
    ['D7', 'Lesson List', '4.5'],
    ['4.5', 'Exercise and\nTest Cases', 'D10'],
    ['mentor', 'Item Corrections', '4.6'],
    ['4.6', 'Updated Item', 'D9'],
    ['4.6', 'Updated Exercise', 'D10'],
    ['admin', 'Question Timer\nper Game', '4.7'],
    ['4.7', 'Game Settings', 'D22'],
  ],
}));

specs.push(diagram('l2_mcq', 'Build Multiple Choice Items – DFD Level 2', '2', {
  processes: [['4.2.1', 'Enter\nQuestion'], ['4.2.2', 'Enter\nOptions'], ['4.2.3', 'Mark Correct\nAnswer'], ['4.2.4', 'Check Item\nRules'], ['4.2.5', 'Save Items']],
  flows: [
    ['mentor', 'Question Text', '4.2.1'],
    ['4.2.1', 'Question', '4.2.4'],
    ['mentor', 'Answer Choices', '4.2.2'],
    ['4.2.2', 'Options', '4.2.4'],
    ['mentor', 'Correct Option', '4.2.3'],
    ['4.2.3', 'Answer Key', '4.2.4'],
    ['4.2.4', 'Item Problem\n(e.g. Question #3)', 'mentor'],
    ['4.2.4', 'Valid Items', '4.2.5'],
    ['D9', 'Activity Draft', '4.2.5'],
    ['4.2.5', 'Questions and Options', 'D9'],
    ['4.2.5', 'Items Saved', 'mentor'],
  ],
}));

specs.push(diagram('l2_exercise', 'Create Coding Exercise – DFD Level 2', '2', {
  processes: [['4.5.1', 'Enter Exercise\nDetails'], ['4.5.2', 'Check Exercise\nTitle'], ['4.5.3', 'Generate\nExpected Output'], ['4.5.4', 'Set Required\nTags'], ['4.5.5', 'Save Draft or\nMark Ready']],
  flows: [
    ['mentor', 'Title, Instructions,\nAnswer Code', '4.5.1'],
    ['D7', 'Lessons by Module', '4.5.1'],
    ['4.5.1', 'Exercise Title', '4.5.2'],
    ['D10', 'Existing Titles', '4.5.2'],
    ['4.5.2', 'Title Taken', 'mentor'],
    ['4.5.1', 'Answer Code', '4.5.3'],
    ['4.5.3', 'Expected Output', 'mentor'],
    ['mentor', 'Concepts, Functions,\nMethods', '4.5.4'],
    ['4.5.2', 'Valid Title', '4.5.5'],
    ['4.5.3', 'Expected Output', '4.5.5'],
    ['4.5.4', 'Required Tags', '4.5.5'],
    ['4.5.5', 'Exercise, Test Case,\nRequired Tags', 'D10'],
    ['4.5.5', 'Title Change', 'D21'],
    ['4.5.5', 'Exercise Saved', 'mentor'],
  ],
}));

// ================================================================ 5.0 Publishing
specs.push(...byUser(['admin', 'mentor'], 'l1_publishing', 'Publishing – DFD Level 1', '1', {
  processes: [['5.1', 'Load Content\nTree'], ['5.2', 'Mark Ready\nto Publish'], ['5.3', 'Publish\nContent'], ['5.4', 'Unpublish\nContent'], ['5.5', 'Reorder\nContent'], ['5.6', 'Preview\nContent']],
  order: ['mentor', 'admin'],
  flows: [
    ['D5', 'Chapters', '5.1'],
    ['D6', 'Modules', '5.1'],
    ['D7', 'Lessons', '5.1'],
    ['D8', 'Videos', '5.1'],
    ['D9', 'Activities', '5.1'],
    ['D10', 'Exercises', '5.1'],
    ['5.1', 'Content Tree\nand Status', 'mentor'],
    ['5.1', 'Content Tree\n(view only)', 'admin'],
    ['mentor', 'Mark Ready /\nMove to Draft', '5.2'],
    ['5.2', 'Ready Status', 'D7'],
    ['mentor', 'Publish Request', '5.3'],
    ['5.3', 'Published Chapter', 'D5'],
    ['5.3', 'Published Module', 'D6'],
    ['5.3', 'Published Lesson', 'D7'],
    ['5.3', 'Published Video', 'D8'],
    ['5.3', 'Published Activity', 'D9'],
    ['5.3', 'Published Exercise', 'D10'],
    ['5.3', 'Publish Log', 'D20'],
    ['mentor', 'Unpublish Request', '5.4'],
    ['5.4', 'Back to Ready', 'D7'],
    ['5.4', 'Unpublish Log', 'D20'],
    ['mentor', 'New Order', '5.5'],
    ['5.5', 'Display Order', 'D6'],
    ['mentor', 'Preview Request', '5.6'],
    ['admin', 'Preview Request', '5.6'],
    ['D9', 'Items to Preview', '5.6'],
    ['5.6', 'Learner View\n(nothing saved)', 'mentor'],
    ['5.6', 'Learner View\n(nothing saved)', 'admin'],
  ],
}));

specs.push(diagram('l2_publish', 'Publish Content – DFD Level 2', '2', {
  processes: [['5.3.1', 'Check Item\nis Ready'], ['5.3.2', 'Check Parent\nis Published'], ['5.3.3', 'Run Publish\nChecklist'], ['5.3.4', 'Publish Item\nand Children'], ['5.3.5', 'Log and\nConfirm']],
  flows: [
    ['mentor', 'Publish Request', '5.3.1'],
    ['D7', 'Item Status', '5.3.1'],
    ['5.3.1', 'Not Ready', 'mentor'],
    ['5.3.1', 'Ready Item', '5.3.2'],
    ['D6', 'Parent Status', '5.3.2'],
    ['5.3.2', 'Parent Not Published', 'mentor'],
    ['5.3.2', 'Parent Published', '5.3.3'],
    ['D9', 'Item Counts\nand Content', '5.3.3'],
    ['5.3.3', 'Checklist Problems', 'mentor'],
    ['5.3.3', 'Checklist Passed', '5.3.4'],
    ['5.3.4', 'Published Status,\nPublished Date', 'D7'],
    ['5.3.4', 'Published Activities', 'D9'],
    ['5.3.4', 'Published Exercises', 'D10'],
    ['5.3.4', 'Published Items', '5.3.5'],
    ['5.3.5', 'Publish Log', 'D20'],
    ['5.3.5', 'Published', 'mentor'],
  ],
}));

// ================================================================ 6.0 Learning
specs.push(diagram('l1_learning', 'Learning – DFD Level 1', '1', {
  processes: [['6.1', 'View Learning\nMap'], ['6.2', 'Read Lesson and\nWatch Video'], ['6.3', 'Play Learning\nActivity'], ['6.4', 'Solve Coding\nExercise'], ['6.5', 'Retake Missed\nItems'], ['6.6', 'Use Coding\nSandbox'], ['6.7', 'Skip\nChapter']],
  flows: [
    ['D5', 'Published Chapters', '6.1'],
    ['D6', 'Published Modules', '6.1'],
    ['D13', 'Unlocks and Progress', '6.1'],
    ['6.1', 'Learning Map', 'learner'],
    ['learner', 'Selected Lesson', '6.2'],
    ['D7', 'Lesson Content', '6.2'],
    ['D8', 'Video', '6.2'],
    ['6.2', 'Lesson and Video', 'learner'],
    ['6.2', 'Content Read,\nVideo Watched', 'D13'],
    ['learner', 'Answers', '6.3'],
    ['D9', 'Drawn Items', '6.3'],
    ['D22', 'Question Timer', '6.3'],
    ['6.3', 'Answers and Outcomes', 'D11'],
    ['6.3', 'Lives and Activity\nProgress', 'D13'],
    ['6.3', 'Feedback, Lives, Score', 'learner'],
    ['learner', 'Python Code\nand Output', '6.4'],
    ['D10', 'Exercise and\nExpected Output', '6.4'],
    ['6.4', 'Submission and Result', 'D12'],
    ['6.4', 'Pass or Try Again', 'learner'],
    ['learner', 'Retake Request', '6.5'],
    ['D11', 'Missed Items', '6.5'],
    ['6.5', 'Retake Round', 'D11'],
    ['6.5', 'Retake Items', 'learner'],
    ['learner', 'Code Snippet', '6.6'],
    ['6.6', 'Runs and Saved\nSnippets', 'D18'],
    ['learner', 'Skip Answer', '6.7'],
    ['D5', 'Skippable Chapter,\nSkip Question', '6.7'],
    ['6.7', 'Chapter Skip', 'D13'],
  ],
}));

specs.push(diagram('l2_play', 'Play Learning Activity – DFD Level 2', '2', {
  processes: [['6.3.1', 'Draw 5\nUnseen Items'], ['6.3.2', 'Reveal Item and\nStart Timer'], ['6.3.3', 'Check Answer'], ['6.3.4', 'Update Lives'], ['6.3.5', 'Detect Leaving\nthe Page'], ['6.3.6', 'Finish Play\nand Score']],
  flows: [
    ['learner', 'Start Activity', '6.3.1'],
    ['D9', 'Item Pool', '6.3.1'],
    ['D11', 'Items Already Seen', '6.3.1'],
    ['6.3.1', 'New Play and\nDrawn Items', 'D11'],
    ['6.3.1', 'Drawn Items', '6.3.2'],
    ['D22', 'Time Limit', '6.3.2'],
    ['6.3.2', 'Question', 'learner'],
    ['6.3.2', 'Shown Time', 'D11'],
    ['learner', 'Answer or Skip', '6.3.3'],
    ['D9', 'Correct Answer', '6.3.3'],
    ['6.3.3', 'Outcome (Correct, Wrong,\nSkipped, Timed Out)', 'D11'],
    ['6.3.3', 'Correct or Wrong', 'learner'],
    ['6.3.3', 'Wrong, Skipped,\nTimed Out', '6.3.4'],
    ['D13', 'Lives and Bonus Lives', '6.3.4'],
    ['6.3.4', 'Lives Left', 'D13'],
    ['6.3.4', 'Lives Left', 'learner'],
    ['learner', 'Page Hidden / Returned', '6.3.5'],
    ['6.3.5', 'Leave Log', 'D11'],
    ['6.3.5', 'Item Left (-1 Life)', '6.3.4'],
    ['6.3.3', 'Last Item Answered', '6.3.6'],
    ['6.3.6', 'Activity Completed', 'D13'],
    ['6.3.6', 'Score and Review', 'learner'],
  ],
}));

specs.push(diagram('l2_solve', 'Solve Coding Exercise – DFD Level 2', '2', {
  processes: [['6.4.1', 'Load\nExercise'], ['6.4.2', 'Run Code in\nBrowser'], ['6.4.3', 'Compare\nOutput'], ['6.4.4', 'Check Required\nTags'], ['6.4.5', 'Save Result\nand Progress']],
  flows: [
    ['learner', 'Open Exercise', '6.4.1'],
    ['D10', 'Instructions, Expected\nOutput, Tags', '6.4.1'],
    ['6.4.1', 'Exercise', 'learner'],
    ['learner', 'Python Code', '6.4.2'],
    ['6.4.2', 'Printed Output\nor Error', '6.4.3'],
    ['D10', 'Expected Output', '6.4.3'],
    ['6.4.3', 'Output Matches', '6.4.4'],
    ['6.4.3', 'Wrong Output or Error', '6.4.5'],
    ['D10', 'Required Tags', '6.4.4'],
    ['6.4.4', 'Tags Found / Missing', '6.4.5'],
    ['6.4.5', 'Submission', 'D12'],
    ['6.4.5', 'Exercise Progress', 'D13'],
    ['6.4.5', 'Passed or Hints', 'learner'],
  ],
}));

// ================================================================ 7.0 Progress and Achievements
specs.push(...byUser(['mentor', 'learner'], 'l1_progress', 'Progress and Achievements – DFD Level 1', '1', {
  processes: [['7.1', 'Compute Lesson\nPerformance'], ['7.2', 'Check Module\nGate (80%)'], ['7.3', 'Unlock Next\nContent'], ['7.4', 'Find Weak\nSpots'], ['7.5', 'Manage\nBadges'], ['7.6', 'Award\nBadges'], ['7.7', 'Issue\nCertificate'], ['7.8', 'Show\nNotifications']],
  order: ['learner', 'mentor', 'D11', 'D12', 'D13', 'D7', 'D16', 'D14', 'D15', 'D17'],
  roles: { '7.1': ['learner'], '7.2': ['learner'], '7.3': ['learner'], '7.6': ['learner'] },
  flows: [
    ['D11', 'First-Attempt Results', '7.1'],
    ['D12', 'Exercise Results', '7.1'],
    ['7.1', 'Lesson Performance %', 'D13'],
    ['D13', 'Lesson Performance,\nCompleted Lessons', '7.2'],
    ['7.2', 'Module Passed', 'D13'],
    ['D13', 'Passed Modules', '7.3'],
    ['7.3', 'Chapter Unlock', 'D13'],
    ['D11', 'Missed Items', '7.4', ['learner']],
    ['D7', 'Lesson Parts', '7.4', ['learner']],
    ['7.4', 'Lesson Recommendation', 'D16', ['learner']],
    ['7.4', 'Weak Spot Review', 'learner'],
    ['D16', 'Recommendations', '7.4', ['mentor']],
    ['7.4', 'Recommendations', 'mentor'],
    ['mentor', 'Badge Name, Rule,\nRequired Value', '7.5'],
    ['7.5', 'Badge', 'D14'],
    ['D14', 'Active Badges', '7.6'],
    ['D13', 'Learner Facts', '7.6'],
    ['7.6', 'Earned Badge', 'D14'],
    ['7.6', 'Badge Notification', 'D17'],
    ['D13', 'Chapters Passed', '7.7'],
    ['7.7', 'Certificate', 'D15'],
    ['7.7', 'Course Completed\nNotification', 'D17'],
    ['7.7', 'Certificate of\nCompletion', 'learner'],
    ['D17', 'Unread Notifications', '7.8'],
    ['7.8', 'Bell Notifications', 'learner'],
  ],
}));


specs.push(diagram('l2_weak_spots', 'Find Weak Spots – DFD Level 2', '2', {
  processes: [['7.4.1', 'Collect Missed\nItems'], ['7.4.2', 'Extract Key\nTerms'], ['7.4.3', 'Split Lesson\ninto Parts'], ['7.4.4', 'Score Parts'], ['7.4.5', 'Save\nRecommendation'], ['7.4.6', 'Track Review\nStatus']],
  order: ['learner', 'mentor'],
  flows: [
    ['D11', 'Missed Items', '7.4.1'],
    ['7.4.1', 'Items Below\nPass Mark', '7.4.2'],
    ['7.4.2', 'Weighted Key Terms', '7.4.4'],
    ['D7', 'Lesson Content', '7.4.3'],
    ['7.4.3', 'Parts by Heading', '7.4.4'],
    ['7.4.4', 'Best Matching Part', '7.4.5'],
    ['7.4.5', 'Recommendation\n(Pending)', 'D16'],
    ['7.4.5', 'Review My\nWeak Spots', 'learner'],
    ['learner', 'Opened Review,\nFixed Items', '7.4.6'],
    ['7.4.6', 'In Progress /\nCompleted', 'D16'],
    ['D16', 'Recommendations', '7.4.6'],
    ['7.4.6', 'Recommendations\nList', 'mentor'],
  ],
}));

specs.push(diagram('l2_badges', 'Award Badges – DFD Level 2', '2', {
  processes: [['7.6.1', 'Build Learner\nFacts'], ['7.6.2', 'Load Active\nBadges'], ['7.6.3', 'Compare Rule\nwith Facts'], ['7.6.4', 'Save Earned\nBadge'], ['7.6.5', 'Notify\nLearner']],
  flows: [
    ['learner', 'Open Profile /\nBell Sync', '7.6.1'],
    ['D13', 'Lessons, Modules,\nChapters Done', '7.6.1'],
    ['D11', 'Scores', '7.6.1'],
    ['7.6.1', 'Learner Facts', '7.6.3'],
    ['D14', 'Active Badges', '7.6.2'],
    ['7.6.2', 'Badge Rules', '7.6.3'],
    ['7.6.3', 'Newly Earned Badges', '7.6.4'],
    ['7.6.4', 'Earned Badge\nand Date', 'D14'],
    ['7.6.4', 'Badge Earned', '7.6.5'],
    ['7.6.5', 'Badge Notification', 'D17'],
    ['7.6.5', 'Badges on Profile', 'learner'],
  ],
}));

// ================================================================ 8.0 Account Management
specs.push(...byUser(['admin', 'mentor', 'learner'], 'l1_accounts', 'Account Management – DFD Level 1', '1', {
  processes: [['8.1', 'Search and View\nAccounts'], ['8.2', 'Archive and\nRestore Accounts'], ['8.3', 'Unlock\nAccounts'], ['8.4', 'Handle Help\nRequests'], ['8.5', 'Reset Learner\nProgress'], ['8.6', 'Update\nProfile'], ['8.7', 'Delete Own\nAccount']],
  order: ['admin', 'mentor', 'learner'],
  flows: [
    ['admin', 'Search and Filters', '8.1'],
    ['D1', 'Account Records', '8.1'],
    ['D2', 'Security History', '8.1'],
    ['8.1', 'Account Details', 'admin'],
    ['admin', 'Archive / Restore', '8.2'],
    ['8.2', 'Account Status', 'D1'],
    ['8.2', 'Account Action', 'D20'],
    ['admin', 'Unlock Request', '8.3'],
    ['8.3', 'Lockout Cleared', 'D1'],
    ['8.3', 'Unlock Log', 'D2'],
    ['mentor', 'Help Request', '8.4'],
    ['8.4', 'Help Request', 'D19'],
    ['D19', 'Open Requests', '8.4', ['admin']],
    ['admin', 'Reset / Unlock / Done', '8.4'],
    ['8.4', 'Temporary Password', 'admin'],
    ['8.4', 'Temporary Password Hash', 'D1', ['admin']],
    ['8.4', 'Request Sent', 'mentor'],
    ['admin', 'Progress Reset', '8.5'],
    ['D23', 'Reset Allowed Setting', '8.5'],
    ['8.5', 'Erased Learning Data', 'D13'],
    ['learner', 'Name, Photo, Email', '8.6'],
    ['8.6', 'Email Verification Code', 'learner'],
    ['mentor', 'Profile Photo', '8.6'],
    ['admin', 'Profile Photo', '8.6'],
    ['8.6', 'Updated Profile', 'D1'],
    ['learner', 'Password Confirmation', '8.7'],
    ['mentor', 'Password Confirmation', '8.7'],
    ['admin', 'Password Confirmation', '8.7'],
    ['8.7', 'Deletion Due Date\n(30 days)', 'D1'],
    ['8.7', 'Devices Signed Out', 'D3'],
    ['8.7', 'Deletion Alert', 'D17'],
  ],
}));

specs.push(diagram('l2_archive_account', 'Archive and Restore Accounts – DFD Level 2', '2', {
  processes: [['8.2.1', 'Check Archive\nRules'], ['8.2.2', 'Archive\nAccount'], ['8.2.3', 'End Active\nSessions'], ['8.2.4', 'Restore\nAccount'], ['8.2.5', 'Log Account\nAction']],
  flows: [
    ['admin', 'Archive Request', '8.2.1'],
    ['D1', 'Role, Active Admin Count', '8.2.1'],
    ['8.2.1', 'Not Allowed', 'admin'],
    ['8.2.1', 'Allowed', '8.2.2'],
    ['8.2.2', 'Archived Account', 'D1'],
    ['8.2.2', 'Archived Account ID', '8.2.3'],
    ['8.2.3', 'Ended Sessions', 'D3'],
    ['admin', 'Restore Request', '8.2.4'],
    ['D1', 'Archived Accounts', '8.2.4'],
    ['8.2.4', 'Active Account', 'D1'],
    ['8.2.2', 'Archive Action', '8.2.5'],
    ['8.2.4', 'Restore Action', '8.2.5'],
    ['8.2.5', 'Account Action Log', 'D20'],
    ['8.2.5', 'Done', 'admin'],
  ],
}));

specs.push(diagram('l2_help', 'Handle Help Requests – DFD Level 2', '2', {
  processes: [['8.4.1', 'Submit Help\nRequest'], ['8.4.2', 'Notify\nAdmins'], ['8.4.3', 'Review\nRequest'], ['8.4.4', 'Reset\nPassword'], ['8.4.5', 'Unlock\nAccount'], ['8.4.6', 'Mark Done']],
  order: ['mentor', 'admin'],
  flows: [
    ['mentor', 'Username and Message', '8.4.1'],
    ['D1', 'Staff Account Match', '8.4.1'],
    ['8.4.1', 'Request Sent', 'mentor'],
    ['8.4.1', 'Help Request', 'D19'],
    ['8.4.1', 'New Request', '8.4.2'],
    ['8.4.2', 'Admin Bell Alert', 'D17'],
    ['admin', 'Open Request', '8.4.3'],
    ['D19', 'Request Details', '8.4.3'],
    ['8.4.3', 'Request and Account', 'admin'],
    ['admin', 'Reset Password', '8.4.4'],
    ['8.4.4', 'Temp Password Hash,\nMust Change Password', 'D1'],
    ['8.4.4', 'Temporary Password\n(shown once)', 'admin'],
    ['8.4.4', 'Other Devices\nSigned Out', 'D3'],
    ['admin', 'Unlock Now', '8.4.5'],
    ['8.4.5', 'Lockout Cleared', 'D1'],
    ['8.4.5', 'Unlock Log', 'D2'],
    ['admin', 'Mark Done', '8.4.6'],
    ['8.4.6', 'Closed Request', 'D19'],
    ['8.4.4', 'Account Action', 'D20'],
  ],
}));

// ================================================================ 9.0 Reports and Monitoring
specs.push(...byUser(['admin', 'mentor'], 'l1_reports', 'Reports and Monitoring – DFD Level 1', '1', {
  processes: [['9.1', 'Show Admin\nDashboard'], ['9.2', 'Show Online\nUsers'], ['9.3', 'Monitor Learner\nProgress'], ['9.4', 'Generate\nReports'], ['9.5', 'View Logs and\nExport CSV'], ['9.6', 'Monitor Coding\nSandbox'], ['9.7', 'Check System\nHealth'], ['9.8', 'Show Mentor\nDashboard']],
  order: ['admin', 'mentor'],
  flows: [
    ['D1', 'Account Counts', '9.1'],
    ['D2', 'Recent Logins', '9.1'],
    ['9.1', 'Dashboard Cards', 'admin'],
    ['D3', 'Active Sessions', '9.2'],
    ['9.2', 'Who Is Online', 'admin'],
    ['D13', 'Lesson Progress', '9.3'],
    ['D11', 'Scores', '9.3'],
    ['9.3', 'Learner Progress', 'admin'],
    ['9.3', 'Learner Progress', 'mentor'],
    ['admin', 'Report Type and Filters', '9.4'],
    ['D15', 'Certificates Issued', '9.4'],
    ['9.4', 'Reports and Analytics', 'admin'],
    ['admin', 'Log Filters', '9.5'],
    ['D20', 'Activity Log', '9.5'],
    ['9.5', 'Logs and CSV Files', 'admin'],
    ['D18', 'Sandbox Runs', '9.6'],
    ['9.6', 'Run Details', 'admin'],
    ['D23', 'Settings', '9.7'],
    ['9.7', 'System Health', 'admin'],
    ['D9', 'Content Status', '9.8'],
    ['9.8', 'Content Insights', 'mentor'],
  ],
}));

specs.push(diagram('l2_generate_reports', 'Generate Reports – DFD Level 2', '2', {
  processes: [['9.4.1', 'Select Report\nand Filters'], ['9.4.2', 'Collect Learner\nResults'], ['9.4.3', 'Rank\nLearners'], ['9.4.4', 'Summarize\nChapters/Modules'], ['9.4.5', 'List\nCertificates'], ['9.4.6', 'Display\nReport']],
  flows: [
    ['admin', 'Report Type, Status,\nDate Range', '9.4.1'],
    ['9.4.1', 'Filters', '9.4.2'],
    ['D1', 'Learner Accounts', '9.4.2'],
    ['D11', 'First-Try Scores', '9.4.2'],
    ['D13', 'Finished Lessons', '9.4.2'],
    ['9.4.2', 'Learner Summaries', '9.4.3'],
    ['9.4.2', 'Lesson Scores', '9.4.4'],
    ['D6', 'Live Modules', '9.4.4'],
    ['D15', 'Certificates', '9.4.5'],
    ['9.4.3', 'Ranking and\nPerformance Level', '9.4.6'],
    ['9.4.4', 'Course Report', '9.4.6'],
    ['9.4.5', 'Certificates Issued', '9.4.6'],
    ['9.4.6', 'Report and Charts', 'admin'],
  ],
}));

// ---------------------------------------------------------------- Legend (symbols key, not a DFD)
specs.push({
  id: 'legend', title: 'Legend', level: 'legend',
  nodes: [
    { id: 'e', type: 'entity', label: 'External Entity' },
    { id: 'p', type: 'process', num: '1.0', label: 'Process' },
    { id: 's', type: 'store', num: 'D1', label: 'Data Store' },
  ],
  edges: [{ from: 'e', to: 'p', label: 'Data Flow' }, { from: 'p', to: 's', label: 'Data Flow' }],
  layout: { 'elk.direction': 'RIGHT' },
});
