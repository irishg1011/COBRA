# Prompt: Context Diagram and DFDs for any system

Copy everything below the line into Claude (Claude Code works best, because it can read
your code and database). Fill in the three blanks in **[brackets]** first.

---

Create the Context Diagram and Data Flow Diagrams (DFDs) for my system and put them in
a Word document (.docx).

**My system:** [system name, e.g. "CobraByte: Learn Python the Interactive Way"]
**Users:** [the user types, e.g. Admin, Mentor, Learner]
**Where to look:** [e.g. "the code and database in this repository", or attach the SQL dump / screenshots / manuscript]

## Step 1: Study the system first, and do not draw yet

- Read the database structure (tables) and the code (routes, permissions, main modules).
- Find out what each user type can actually do (check the permission or role code).
- Show me a short list of the 6–9 major processes you plan to use, the data stores, and
  what each user does. Then **wait for my OK**.

## Step 2: Which diagrams to make (only what is needed)

1. **Context Diagram**: the whole system as one process numbered **0**, with each user
   type around it.
2. **Level 0**: all the major processes (**1.0, 2.0, 3.0 …**, numbered with no gaps), all
   users and the data stores. If it would not be readable on one page, split it into
   parts ("Part 1 of 3: 1.0 to 5.0") that share one figure number.
3. **Level 1**: one diagram for each Level 0 process, with 2–5 sub-processes
   (**1.1, 1.2 …**).
4. **No Level 2, 3 or 4** unless I ask.
5. Keep it simple: show only the main data flows, 3–5 per user on the Context Diagram.
   Group small items under broader names (e.g. "Course Content" instead of chapter,
   module, lesson and video details). Leave out error messages and side features.

## Step 3: DFD rules (all must be followed)

1. Every data flow has a label that names the **data** (e.g. "Login Credentials"), never
   an action (not "Send Login").
2. Every process is named **verb + noun** (e.g. "Verify Credentials").
3. Every process has at least one input and one output (no black holes, miracles or
   gray holes).
4. Not allowed: user → user, user → data store, data store → data store. Every flow
   goes to or from a process.
5. Use **Gane-Sarson** symbols only: square box = user (external entity), rounded box
   with its number on top = process, box with an ID strip on the left ("D1 | Accounts")
   = data store, arrow = data flow.
6. Numbering: Context = 0, Level 0 = 1.0, 2.0 …, Level 1 = 1.1, 1.2 …; data stores
   D1, D2 …, with the same number on every diagram.
7. **Balancing**: every flow into or out of a process on one level must appear, with the
   same label, on the level below. Build Level 0 from the Level 1 flows and the Context
   Diagram from the Level 0 user flows, so they always match.
8. Data store names are data names (e.g. "Learner Progress"), not "Database".

## Step 4: Make the diagrams clean

1. **Draw each user once per diagram.** Place it above, below, or between its processes,
   wherever the fewest lines cross.
2. A data store used by several processes may be drawn again next to each one. Mark the
   copies with a second line in the ID strip (the Gane-Sarson duplicate mark).
3. Lay processes out in one column in number order: users on the left, data stores on the
   right, flows between processes going straight down.
4. Lines must be **straight**, or turn at most once (an L-shape). No zig-zags.
5. No label may touch a line, a box or another label. No line may pass through a box.
6. If a crossing cannot be avoided, draw a small **hop** (bump) where one line jumps the
   other, and tell me which diagram has it.
7. The Context Diagram: system in the middle, one user on each side, each joined by a
   straight pair of arrows (in and out) with stacked labels.

## Step 5: Check before showing me

- Write a checker that tests every rule in Step 3 automatically (labels, allowed
  connections, verb-noun names, inputs and outputs, numbering, balancing, no box without
  lines).
- Write a drawing check that finds any label touching a line or box, any line through a
  box, and counts line crossings. Plant a deliberately bad line once to prove the check
  works.
- Then **look at every diagram yourself** and fix anything that looks messy. Tell me
  honestly if something still is not clean.

## Step 6: The Word document

- Letter size, 1-inch margins, Arial 12.
- One figure per page: the diagram centred, then the caption centred under it:
  "Figure 1" on one line and the title under it, e.g.
  "Data Flow Diagram Level 1 - 2.0 Authenticate User".
- Each page is portrait or landscape, whichever shows its diagram larger.
- Order: Context Diagram, Level 0, then the Level 1s in number order.
- **No descriptions yet.** I will ask for them separately.
- Keep the diagram definitions and the generator as files, so I can ask for changes and
  get the document rebuilt.

## Descriptions (only when I ask)

Under each figure, write 1–3 paragraphs in the style of a capstone paper: double-spaced,
justified, first line indented 0.5 in. Walk through the processes in order with their
numbers in parentheses ("Verify Credentials (2.1)"), data flows in quotes ("Login
Credentials"), and data stores with their number ("Accounts (D1)"). Describe only what
the system really does.

## How we work

- Ask before doing anything big, and answer my questions first when I say "just answer".
- After each change, send me the updated .docx.
