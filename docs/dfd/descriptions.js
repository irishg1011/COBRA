// The paragraph(s) printed under each figure, keyed by diagram id (see specs.js):
// context, level0_part1..3, l1_1 ... l1_9. Processes are named with their number in
// parentheses, data flows in quotes, and data stores with their D-number.

module.exports = {
  context: [
    'This Context Diagram shows CobraByte: Learn Python the Interactive Way as a single process (0) and the data it exchanges with its three external entities: the Admin, the Mentor and the Learner.',
    'The Learner sends "Registration Details", the "Verification Code", "Login Credentials", "Answers and Code" and "Profile Changes" into the system. In return, the system provides the Learner with the "Verification Code", "System Access", "Lessons and Activities", "Results and Feedback", and their "Badges and Certificate".',
    'The Mentor sends "Login Credentials", "Course Content", "Activities and Exercises", the "Publishing Decision" and "Badge Details", and receives "System Access", a "Content Preview" and the "Learner Progress Report". The Admin sends "Staff Account Details", "Login Credentials", "Timer Settings" and an "Account Action", and receives the "Account Details", "System Access", the "Learner Progress Report" and the "System Report".',
  ],

  level0_part1: [
    'This Level 0 Data Flow Diagram breaks CobraByte into its nine major processes. Because the diagram is large, it is shown in three parts; this part covers processes 1.0 to 5.0. A data store used by more than one process is drawn next to each of them and is marked with a second line in its ID strip.',
    'Register Account (1.0) checks the Learner\'s "Registration Details" against the "Account Records" in Accounts (D1), sends a "Verification Code", and saves the "Account Record". The Admin uses the same process to create staff accounts with the "Staff Account Details" and receives the "Account Details". Authenticate User (2.0) checks the "Login Credentials" of every user against Accounts (D1), saves the "Login Status", a "Login Record" in Login Logs (D2) and a "Session Record" in Sessions (D3), and returns "System Access".',
    'The Mentor builds the course through Manage Course Content (3.0), which saves the chapter, module, lesson and video records in Chapters (D4), Modules (D5), Lessons (D6) and Video Tutorials (D7). Manage Learning Activities (4.0) saves the Mentor\'s "Activities and Exercises" in Learning Activities (D8) and Coding Exercises (D9), and the Admin\'s "Timer Settings" in Game Settings (D10). Publish Content (5.0) reads the lesson, activity and exercise content, gives the Mentor a "Content Preview", and saves the "Publishing Status" of each item according to the Mentor\'s "Publishing Decision".',
  ],

  level0_part2: [
    'This part of the Level 0 Data Flow Diagram covers processes 6.0 and 7.0. Deliver Lessons and Activities (6.0) reads the "Unlocked Lessons" from Learner Progress (D13) and the published lessons, videos, activities and exercises, together with the "Timer Settings" from Game Settings (D10), and gives the Learner the "Lessons and Activities". The Learner\'s "Answers and Code" are checked and returned as "Results and Feedback", while the "Answer Record", "Submission Record" and "Lesson Progress" are saved in Learner Answers (D11), Exercise Submissions (D12) and Learner Progress (D13).',
    'Track Progress and Rewards (7.0) reads the "Answer Record", "Submission Record" and "Lesson Progress" to save the "Unlocked Lessons", and compares missed items with the "Lesson Content" to save a "Recommendation Record" in Recommendations (D16). It checks the "Badge Rules" in Badges (D14), saves each "Earned Badge" and "Certificate Record" in Certificates (D15), and shows the Learner their "Results and Feedback" and "Badges and Certificate". The Mentor\'s "Badge Details" are saved as "Badge Rules".',
  ],

  level0_part3: [
    'This part of the Level 0 Data Flow Diagram covers processes 8.0 and 9.0. Manage Accounts (8.0) applies the Admin\'s "Account Action" to the "Account Records" in Accounts (D1), returns the "Account Details", saves the "Account Updates", and writes an "Audit Log Entry" in Audit Logs (D17). It also saves the Learner\'s "Profile Changes".',
    'Generate Reports (9.0) reads the "Lesson Progress", "Answer Record" and "Recommendation Record" to produce the "Learner Progress Report" for the Mentor and the Admin. It also reads the "Account Records", "Login Record", "Certificate Record" and "Audit Log Entry" to produce the "System Report" for the Admin.',
  ],

  l1_1: [
    'This Level 1 Data Flow Diagram breaks down Register Account (1.0). The process begins with Validate Registration (1.1), where the Learner submits their "Registration Details". These are checked against the "Account Records" in Accounts (D1) so that no email or username is used twice, and a "Verification Code" is sent to the Learner.',
    'The "Validated Details" pass to Save Learner Account (1.2). Once the Learner enters the "Verification Code", the new "Account Record" is saved in Accounts (D1). Admin and Mentor accounts are created by the Admin through Create Staff Account (1.3), which checks the "Staff Account Details" against the "Account Records", saves the "Account Record", and returns the "Account Details".',
  ],

  l1_2: [
    'This Level 1 Data Flow Diagram breaks down Authenticate User (2.0), which works the same way for the Learner, the Mentor and the Admin. In Verify Credentials (2.1), the user\'s "Login Credentials" are checked against the "Account Records" in Accounts (D1). The process saves the "Login Status", such as failed attempts and lockouts, and records each attempt as a "Login Record" in Login Logs (D2).',
    'When the credentials are correct, the "Verified User" passes to Create Session (2.2), which saves a "Session Record" in Sessions (D3) and grants "System Access" to the user, opening the dashboard for their role.',
  ],

  l1_3: [
    'This Level 1 Data Flow Diagram breaks down Manage Course Content (3.0), where the Mentor builds the structure of the course. Add Chapter (3.1) saves the "Chapter Details" as a "Chapter Record" in Chapters (D4). Add Module (3.2) uses the "Chapter List" to place the "Module Details" under a chapter and saves the "Module Record" in Modules (D5).',
    'Add Lesson (3.3) uses the "Module List" to place the "Lesson Details" under a module and saves the "Lesson Record" in Lessons (D6). Finally, Attach Video Tutorial (3.4) links the Mentor\'s "Video Link" to a lesson from the "Lesson List" and saves the "Video Record" in Video Tutorials (D7).',
  ],

  l1_4: [
    'This Level 1 Data Flow Diagram breaks down Manage Learning Activities (4.0). In Create Activity (4.1), the Mentor enters the "Activity Details" for a lesson chosen from the "Lesson List" in Lessons (D6), and the "Activity Record" is saved in Learning Activities (D8). The "New Activity" passes to Add Question Items (4.2), where the Mentor adds the "Question Items" for Multiple Choice, Fill in the Blanks or Flashcards, saved with the "Activity Record".',
    'Create Coding Exercise (4.3) saves the Mentor\'s "Exercise Details" for a lesson as an "Exercise Record" in Coding Exercises (D9). In Set Question Timer (4.4), the Admin enters the "Timer Settings", the time allowed for each question, which are saved in Game Settings (D10).',
  ],

  l1_5: [
    'This Level 1 Data Flow Diagram breaks down Publish Content (5.0). In Review Content (5.1), the system reads the "Lesson Content", "Activity Content" and "Exercise Content" from Lessons (D6), Learning Activities (D8) and Coding Exercises (D9), and shows the Mentor a "Content Preview" of how learners will see it.',
    'Based on the Mentor\'s "Publishing Decision", the "Approved Content" passes to Update Publish Status (5.2), which saves the "Publishing Status" of each item in its data store. Only published content is shown to learners.',
  ],

  l1_6: [
    'This Level 1 Data Flow Diagram breaks down Deliver Lessons and Activities (6.0). Display Lesson (6.1) reads the Learner\'s "Unlocked Lessons" from Learner Progress (D13), the "Published Lessons" from Lessons (D6) and the "Video Link" from Video Tutorials (D7), shows the Learner the "Lesson Content", and saves the "Lesson Progress".',
    'Check Activity Answers (6.2) reads the "Published Activities" from Learning Activities (D8) and the "Timer Settings" from Game Settings (D10), and shows the Learner the "Activity Questions". The Learner\'s "Activity Answers" are checked and returned as "Answer Feedback", and the "Answer Record" and "Lesson Progress" are saved in Learner Answers (D11) and Learner Progress (D13).',
    'Check Exercise Code (6.3) checks the Learner\'s "Exercise Code" against the "Published Exercises" in Coding Exercises (D9), returns the "Exercise Result", and saves the "Submission Record" in Exercise Submissions (D12) and the "Lesson Progress".',
  ],

  l1_7: [
    'This Level 1 Data Flow Diagram breaks down Track Progress and Rewards (7.0). Compute Lesson Score (7.1) reads the "Answer Record" from Learner Answers (D11) and the "Submission Record" from Exercise Submissions (D12), and passes the "Lesson Score" to Check Module Pass (7.2). Using the "Lesson Progress" from Learner Progress (D13), a module passes when all its lessons are completed with an average of at least 80%, and the next "Unlocked Lessons" are saved.',
    'The "Missed Items" pass to Find Weak Spots (7.3), which matches them with the "Lesson Content" in Lessons (D6), saves a "Recommendation Record" in Recommendations (D16), and gives the Learner a "Weak Spot Review". The "Passed Modules" pass to Award Badges and Certificate (7.4), which compares them with the "Badge Rules" in Badges (D14), saves each "Earned Badge" and the "Certificate Record" in Certificates (D15), and shows the Learner their "Badges and Certificate". The Mentor creates badges through Define Badges (7.5), which saves the "Badge Details" as "Badge Rules".',
  ],

  l1_8: [
    'This Level 1 Data Flow Diagram breaks down Manage Accounts (8.0). In Update Account Status (8.1), the Admin sends an "Account Action", such as archiving, restoring or unlocking an account. The process reads the "Account Records" from Accounts (D1), returns the "Account Details", saves the "Account Updates", and writes an "Audit Log Entry" in Audit Logs (D17).',
    'In Update Profile (8.2), the Learner\'s "Profile Changes" are checked against the "Account Records" and saved as "Account Updates" in Accounts (D1).',
  ],

  l1_9: [
    'This Level 1 Data Flow Diagram breaks down Generate Reports (9.0). Generate Progress Report (9.1) reads the "Lesson Progress" from Learner Progress (D13), the "Answer Record" from Learner Answers (D11) and the "Recommendation Record" from Recommendations (D16), and produces the "Learner Progress Report" for the Mentor and the Admin.',
    'Generate System Report (9.2) reads the "Account Records" from Accounts (D1), the "Login Record" from Login Logs (D2), the "Certificate Record" from Certificates (D15) and the "Audit Log Entry" from Audit Logs (D17), and produces the "System Report" for the Admin.',
  ],
};
