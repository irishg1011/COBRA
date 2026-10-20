// The paragraph(s) printed under each figure, keyed by diagram id (see specs.js).
// Processes are named with their number in parentheses, data flows in quotes,
// and data stores with their D-number.

module.exports = {
  context: [
    'This Context Diagram shows CobraByte: Learn Python the Interactive Way as a single process (0) and its three external entities: the Learner, the Mentor and the Admin.',
    'The Learner sends "Registration Details", "Login Credentials", "Lesson Selection", "Activity Answers", "Exercise Code" and "Profile Changes", and receives "System Access", "Lesson Content", "Answer Feedback", "Exercise Result", "Weak Spot Review" and their "Badges and Certificate". The Mentor sends the course and activity details, "Publishing Decision" and "Badge Details", and receives a "Content Preview", "Recommendation Report" and "Learner Progress Report". The Admin sends "Staff Account Details", "Account Action", "Help Request Decision" and "Timer Settings", and receives "Account Details", the "Help Request List" and the "System Report".',
  ],

  level0: [
    'This Level 0 Data Flow Diagram breaks CobraByte into its nine major processes. Because each process uses several data stores, the users and data stores are drawn next to every process that uses them; a repeated box is marked with a diagonal line (users) or a second line in its ID strip (data stores).',
    'Register Account (1.0) checks the "Registration Details" against Accounts (D1) and saves the "New Account Record". Authenticate User (2.0) checks the "Login Credentials" against Accounts (D1), keeps a "Login Record" in Login Logs (D2) and a "Session Record" in Sessions (D3), and returns "System Access". The Mentor builds the course through Manage Course Content (3.0), which saves Chapters (D4), Modules (D5), Lessons (D6) and Video Tutorials (D7), and through Manage Learning Activities (4.0), which saves Learning Activities (D8) and Coding Exercises (D9); the Admin\'s "Timer Settings" are saved in Game Settings (D10). Publish Content (5.0) gives a "Content Preview" and saves the "Publishing Status".',
    'Deliver Lessons and Activities (6.0) shows the Learner the published lessons and checks their answers and code, saving them in Learner Answers (D11), Exercise Submissions (D12) and Learner Progress (D13). Track Progress and Rewards (7.0) uses these records to unlock lessons, save Recommendations (D16), Badges (D14) and Certificates (D15). Manage Accounts (8.0) handles account updates, help requests in Help Requests (D17) and the Audit Logs (D18), and Generate Reports (9.0) produces the "Learner Progress Report" and the "System Report".',
  ],

  l1_1: [
    'This Level 1 Data Flow Diagram breaks down Register Account (1.0). Validate Registration (1.1) checks the Learner\'s "Registration Details" against the "Existing Account Records" in Accounts (D1). Send Verification Code (1.2) sends the Learner a "Verification Code" and passes the "Pending Registration" to Verify Code (1.3), which compares it with the Learner\'s "Code Confirmation".',
    'Save Learner Account (1.4) saves the "New Account Record" in Accounts (D1) and returns the "Registration Status". Admin and Mentor accounts are made by the Admin through Create Staff Account (1.5), which checks the "Staff Account Details", saves the "New Account Record" and returns the "Staff Account ID".',
  ],

  l1_2: [
    'This Level 1 Data Flow Diagram breaks down Authenticate User (2.0), used the same way by the Learner, Mentor and Admin. Verify Credentials (2.1) checks the "Login Credentials" against the "Account Records" in Accounts (D1), updates the "Login Status" (failed attempts and lockout), and keeps a "Login Record" in Login Logs (D2).',
    'For a "Verified User", Create Session (2.2) saves the "Session Record" in Sessions (D3) and gives "System Access". Reset Password (2.3) takes a "Password Reset Request", sends a "Password Reset Code" and saves the new password as part of the "Login Status" in Accounts (D1).',
  ],

  l1_3: [
    'This Level 1 Data Flow Diagram breaks down Manage Course Content (3.0). The Mentor\'s "Chapter Details" are saved by Add Chapter (3.1) in Chapters (D4). Add Module (3.2) uses the "Chapter List" to save the "Module Record" in Modules (D5), and Add Lesson (3.3) uses the "Module List" to save the "Lesson Record" in Lessons (D6). Attach Video Tutorial (3.4) links a "Video Link" to a lesson from the "Lesson List" and saves the "Video Record" in Video Tutorials (D7).',
  ],

  l1_4: [
    'This Level 1 Data Flow Diagram breaks down Manage Learning Activities (4.0). Create Activity (4.1) saves the Mentor\'s "Activity Details" for a lesson from the "Lesson List" as an "Activity Record" in Learning Activities (D8) and passes the "New Activity" to Add Question Items (4.2), which saves the "Question Items" for Multiple Choice, Fill in the Blanks or Flashcards.',
    'Create Coding Exercise (4.3) saves the "Exercise Details" as an "Exercise Record" in Coding Exercises (D9). Set Question Timer (4.4) saves the Admin\'s "Timer Settings" in Game Settings (D10).',
  ],

  l1_5: [
    'This Level 1 Data Flow Diagram breaks down Publish Content (5.0). Preview Content (5.1) reads the "Lesson Content", "Activity Content" and "Exercise Content" from Lessons (D6), Learning Activities (D8) and Coding Exercises (D9) and returns a "Content Preview" to the Mentor or Admin who sent the "Content Preview Request". Only the Mentor can publish: Update Publish Status (5.2) applies the "Publishing Decision" to the "Checked Content" and saves the "Publishing Status" in the three data stores.',
  ],

  l1_6: [
    'This Level 1 Data Flow Diagram breaks down Deliver Lessons and Activities (6.0). Display Lesson (6.1) uses the Learner\'s "Lesson Selection" and "Unlocked Lessons" to show the "Lesson Content" and "Video Link" from Lessons (D6) and Video Tutorials (D7), and saves the "Lesson Progress" in Learner Progress (D13).',
    'Check Activity Answers (6.2) checks the "Activity Answers" against the "Published Activities" in Learning Activities (D8) within the "Timer Settings" from Game Settings (D10), returns "Answer Feedback" and saves the "Answer Record" in Learner Answers (D11). Check Exercise Code (6.3) checks the "Exercise Code" against the "Published Exercises" in Coding Exercises (D9), returns the "Exercise Result" and saves the "Submission Record" in Exercise Submissions (D12). Both also save the "Lesson Progress".',
  ],

  l1_7: [
    'This Level 1 Data Flow Diagram breaks down Track Progress and Rewards (7.0). Compute Lesson Score (7.1) reads the "Answer Record" and "Submission Record" and passes the "Lesson Score" to Check Module Pass (7.2), which compares it with the "Lesson Progress" in Learner Progress (D13). A module passes at 80%: the "Unlocked Lessons" are saved, the "Passed Modules" go to Award Badges and Certificate (7.4), and the "Missed Items" go to Find Weak Spots (7.3).',
    'Find Weak Spots (7.3) matches the "Missed Items" with the "Lesson Content", saves a "Recommendation Record" in Recommendations (D16), and gives the Learner a "Weak Spot Review" and the Mentor a "Recommendation Report". Award Badges and Certificate (7.4) compares the "Badge Rules" in Badges (D14), saves each "Earned Badge" and "Certificate Record", and shows the Learner their "Badges and Certificate". The Mentor\'s "Badge Details" are saved as "Badge Rules" by Define Badges (7.5).',
  ],

  l1_8: [
    'This Level 1 Data Flow Diagram breaks down Manage Accounts (8.0). Update Account Status (8.1) applies the Admin\'s "Account Action", such as archive, restore or unlock, to the "Account Records" in Accounts (D1), returns the "Account Details", and writes an "Audit Log Entry" in Audit Logs (D18). Update Profile (8.4) saves the Learner\'s "Profile Changes" and returns the "Updated Profile".',
    'A Mentor who cannot sign in sends a "Help Request" through Submit Help Request (8.2), which saves the "Help Request Record" in Help Requests (D17) and returns a "Request Confirmation". Resolve Help Request (8.3) shows the Admin the "Help Request List" and applies the "Help Request Decision": it saves the "Account Updates", gives the Admin a "Temporary Password" when the password is reset, updates the "Help Request Status", and writes an "Audit Log Entry".',
  ],

  l1_9: [
    'This Level 1 Data Flow Diagram breaks down Generate Reports (9.0). Generate Progress Report (9.1) uses the "Report Filters" from the Mentor or Admin with the "Lesson Progress" and "Answer Record" to produce the "Learner Progress Report". Generate System Report (9.2) uses the Admin\'s "Report Filters" with the "Account Records", "Login Record", "Certificate Record" and "Audit Log Entry" to produce the "System Report".',
  ],
};
