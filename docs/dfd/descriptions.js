// The paragraph(s) printed under each diagram, keyed by diagram id (see specs.js).
// Written in the style of a capstone paper: processes with their numbers in
// parentheses, data flows in quotes, data stores with their D-number.

module.exports = {
  context: [
    'This Context Diagram shows CobraByte: Learn Python the Interactive Way as a single process (0) and the data it exchanges with its three external entities: the Admin, the Mentor and the Learner.',
    'The Learner sends "Registration Details", the "Verification Code" received by email, "Username and Password", "Answers and Code" from the lessons and activities, and "Profile Changes" into the system. In return, the system gives the Learner "User Access", the "Lessons, Videos and Activities", "Scores and Feedback", and their "Badges, Certificate and Notifications".',
    'The Mentor sends the "Course Content", "Learning Activities and Coding Exercises", "Publishing Actions", "Badge Details" and, when they cannot sign in, a "Help Request". The system returns "User Access", a "Content Preview" of how learners will see the content, and the "Learner Progress and Recommendations".',
    'The Admin sends "Admin and Mentor Details" to create staff accounts, "Account Actions", "Help Request Actions" and the "Game Settings". The system provides the Admin with "User Access", "Reports and Analytics", the "Login and Activity Logs", and the "Help Requests" sent by staff.',
  ],

  level0_admin: [
    'This Level 0 Data Flow Diagram shows the major processes the Admin uses. The process numbers follow the full list of nine CobraByte processes (1.0 to 9.0), so only the processes that involve the Admin appear here: Registration (1.0), User Authentication (2.0), Publishing (5.0), Account Management (8.0), and Reports and Monitoring (9.0).',
    'The Admin creates Admin and Mentor accounts through Registration (1.0), which saves the "New Account" in Accounts (D1). The Admin signs in through User Authentication (2.0), which checks the "Account Verification" against Accounts (D1), records the "Active Session" in Sessions (D3), and returns "User Access".',
    'In Publishing (5.0), the Admin can only view: a "Preview Request" reads the "Content Tree" from Lessons (D7) and returns a "Content Preview". Through Account Management (8.0), the Admin\'s "Account Actions" save "Account Changes" in Accounts (D1) and handle the "Help Requests" in Help Requests (D19).',
    'Finally, Reports and Monitoring (9.0) reads Accounts (D1), Login Logs (D2), Learner Progress (D13) and Audit Logs (D20) to give the Admin the "Reports and Analytics".',
  ],

  level0_mentor: [
    'This Level 0 Data Flow Diagram shows the major processes the Mentor uses: User Authentication (2.0), Course Content Management (3.0), Learning Activity Management (4.0), Publishing (5.0), Progress and Achievements (7.0), Account Management (8.0), and Reports and Monitoring (9.0). The numbers follow the full list of CobraByte processes, so processes the Mentor does not use are not shown.',
    'After signing in through User Authentication (2.0), the Mentor builds the course in Course Content Management (3.0), which saves the "Chapters", "Modules", "Lessons" and "Video Links" into Chapters (D5), Modules (D6), Lessons (D7) and Video Tutorials (D8). Learning Activity Management (4.0) reads the "Lesson List" from Lessons (D7) and saves the "Activity Items" into Learning Activities (D9) and the "Exercises and Test Cases" into Coding Exercises (D10).',
    'Through Publishing (5.0), the Mentor\'s "Publishing Actions" read the "Content Tree" and update the "Content Status" in Lessons (D7) and the "Activity Status" in Learning Activities (D9), returning a "Content Preview". In Progress and Achievements (7.0), the Mentor sends "Badge Details" that are stored as "Badge Rules" in Badges (D14), and receives the "Recommendations" read from Recommendations (D16).',
    'The Mentor can send a "Help Request" through Account Management (8.0), which is stored in Help Requests (D19). Reports and Monitoring (9.0) reads Learner Progress (D13) and Learning Activities (D9) to give the Mentor the "Learner Progress".',
  ],

  level0_learner: [
    'This Level 0 Data Flow Diagram shows the major processes the Learner uses: Registration (1.0), User Authentication (2.0), Learning (6.0), Progress and Achievements (7.0), and Account Management (8.0). The numbers follow the full list of CobraByte processes, so processes the Learner does not use are not shown.',
    'The Learner submits "Registration Details" to Registration (1.0), which sends a "Verification Code" and saves the "New Account" in Accounts (D1). The Learner then signs in through User Authentication (2.0), which checks the "Account Verification" against Accounts (D1), records the "Active Session" in Sessions (D3) and the "Accepted Terms" in Consent (D4), and returns "User Access" (or a "Reset Code" when the password is forgotten).',
    'In Learning (6.0), the system reads the "Published Lessons", "Published Activities" and "Published Exercises" from Lessons (D7), Learning Activities (D9) and Coding Exercises (D10). The Learner\'s "Answers and Code" are saved as "Answers and Scores" in Learner Answers (D11), "Code Submissions" in Exercise Submissions (D12) and "Lesson Progress" in Learner Progress (D13), and the Learner receives "Lessons and Feedback".',
    'Progress and Achievements (7.0) reads the "Scores" and "Exercise Results" and saves the "Unlocks", "Earned Badges", "Certificate", "Weak Spots" and "Alerts" into Learner Progress (D13), Badges (D14), Certificates (D15), Recommendations (D16) and Notifications (D17), then shows the Learner their "Badges and Certificate". The Learner\'s "Profile Changes" go through Account Management (8.0) into Accounts (D1).',
  ],

  l1_registration_admin: [
    'This Level 1 Data Flow Diagram shows how the Admin creates staff accounts. The Admin enters the "Admin / Mentor Details" into Create Admin / Mentor Account (1.6). The process reads the "Next Account ID" from Accounts (D1), saves the "New Staff Account" in Accounts (D1), and returns the "Generated Account ID" to the Admin.',
  ],

  l1_registration_learner: [
    'This Level 1 Data Flow Diagram breaks down how a learner signs up. The process begins with Enter Registration Details (1.1), where the Learner enters their name, birthdate, gender, email, username and password. The "Gender List" is read from Accounts (D1).',
    'The "Registration Details" pass to Validate Registration (1.2), which checks the "Existing Emails and Usernames" in Accounts (D1) and returns any "Validation Errors" to the Learner. With a "Valid Email", Send Verification Code (1.3) emails the Learner a "Verification Code" that is valid for 5 minutes.',
    'The Learner types the code into Verify Code (1.4). The "Verified Details" then go to Create Learner Account (1.5), which saves the "New Learner Account and Profile" in Accounts (D1), records a "New Sign-up Alert" for the admins in Notifications (D17), and shows the Learner a "Registration Confirmation".',
  ],

  l2_validate_registration: [
    'This Level 2 Data Flow Diagram breaks down Validate Registration (1.2) into the checks done on the server before a verification code is sent. Check Required Fields (1.2.1) returns "Missing Fields" to the Learner, or passes the "Complete Details" to Check Age (1.2.2), which only allows learners from 13 to 60 years old.',
    'With a "Valid Birthdate", Check Password Rules (1.2.3) confirms the password is strong enough. Check Email and Username (1.2.4) then compares the "Existing Emails and Usernames" in Accounts (D1) and returns "Email or Username Taken" when either is already used. Once every check passes, Accept Registration (1.2.5) tells the Learner "Verification Code Sent".',
  ],

  l1_auth_admin: [
    'This Level 1 Data Flow Diagram shows the authentication processes used by the Admin. In Log In (2.1), the Admin enters their "Username and Password", which are checked against the "Account Verification" in Accounts (D1). The process updates the "Failed Attempts, Lockout, Last Login" in Accounts (D1), saves a "Session Token" in Sessions (D3), and returns "User Access".',
    'If the password is forgotten, Recover Password (2.3) finds the "Account by Email", sends a "Reset Code", and saves the "New Password" in Accounts (D1). Change Password (2.5) saves the "Password Changes" and records "Other Devices Signed Out" in Sessions (D3). Log Out (2.6) records the "Ended Session" in Sessions (D3).',
  ],

  l1_auth_mentor: [
    'This Level 1 Data Flow Diagram shows the authentication processes used by the Mentor, who signs in through the same staff login page as the Admin. In Log In (2.1), the Mentor\'s "Username and Password" are checked against the "Account Verification" in Accounts (D1). The process updates the "Failed Attempts, Lockout, Last Login", saves a "Session Token" in Sessions (D3), and returns "User Access".',
    'Recover Password (2.3) finds the "Account by Email", sends a "Reset Code", and saves the "New Password" in Accounts (D1). Change Password (2.5) saves the "Password Changes" and signs out other devices in Sessions (D3), and Log Out (2.6) records the "Ended Session".',
  ],

  l1_auth_learner: [
    'This Level 1 Data Flow Diagram shows the authentication processes used by the Learner. In Log In (2.1), the Learner\'s "Username and Password" are checked against the "Account Verification" in Accounts (D1). The process updates the "Failed Attempts, Lockout, Last Login", saves a "Session Token" in Sessions (D3), and returns "User Access".',
    'For a "Signed-in Learner", Check Terms Consent (2.2) reads the "Accepted Versions" from Consent (D4). If the current Terms and Conditions and Privacy Notice have not been accepted yet, the Learner gives their "Terms and Privacy Acceptance", which is saved as a "Consent Record" in Consent (D4).',
    'Recover Password (2.3) and Recover Username (2.4) both find the "Account by Email" in Accounts (D1). The first sends a "Reset Code" and saves the "New Password"; the second sends a "Username Code" and then shows the "Username". Change Password (2.5) saves the "Password Changes" and signs out other devices, and Log Out (2.6) records the "Ended Session" in Sessions (D3).',
  ],

  l2_login: [
    'This Level 2 Data Flow Diagram breaks down Log In (2.1). The steps are the same for every user, so the Learner, Mentor and Admin are shown as one User entity. Check Login Door and Role (2.1.1) reads the "Account Role" from Accounts (D1): learners sign in on the learner page and staff on the staff page. Using the wrong page returns "Wrong Door: Invalid Username or Password" and records a "Failed Attempt" in Login Logs (D2).',
    'The "Matched Account" moves to Check Account Status (2.1.2), which reads whether the account is "Archived, Inactive, Pending Deletion" and returns "Account Archived or Restore Prompt" when needed. An "Active Account" goes to Verify Password (2.1.3), which returns the "Remaining Attempts or Lockout" when the password is wrong.',
    'With the "Correct Password", Create Session (2.1.4) saves the "Last Login, Status Active" in Accounts (D1), the "Successful Login" in Login Logs (D2) and the "Session Token" in Sessions (D3). Open Role Home Page (2.1.5) then uses the "Role" to send the user to their "Role Home Page": the Learner, Mentor or Admin dashboard.',
  ],

  l2_recover_password: [
    'This Level 2 Data Flow Diagram breaks down Recover Password (2.3), which works the same way for every user. Find Account by Email (2.3.1) looks up the "Registered Email" in Accounts (D1), and Send Reset Code (2.3.2) emails a "Reset Code" to the user.',
    'Verify Reset Code (2.3.3) returns "Invalid or Expired Code" or passes the "Verified Code" on. Check Password Rules (2.3.4) checks the "New and Confirm Password" and returns "Password Rules Not Met" when needed. Finally, Save New Password (2.3.5) saves the "Password Hash" in Accounts (D1), records a "Password Reset Log" in Login Logs (D2), and tells the user "Password Changed". A new password is only accepted after the code has been verified.',
  ],

  l3_verify_password: [
    'This Level 3 Data Flow Diagram breaks down Verify Password (2.1.3). Check Lockout (2.1.3.1) reads the "Lockout Until" time from Accounts (D1). A lockout that has already expired is cleared, while an active one returns "Try Again in 1 Minute" to the user.',
    'If the account is "Not Locked", Compare Password Hash (2.1.3.2) compares the entered "Password" with the "Stored Password Hash" in Accounts (D1). A "Wrong Password" goes to Handle Failed Attempt (2.1.3.3), which updates the "Failed Attempts", records the "Failed Login, Lockout Event" in Login Logs (D2), and returns the "Remaining Attempts or Locked" message. A "Correct Password" goes to Clear Failed Attempts (2.1.3.4), which sets "Failed Attempts = 0" and gives "User Access".',
  ],

  l4_failed_attempt: [
    'This Level 4 Data Flow Diagram breaks down Handle Failed Attempt (2.1.3.3). Log Failed Attempt (2.1.3.3.1) records the "Failed Login, IP Address" in Login Logs (D2). Add to Failed Count (2.1.3.3.2) reads the "Failed Attempts" from Accounts (D1) and passes the "New Count" to Check Attempt Limit (2.1.3.3.3).',
    'When the "Limit Reached" is 5 tries, Lock Account for 1 Minute (2.1.3.3.4) saves the "Lockout Until" time in Accounts (D1) and tells the user "Too Many Failed Attempts". Log Lockout and Alert Admins (2.1.3.3.5) then records the "Lockout Event" in Login Logs (D2) and sends a "Lockout Alert" to the admins through Notifications (D17). "Below Limit", Show Remaining Attempts (2.1.3.3.6) saves the "Failed Attempts" and tells the user how many "Attempts Remaining" they have.',
  ],

  l1_course: [
    'This Level 1 Data Flow Diagram shows how the Mentor builds the course structure of chapters, modules and lessons. In Manage Chapters (3.1), the Mentor enters the "Chapter Details, Skip Settings", saved as "Chapter Records" in Chapters (D5). Manage Modules (3.2) reads the "Chapter List" from Chapters (D5) and saves the "Module Records" in Modules (D6).',
    'Manage Lessons (3.3) reads the "Module List" and saves the "Lesson Draft and Content, Images" in Lessons (D7). In Manage Video Tutorials (3.4), the Mentor pastes a "YouTube Link" for a lesson from the "Lesson List", and the "Video ID" is saved in Video Tutorials (D8).',
    'Archive and Restore Content (3.5) handles the Mentor\'s "Archive / Restore / Delete Request" and updates the archived chapter, module or lesson in Chapters (D5), Modules (D6) and Lessons (D7). Every "Title Change" from processes 3.1 to 3.3 goes to Track Title History (3.6), which saves the "Created / Renamed / Reverted Title" in Title History (D21). The Mentor can view the "Title History" and send a "Revert Request".',
  ],

  l2_lessons: [
    'This Level 2 Data Flow Diagram breaks down Manage Lessons (3.3), the Upload Lesson page. In Select Chapter and Module (3.3.1), the Mentor picks a chapter and module from the "Chapter List" in Chapters (D5) and the "Modules by Chapter" in Modules (D6). Check Lesson Name (3.3.2) compares the "Lesson Name" with the "Existing Lesson Names" in Lessons (D7) and returns "Name Taken or Not Sentence Case" when it fails.',
    'The Mentor writes the "Rich-Text Content" in Write Lesson Content (3.3.3). Images are added through Upload Images (3.3.4), which saves the "Uploaded Image" in Lessons (D7) and puts the "Image Link" into the content. Save Draft (3.3.5) combines the "Selected Module", "Valid Name" and "Lesson Content" and saves the "Draft Lesson and Content" in Lessons (D7) and a "Title Change" in Title History (D21). When the lesson is complete, Mark Ready to Publish (3.3.6) changes its status to "Ready to Publish".',
  ],

  l2_archive: [
    'This Level 2 Data Flow Diagram breaks down Archive and Restore Content (3.5). When the Mentor sends an "Archive Request", Check Archive Impact (3.5.1) reads the "Lessons, Activities and Exercises Inside" from Lessons (D7) and shows the "Items Affected". After "Confirm Archive", Archive Item (3.5.2) marks the chapter, module or lesson as archived in Modules (D6) and Lessons (D7) and writes an "Archive Log" to Audit Logs (D20). Learner progress is kept.',
    'For a "Restore Request", Choose Restore Options (3.5.3) lists the "Archived Items" so the Mentor can choose what to bring back, and Restore Items (3.5.4) restores the "Selected Items" and writes a "Restore Log". A "Delete Request" goes to Permanently Delete (3.5.5), which removes the record from Lessons (D7) and writes a "Delete Log" to Audit Logs (D20).',
  ],

  l1_activities_admin: [
    'This Level 1 Data Flow Diagram shows the only part of Learning Activity Management the Admin uses. In Set Game Settings (4.7), the Admin sets the "Question Timer per Game", the time allowed for each Multiple Choice, Fill in the Blanks and Flashcards question, which is saved in Game Settings (D22).',
  ],

  l1_activities_mentor: [
    'This Level 1 Data Flow Diagram shows how the Mentor creates the learning activities and coding exercises attached to each lesson. In Enter Activity Information (4.1), the Mentor enters the "Title, Lesson, Type, Points", choosing the lesson from the "Lessons by Module" in Lessons (D7). The "Activity Draft" is saved in Learning Activities (D9).',
    'Depending on the type, the activity goes to Build Multiple Choice Items (4.2), where the Mentor enters "Questions and Options"; Build Fill in the Blanks (4.3), with "Code with Blanks, Answers"; or Build Flashcards (4.4), with the "Front and Back" of each card. Each saves its items in Learning Activities (D9).',
    'Create Coding Exercise (4.5) takes the "Instructions, Expected Output, Required Tags" for a lesson and saves the "Exercise and Test Cases" in Coding Exercises (D10). Quick Edit Items (4.6) lets the Mentor send "Item Corrections" and saves the "Updated Item" or "Updated Exercise".',
  ],

  l2_mcq: [
    'This Level 2 Data Flow Diagram breaks down Build Multiple Choice Items (4.2). The Mentor enters the "Question Text" in Enter Question (4.2.1), the "Answer Choices" in Enter Options (4.2.2), and the "Correct Option" in Mark Correct Answer (4.2.3).',
    'The "Question", "Options" and "Answer Key" go to Check Item Rules (4.2.4), which returns the first "Item Problem" it finds (for example, "Question #3"). The "Valid Items" go to Save Items (4.2.5), which reads the "Activity Draft" and saves the "Questions and Options" in Learning Activities (D9), then tells the Mentor "Items Saved". Each activity holds a pool of questions, from which learners are given five at random.',
  ],

  l2_exercise: [
    'This Level 2 Data Flow Diagram breaks down Create Coding Exercise (4.5). In Enter Exercise Details (4.5.1), the Mentor enters the "Title, Instructions, Answer Code" and picks the lesson from the "Lessons by Module" in Lessons (D7). Check Exercise Title (4.5.2) compares the "Exercise Title" with the "Existing Titles" in Coding Exercises (D10) and returns "Title Taken" if it is already used.',
    'Generate Expected Output (4.5.3) runs the "Answer Code" and shows the Mentor the "Expected Output". In Set Required Tags (4.5.4), the Mentor picks the "Concepts, Functions, Methods" that a learner\'s code must use. Save Draft or Mark Ready (4.5.5) saves the "Exercise, Test Case, Required Tags" in Coding Exercises (D10) and a "Title Change" in Title History (D21).',
  ],

  l1_publishing_admin: [
    'This Level 1 Data Flow Diagram shows what the Admin can do in Publishing. The Admin can only view, not change, the content. Load Content Tree (5.1) reads the Chapters (D5), Modules (D6), Lessons (D7), Video Tutorials (D8), Learning Activities (D9) and Coding Exercises (D10) and shows the "Content Tree (view only)". With a "Preview Request", Preview Content (5.6) reads the "Items to Preview" and shows the "Learner View" without saving anything.',
  ],

  l1_publishing_mentor: [
    'This Level 1 Data Flow Diagram shows how the Mentor moves content from Draft to Ready to Publish to Published. Load Content Tree (5.1) reads every chapter, module, lesson, video, activity and exercise from Chapters (D5) to Coding Exercises (D10) and shows the "Content Tree and Status".',
    'In Mark Ready to Publish (5.2), the Mentor\'s "Mark Ready / Move to Draft" updates the "Ready Status" in Lessons (D7). A "Publish Request" goes to Publish Content (5.3), which saves the published chapter, module, lesson, video, activity and exercise in their data stores (D5 to D10). Unpublish Content (5.4) moves content "Back to Ready" without touching learner progress.',
    'Reorder Content (5.5) saves the "Display Order" set by the Mentor. Preview Content (5.6) shows the "Learner View" so the Mentor can check the content as a learner would see it, without saving anything.',
  ],

  l2_publish: [
    'This Level 2 Data Flow Diagram breaks down Publish Content (5.3). Check Item is Ready (5.3.1) reads the "Item Status" from Lessons (D7) and returns "Not Ready" unless the item is Ready to Publish. Check Parent is Published (5.3.2) reads the "Parent Status" from Modules (D6) and returns "Parent Not Published" when its chapter or module is not live yet.',
    'Run Publish Checklist (5.3.3) checks the "Item Counts and Content" in Learning Activities (D9) and returns any "Checklist Problems". Once the "Checklist Passed", Publish Item and Children (5.3.4) saves the "Published Status, Published Date" in Lessons (D7) and publishes the ready activities and exercises inside it, so a chapter is published only once. Log and Confirm (5.3.5) writes a "Publish Log" to Audit Logs (D20) and tells the Mentor "Published".',
  ],

  l1_learning: [
    'This Level 1 Data Flow Diagram shows how the Learner works through the course. View Learning Map (6.1) reads the "Published Chapters", "Published Modules", and the Learner\'s "Unlocks and Progress" from Learner Progress (D13) to show the "Learning Map". The Learner picks a lesson in Read Lesson and Watch Video (6.2), which reads the "Lesson Content" from Lessons (D7) and the "Video" from Video Tutorials (D8), then records "Content Read, Video Watched" in Learner Progress (D13).',
    'In Play Learning Activity (6.3), the system reads the "Drawn Items" from Learning Activities (D9) and the "Question Timer" from Game Settings (D22). The Learner\'s "Answers" are saved as "Answers and Outcomes" in Learner Answers (D11), and their "Lives and Activity Progress" in Learner Progress (D13). Solve Coding Exercise (6.4) checks the Learner\'s "Python Code and Output" against the "Exercise and Expected Output" and saves the "Submission and Result" in Exercise Submissions (D12).',
    'Retake Missed Items (6.5) reads the "Missed Items" from Learner Answers (D11) and starts a "Retake Round". In Use Coding Sandbox (6.6), the Learner practices freely and the "Runs and Saved Snippets" are kept in Coding Sandbox (D18). Skip Chapter (6.7) lets a Learner who already knows a "Skippable Chapter" answer its skip question and records the "Chapter Skip" in Learner Progress (D13).',
  ],

  l2_play: [
    'This Level 2 Data Flow Diagram breaks down Play Learning Activity (6.3), the engine shared by Multiple Choice, Fill in the Blanks and Flashcards. Draw 5 Unseen Items (6.3.1) compares the "Item Pool" in Learning Activities (D9) with the "Items Already Seen" in Learner Answers (D11) and saves the "New Play and Drawn Items". Reveal Item and Start Timer (6.3.2) shows the "Question" using the "Time Limit" from Game Settings (D22) and records the "Shown Time".',
    'Check Answer (6.3.3) compares the Learner\'s "Answer or Skip" with the "Correct Answer" in Learning Activities (D9). It saves the "Outcome" (correct, wrong, skipped or timed out) in Learner Answers (D11) and tells the Learner "Correct or Wrong". A wrong, skipped or timed-out answer goes to Update Lives (6.3.4), which reads the "Lives and Bonus Lives" from Learner Progress (D13) and saves the "Lives Left".',
    'Detect Leaving the Page (6.3.5) watches for the page being hidden. It saves a "Leave Log", and from the second time the Learner leaves, the current item counts as left (-1 life). When the "Last Item Answered" arrives, Finish Play and Score (6.3.6) saves the "Activity Completed" in Learner Progress (D13) and shows the "Score and Review". The server keeps the drawn items, timer and lives, so refreshing the page cannot reset them.',
  ],

  l2_solve: [
    'This Level 2 Data Flow Diagram breaks down Solve Coding Exercise (6.4). Load Exercise (6.4.1) reads the "Instructions, Expected Output, Tags" from Coding Exercises (D10) and shows the "Exercise". The Learner\'s "Python Code" runs in Run Code in Browser (6.4.2), and the "Printed Output or Error" goes to Compare Output (6.4.3), which checks it against the "Expected Output".',
    'When the "Output Matches", Check Required Tags (6.4.4) reads the "Required Tags" from Coding Exercises (D10) and finds which ones are used in the code. Save Result and Progress (6.4.5) saves the "Submission" in Exercise Submissions (D12) and the "Exercise Progress" in Learner Progress (D13), and tells the Learner "Passed or Hints". An answer passes only when the code runs without errors, prints the expected output, and uses every required tag.',
  ],

  l1_progress_mentor: [
    'This Level 1 Data Flow Diagram shows the Mentor\'s part in Progress and Achievements. In Find Weak Spots (7.4), the Mentor views the lesson "Recommendations" stored in Recommendations (D16), which show what each learner is having trouble with. In Manage Badges (7.5), the Mentor creates badges by entering the "Badge Name, Rule, Required Value", saved in Badges (D14).',
  ],

  l1_progress_learner: [
    'This Level 1 Data Flow Diagram shows how CobraByte turns the Learner\'s results into progress and rewards. Compute Lesson Performance (7.1) reads the "First-Attempt Results" from Learner Answers (D11) and the "Exercise Results" from Exercise Submissions (D12) and saves the "Lesson Performance %" in Learner Progress (D13).',
    'Check Module Gate (7.2) passes a module when all its lessons are completed and their average is at least 80%, and saves "Module Passed". Unlock Next Content (7.3) then reads the "Passed Modules" and saves the "Chapter Unlock". Find Weak Spots (7.4) matches the "Missed Items" with the "Lesson Parts" in Lessons (D7), saves a "Lesson Recommendation" in Recommendations (D16), and shows the Learner a "Weak Spot Review".',
    'Award Badges (7.6) compares the "Active Badges" in Badges (D14) with the "Learner Facts" and saves each "Earned Badge". Issue Certificate (7.7) checks the "Chapters Passed", saves the "Certificate" in Certificates (D15), and gives the Learner a "Certificate of Completion". Both send a notification to Notifications (D17), which Show Notifications (7.8) displays as "Bell Notifications".',
  ],

  l2_weak_spots: [
    'This Level 2 Data Flow Diagram breaks down Find Weak Spots (7.4). Collect Missed Items (7.4.1) reads the "Missed Items" from Learner Answers (D11) and passes the "Items Below Pass Mark" to Extract Key Terms (7.4.2), which takes the important words from each answer and question. At the same time, Split Lesson into Parts (7.4.3) splits the "Lesson Content" from Lessons (D7) into "Parts by Heading".',
    'Score Parts (7.4.4) matches the "Weighted Key Terms" with each part and picks the "Best Matching Part". Save Recommendation (7.4.5) saves the "Recommendation (Pending)" in Recommendations (D16) and offers the Learner "Review My Weak Spots". As the Learner opens the review and fixes items, Track Review Status (7.4.6) marks it "In Progress / Completed", and the Mentor sees the "Recommendations List".',
  ],

  l2_badges: [
    'This Level 2 Data Flow Diagram breaks down Award Badges (7.6), which runs whenever the Learner opens their profile or the notification bell syncs. Build Learner Facts (7.6.1) reads the "Lessons, Modules, Chapters Done" from Learner Progress (D13) and the "Scores" from Learner Answers (D11). Load Active Badges (7.6.2) reads the "Active Badges" from Badges (D14).',
    'Compare Rule with Facts (7.6.3) checks each "Badge Rule" against the "Learner Facts" and finds the "Newly Earned Badges". Save Earned Badge (7.6.4) saves the "Earned Badge and Date" in Badges (D14), and Notify Learner (7.6.5) sends a "Badge Notification" to Notifications (D17) and shows the "Badges on Profile". A badge, once earned, is never taken back.',
  ],

  l1_accounts_admin: [
    'This Level 1 Data Flow Diagram shows how the Admin manages accounts. Search and View Accounts (8.1) uses the Admin\'s "Search and Filters" to read the "Account Records" from Accounts (D1) and the "Security History" from Login Logs (D2), and shows the "Account Details". Archive and Restore Accounts (8.2) updates the "Account Status", and Unlock Accounts (8.3) saves the "Lockout Cleared" in Accounts (D1).',
    'Handle Help Requests (8.4) reads the "Open Requests" from Help Requests (D19). The Admin can "Reset / Unlock / Done" a request: a reset saves a "Temporary Password Hash" in Accounts (D1) and shows the "Temporary Password" once. Reset Learner Progress (8.5) checks the "Reset Allowed Setting" in System Settings (D23) and erases the learner\'s data in Learner Progress (D13).',
    'Like every user, the Admin can change their "Profile Photo" through Update Profile (8.6), and can ask to delete their own account through Delete Own Account (8.7). That saves a "Deletion Due Date (30 days)", signs out all devices in Sessions (D3), and sends a "Deletion Alert" to Notifications (D17).',
  ],

  l1_accounts_mentor: [
    'This Level 1 Data Flow Diagram shows the Mentor\'s part in Account Management. A Mentor who cannot sign in sends a "Help Request" through Handle Help Requests (8.4). It is saved in Help Requests (D19), and the Mentor is told "Request Sent".',
    'The Mentor can change their "Profile Photo" through Update Profile (8.6), which saves the "Updated Profile" in Accounts (D1). With a "Password Confirmation", Delete Own Account (8.7) saves a "Deletion Due Date (30 days)", signs out all devices in Sessions (D3), and sends a "Deletion Alert" to Notifications (D17).',
  ],

  l1_accounts_learner: [
    'This Level 1 Data Flow Diagram shows the Learner\'s part in Account Management. In Update Profile (8.6), the Learner changes their "Name, Photo, Email". A new email address must be confirmed with an "Email Verification Code" before the "Updated Profile" is saved in Accounts (D1).',
    'With a "Password Confirmation", Delete Own Account (8.7) saves a "Deletion Due Date (30 days)" in Accounts (D1), signs out all devices in Sessions (D3), and sends a "Deletion Alert" to Notifications (D17). Signing in again before that date offers to restore the account.',
  ],

  l2_archive_account: [
    'This Level 2 Data Flow Diagram breaks down Archive and Restore Accounts (8.2). For an "Archive Request", Check Archive Rules (8.2.1) reads the "Role, Active Admin Count" from Accounts (D1) and returns "Not Allowed" if an admin tries to archive their own account or the last active admin.',
    'If "Allowed", Archive Account (8.2.2) saves the "Archived Account" in Accounts (D1), and End Active Sessions (8.2.3) records the "Ended Sessions" in Sessions (D3). No data is deleted. For a "Restore Request", Restore Account (8.2.4) reads the "Archived Accounts" and saves the "Active Account". Log Account Action (8.2.5) writes each archive and restore to Audit Logs (D20) and tells the Admin "Done".',
  ],

  l2_help: [
    'This Level 2 Data Flow Diagram breaks down Handle Help Requests (8.4), the "Can\'t get in? Ask an admin" form on the staff login page. In Submit Help Request (8.4.1), the Mentor enters a "Username and Message". The process looks for a "Staff Account Match" in Accounts (D1), saves the "Help Request" in Help Requests (D19), and always answers "Request Sent", so the form never reveals whether an account exists. Notify Admins (8.4.2) then sends an "Admin Bell Alert" to Notifications (D17).',
    'The Admin opens the request in Review Request (8.4.3), which reads the "Request Details" and shows the "Request and Account". Reset Password (8.4.4) saves a "Temp Password Hash, Must Change Password" in Accounts (D1), shows the "Temporary Password (shown once)", signs out other devices in Sessions (D3), and logs the "Account Action" in Audit Logs (D20). Unlock Account (8.4.5) saves the "Lockout Cleared" and an "Unlock Log", and Mark Done (8.4.6) saves the "Closed Request".',
  ],

  l1_reports_admin: [
    'This Level 1 Data Flow Diagram shows the monitoring and reporting processes for the Admin. These processes only read data. Show Admin Dashboard (9.1) reads the "Account Counts" from Accounts (D1) and the "Recent Logins" from Login Logs (D2) to build the "Dashboard Cards". Show Online Users (9.2) reads the "Active Sessions" from Sessions (D3) to show "Who Is Online".',
    'Monitor Learner Progress (9.3) combines the "Lesson Progress" and "Scores" into the "Learner Progress". Generate Reports (9.4) uses the Admin\'s "Report Type and Filters" and the "Certificates Issued" to produce the "Reports and Analytics". View Logs and Export CSV (9.5) reads the "Activity Log" from Audit Logs (D20) and gives the "Logs and CSV Files". Monitor Coding Sandbox (9.6) shows the "Run Details" from Coding Sandbox (D18), and Check System Health (9.7) reports the "System Health".',
  ],

  l1_reports_mentor: [
    'This Level 1 Data Flow Diagram shows the reports available to the Mentor. Monitor Learner Progress (9.3) reads the "Lesson Progress" from Learner Progress (D13) and the "Scores" from Learner Answers (D11) and shows the "Learner Progress". Show Mentor Dashboard (9.8) reads the "Content Status" from Learning Activities (D9) and shows the Mentor the "Content Insights", which tell them how their content is doing.',
  ],

  l2_generate_reports: [
    'This Level 2 Data Flow Diagram breaks down Generate Reports (9.4). In Select Report and Filters (9.4.1), the Admin chooses the "Report Type, Status, Date Range". Collect Learner Results (9.4.2) reads the "Learner Accounts" from Accounts (D1), the "First-Try Scores" from Learner Answers (D11) and the "Finished Lessons" from Learner Progress (D13).',
    'Rank Learners (9.4.3) turns the "Learner Summaries" into a "Ranking and Performance Level". Summarize Chapters/Modules (9.4.4) combines the "Lesson Scores" with the "Live Modules" from Modules (D6) into a "Course Report", and List Certificates (9.4.5) reads the certificates issued from Certificates (D15). Display Report (9.4.6) shows the Admin the "Report and Charts". Every score uses the same first-try lesson score the Learner sees.',
  ],
};
