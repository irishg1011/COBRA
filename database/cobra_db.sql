-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 02, 2026 at 09:10 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `cobra_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `account_tbl`
--

CREATE TABLE `account_tbl` (
  `acc_id` varchar(15) NOT NULL,
  `email` varchar(100) NOT NULL,
  `username` varchar(30) NOT NULL,
  `password` varchar(255) NOT NULL,
  `u_type` int(10) NOT NULL,
  `status` varchar(10) NOT NULL,
  `failed_attempts` tinyint(1) NOT NULL,
  `is_deleted` tinyint(1) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `lockout_until` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_login` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `account_tbl`
--

INSERT INTO `account_tbl` (`acc_id`, `email`, `username`, `password`, `u_type`, `status`, `failed_attempts`, `is_deleted`, `deleted_at`, `lockout_until`, `created_at`, `last_login`) VALUES
('ACC00001', 'gregorioirish1111@gmail.com', 'aydatkam', 'scrypt:32768:8:1$q3mR6E8pnyRGMU5K$67e6b333b12078dd07fb530dcf3415bf783d73fa67c08e8e902d766c32287b5e51cf2b41b9f4ac118d5c559729e98c9bc1a30676341a63d84133c15a97d8ba2c', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-10-02 21:48:49'),
('ACC00002', 'mijoynicole.cdsga@gmail.com', 'nikol', 'scrypt:32768:8:1$mwyd9c3Y67xLIEGm$8469035001056f301321122ed4873b5dcee4daba7e3d313e8503479fcc0983b0f421a27b52e3b92105d8d37988b3506efdfd9d0e96e164a93a508e18a3cfaf17', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00003', 'espchristiangold@gmail.com', 'golfd123', 'scrypt:32768:8:1$F8uxYEYjJ298xDAe$67ba5a80ecaf090633f9c8b87db5b488947330f2cfdb5676282e026241c1faccaa34be02a993d040ee422deaef7b7ff4ab8fd7b9faa8a99eab1225db878b5dbf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-18 15:38:57'),
('ACC00004', 'danzenaquino@gmail.com', 'danzen123', 'scrypt:32768:8:1$rt1ybreR60SN0xiy$71bf5e05d4bfe44995bf97febaea36c1c55c018bcc01896c5182c51d07d94a56483ba1a7f0445c8e7c055022b6fe3432f2c43d61ade861830cd639f031a156e0', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00005', 'gregorioirish1971@gmail.com', 'aydatkam8', 'scrypt:32768:8:1$d5Q3wGF1VQ7iOzTk$22d973c79f05c86174443c84b3f54b91d90bd28dd9c4a53fb5667c54e316541b05eacd8c34047cf761968a1caa4f3deadb1917a988d9cafc540c9d7d5a42adcf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-10-02 01:50:16'),
('ACC00006', 'mijoynicole@gmail.com', 'taleng', 'scrypt:32768:8:1$mJfMSpNbOm3nmNuQ$6a4ffbcac742f69fa860986a60b65ceecdd70a100870f49a69bdcf3c8dc6c7cd200bf2eca3a1147efb565b0ece407fc66bbb969b43da368f40de06df0fa50e98', 2, 'Inactive', 1, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-07-30 17:09:11'),
('AD2610010001', 'echristiangold@gmail.com', 'nicole', 'scrypt:32768:8:1$7jD2Hw7TQPDCVI11$b8cf268c3594880872b3d0faadcc6b37522706eaaa9006bc57e2a64fd33d0624a76d4e519a9cb571321be656a3c936d1a8f5a8e3a3d11d8501c611fd579c8e53', 1, 'Active', 0, 0, NULL, NULL, '2026-09-30 16:56:35', '2026-10-01 22:20:57'),
('LR2607300001', 'emmanuelspicer123@gmail.com', 'spicer', 'scrypt:32768:8:1$jZJZqv2Vp709B1ih$10fc3def14498aa07ad23e71ada0bf1b598bf78600a0b8d1efffb4321152fe0a254cfac3079de3464840680d2987696cf0f45f0bc9d14c97007069d422769dca', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 08:48:22', '2026-09-27 14:57:56'),
('LR2607300002', 'gmark7688@gmail.com', 'markgil', 'scrypt:32768:8:1$aVlZNwBE6RAC9DrM$93eacd71c16d3528717ec247150a2721952b77114aa27b526c2e5230a9708ab7a3f898b213b7f8ffc2e8407e1304365a114925708f4e0eb92246aecb307f6f5b', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 08:58:41', '2026-09-27 15:38:08'),
('LR2608010001', 'gefreedom7688@gmail.com', 'markgil7688', 'scrypt:32768:8:1$iMe1rOuCKJA9dfyt$1205b855adb80174b4b4187fad8e0a382bd54ce02ef92ed0fee379c626304d960909ddfc55029c8dff7a7feeb6738d65c20032baa98246567a42c93f37f6fc81', 1, 'Inactive', 0, 0, NULL, NULL, '2026-08-01 08:45:30', '2026-08-06 15:26:06'),
('LR2610010001', 'nicolemijoy110@gmail.com', 'growniee', 'scrypt:32768:8:1$wqeVUyzOJB1rfPiM$7ac3325433c2aedefb968688f8f22962ca6671982d124aeea1fb024a0b7cffe1b599e2c3aec34101650b365d69a445e1b3f6bf54b5a1d8f7c4dbb8489d3b4999', 2, 'Active', 0, 0, NULL, NULL, '2026-09-30 16:28:15', '2026-10-01 00:30:07'),
('MT2610020001', 'irenegregorio2207@gmail.com', 'mentorko', 'scrypt:32768:8:1$MDkpwniKrqQKl57F$6643d4a949f4ef74316db8fdb5c17acd8ed59a4bdf20e44c856eaa11d593a608bcc14488f0a51bbfa9971d3da6d3b0dfc1964fdb7eb5eca765b7cb36cd60356c', 3, 'Active', 0, 0, NULL, NULL, '2026-10-02 13:18:37', '2026-10-02 21:49:05');

-- --------------------------------------------------------

--
-- Table structure for table `active_sessions_tbl`
--

CREATE TABLE `active_sessions_tbl` (
  `session_id` int(11) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `session_token` varchar(64) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `last_seen_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `active_sessions_tbl`
--

INSERT INTO `active_sessions_tbl` (`session_id`, `acc_id`, `session_token`, `created_at`, `last_seen_at`) VALUES
(9670, 'MT2610020001', 'aae4cbeb0034ff2ce3b1392a5019ed8128bf7f1a81adef8c1aa5f2eb3410fe0c', '2026-10-02 16:15:30', '2026-10-02 16:15:30');

-- --------------------------------------------------------

--
-- Table structure for table `activity_retakes_tbl`
--

CREATE TABLE `activity_retakes_tbl` (
  `retake_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `la_id` int(10) NOT NULL,
  `round_no` int(5) NOT NULL,
  `item_ids` text NOT NULL,
  `status` varchar(20) NOT NULL,
  `started_at` datetime NOT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `activity_types_tbl`
--

CREATE TABLE `activity_types_tbl` (
  `activity_type_id` int(10) NOT NULL,
  `activity_type_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `activity_types_tbl`
--

INSERT INTO `activity_types_tbl` (`activity_type_id`, `activity_type_name`) VALUES
(2, 'Fill in the Blanks'),
(3, 'Flashcards'),
(1, 'Multiple Choice');

-- --------------------------------------------------------

--
-- Table structure for table `badges_tbl`
--

CREATE TABLE `badges_tbl` (
  `badge_id` int(10) NOT NULL,
  `badge_code` varchar(40) NOT NULL,
  `badge_name` varchar(60) NOT NULL,
  `description` varchar(150) NOT NULL,
  `icon` varchar(40) NOT NULL,
  `display_order` int(5) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `badges_tbl`
--

INSERT INTO `badges_tbl` (`badge_id`, `badge_code`, `badge_name`, `description`, `icon`, `display_order`) VALUES
(1, 'first_steps', 'First Steps', 'Complete your first lesson.', 'fa-shoe-prints', 1),
(2, 'lesson_learner', 'Lesson Learner', 'Complete 10 lessons.', 'fa-book-open', 2),
(3, 'module_master', 'Module Master', 'Pass your first module (85% gate).', 'fa-layer-group', 3),
(4, 'chapter_champion', 'Chapter Champion', 'Complete a whole chapter.', 'fa-flag-checkered', 4),
(5, 'quiz_ace', 'Quiz Ace', 'Perfect first-try score on a Multiple Choice activity.', 'fa-bullseye', 5),
(6, 'blank_buster', 'Blank Buster', 'Perfect first-try score on a Fill in the Blanks activity.', 'fa-puzzle-piece', 6),
(7, 'card_shark', 'Card Shark', 'Perfect first-try score on a Flashcards activity.', 'fa-clone', 7),
(8, 'problem_solver', 'Problem Solver', 'Pass a coding exercise.', 'fa-laptop-code', 8),
(9, 'code_runner', 'Code Runner', 'Run code in the Sandbox 25 times.', 'fa-play', 9),
(10, 'snippet_saver', 'Snippet Saver', 'Save 5 snippets in the Sandbox.', 'fa-floppy-disk', 10),
(11, 'dedicated', 'Dedicated', 'Reach 10 hours of learning time.', 'fa-hourglass-half', 11),
(12, 'consistent', 'Consistent', 'Log in on 7 different days.', 'fa-calendar-check', 12);

-- --------------------------------------------------------

--
-- Table structure for table `category_stats_tbl`
--

CREATE TABLE `category_stats_tbl` (
  `cat_stats_id` int(10) NOT NULL,
  `cat_stats_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `category_stats_tbl`
--

INSERT INTO `category_stats_tbl` (`cat_stats_id`, `cat_stats_name`) VALUES
(4, 'Archived'),
(1, 'Draft'),
(3, 'Published'),
(2, 'Ready to Publish');

-- --------------------------------------------------------

--
-- Table structure for table `category_tbl`
--

CREATE TABLE `category_tbl` (
  `cat_id` int(10) NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `cat_stats_id` int(10) DEFAULT NULL,
  `display_order` int(10) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `published_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `category_tbl`
--

INSERT INTO `category_tbl` (`cat_id`, `category_name`, `is_archived`, `cat_stats_id`, `display_order`, `updated_at`, `published_at`) VALUES
(2, 'Chapter 1', 1, 1, 1, '2026-09-30 15:40:25', '2026-09-30 04:49:36'),
(3, 'Chapter 2', 1, 1, 2, '2026-09-30 15:40:37', NULL),
(4, 'Getting started na super duper haba na hindi na nakaktuwa na pati ako maiinis na hindi ko na gugustu', 1, 1, 3, '2026-09-30 15:40:32', '2026-09-30 04:49:36'),
(5, 'Variables and simple data types', 1, 1, 4, '2026-09-30 15:40:40', NULL),
(6, 'Try', 1, 1, 1, '2026-09-30 05:10:43', '2026-09-30 05:10:28'),
(7, 'Getting started', 0, 2, 1, '2026-10-01 01:16:07', NULL),
(8, 'Haahahahaha', 1, 1, 2, NULL, NULL),
(9, 'Introducing Lists', 0, 1, 3, '2026-10-01 14:42:36', NULL),
(10, 'Working with Lists', 0, 1, 4, NULL, NULL),
(11, 'If Statements', 0, 1, 5, NULL, NULL),
(12, 'Dictionaries', 0, 1, 6, NULL, NULL),
(13, 'User Input and While Loops', 0, 1, 7, NULL, NULL),
(14, 'Variable and Simple Data Types', 0, 1, 2, NULL, NULL),
(15, 'Functions', 0, 1, 8, NULL, NULL),
(16, 'Classes', 0, 1, 9, NULL, NULL),
(17, 'Files and Exceptions', 0, 1, 10, NULL, NULL),
(18, 'Testing your Code', 0, 1, 11, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `coding_exercises_tbl`
--

CREATE TABLE `coding_exercises_tbl` (
  `exercise_id` int(10) NOT NULL,
  `exercise_title` varchar(255) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `points` int(5) NOT NULL,
  `exercise_stats_id` int(10) NOT NULL,
  `instruction` text NOT NULL,
  `situation` text NOT NULL,
  `problem_question` text NOT NULL,
  `clue` text NOT NULL,
  `expected_answer` text NOT NULL,
  `correct_feedback` text NOT NULL,
  `uploaded_by` varchar(15) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `published_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `coding_exercises_tbl`
--

INSERT INTO `coding_exercises_tbl` (`exercise_id`, `exercise_title`, `resource_id`, `points`, `exercise_stats_id`, `instruction`, `situation`, `problem_question`, `clue`, `expected_answer`, `correct_feedback`, `uploaded_by`, `created_at`, `updated_at`, `is_archived`, `published_at`) VALUES
(2, 'Greet the user', 5, 10, 3, 'Read the situation and problem below carefully. write your code in the editor, then click run to test it before submitting.', 'You\'ve learned that print() displays text on the screen. now it\'s time to make your program interactive by asking the user for information.', 'Write a program that asks the user for their name using input(), then prints a greeting in the exact format: hello, <name>!', 'Use input() to store what the user types into a variable, then use an f-string or string concatenation with print() to build the greeting.', 'name = input()\r\nprint(f\"Hello, {name}!\")', 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', 'ACC00001', '2026-09-16 21:26:16', '2026-09-30 15:40:56', 1, '2026-09-23 05:22:34');

-- --------------------------------------------------------

--
-- Table structure for table `exercise_submissions_tbl`
--

CREATE TABLE `exercise_submissions_tbl` (
  `submission_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `exercise_id` int(10) NOT NULL,
  `submitted_code` text NOT NULL,
  `test_cases_passed` int(5) NOT NULL,
  `test_cases_total` int(5) NOT NULL,
  `attempt_number` int(5) NOT NULL,
  `status` varchar(20) NOT NULL,
  `source` varchar(20) NOT NULL,
  `recommendation_id` int(10) DEFAULT NULL,
  `feedback_given` text DEFAULT NULL,
  `submitted_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `exercise_submissions_tbl`
--

INSERT INTO `exercise_submissions_tbl` (`submission_id`, `acc_id`, `exercise_id`, `submitted_code`, `test_cases_passed`, `test_cases_total`, `attempt_number`, `status`, `source`, `recommendation_id`, `feedback_given`, `submitted_at`) VALUES
(1, 'ACC00005', 2, '# Write your code here\n', 0, 2, 1, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:38:31'),
(2, 'ACC00005', 2, '# Write your code here\n', 0, 2, 2, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:38:35'),
(3, 'ACC00005', 2, 'name = input(\"name: \")\nprint(\"hello, \" + name)', 0, 2, 3, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:40:16'),
(4, 'ACC00005', 2, 'name = input(\"name: \")\nprint(\"hello, \" + name)', 0, 2, 4, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:40:18'),
(5, 'ACC00005', 2, 'name = input(\"name: \")\nprint(\"hello, \" + name)', 0, 2, 5, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:40:19'),
(6, 'ACC00005', 2, 'name = input()\nprint(f\"Hello, {name}!\")\n', 2, 2, 6, 'correct', 'self', NULL, 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', '2026-09-16 21:41:10'),
(7, 'ACC00005', 2, 'name = input()\nprint(f\"Hello, {name}!\")\n', 2, 2, 7, 'correct', 'self', NULL, 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', '2026-09-16 21:41:13'),
(8, 'ACC00005', 2, 'name = input()\nprint(f\"Hello, {name}!\")\n', 2, 2, 8, 'correct', 'self', NULL, 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', '2026-09-16 21:41:53'),
(9, 'ACC00005', 2, 'name = input()\nprint(f\"Hello, {name}!\")\n', 2, 2, 9, 'correct', 'self', NULL, 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', '2026-09-16 21:41:56'),
(10, 'ACC00005', 2, '# Write your code here\n', 0, 2, 10, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:47:02'),
(11, 'ACC00005', 2, '# Write your code here\n', 0, 2, 11, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:56:25'),
(12, 'ACC00003', 2, '# Write your code here\n', 0, 2, 1, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-18 15:35:14'),
(13, 'ACC00003', 2, '# Write your code here\n', 0, 2, 2, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-18 15:35:16'),
(14, 'ACC00003', 2, '# Write your code here\n', 0, 2, 3, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-18 15:35:17'),
(15, 'ACC00003', 2, '# Write your code here\n', 0, 2, 4, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-18 15:35:17'),
(16, 'ACC00003', 2, '# Write your code here\n', 0, 2, 5, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-18 15:35:26'),
(17, 'ACC00003', 2, '# Write your code here\n', 0, 2, 6, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-18 15:35:28'),
(18, 'ACC00003', 2, 'name = input()\nprint(f\"Hello, {name}!\")\n', 2, 2, 7, 'correct', 'self', NULL, 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', '2026-09-18 15:39:16'),
(19, 'LR2607300002', 2, 'print(\"Hello, \")', 0, 2, 1, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-26 20:40:27'),
(20, 'LR2607300002', 2, 'print(\"Hello, \")', 0, 2, 2, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-26 21:11:10'),
(21, 'LR2607300002', 2, 'print(\"Hello, \")', 0, 2, 3, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-26 22:23:06'),
(22, 'LR2607300002', 2, 'print(\"Hello, \")', 0, 2, 4, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-26 22:23:11'),
(23, 'LR2607300002', 2, 'print(\"Hello, \")', 0, 2, 5, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-26 22:23:15'),
(24, 'LR2607300002', 2, 'print(\"Hello, \")', 0, 2, 6, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-27 01:21:38'),
(25, 'LR2607300002', 2, 'name = input(\"What\'s your name? \")\nprint(\"Hello, \" + name)', 0, 2, 7, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-27 11:50:53'),
(26, 'LR2607300002', 2, 'name = input(\"What\'s your name? \")\nprint(\"Hello, \" + name + \"!\")', 2, 2, 8, 'correct', 'self', NULL, 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', '2026-09-27 11:57:36');

-- --------------------------------------------------------

--
-- Table structure for table `fib_learner_answers_tbl`
--

CREATE TABLE `fib_learner_answers_tbl` (
  `answer_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `fib_id` int(10) NOT NULL,
  `answer_given` varchar(255) NOT NULL,
  `attempt_number` int(5) NOT NULL,
  `status` varchar(20) NOT NULL,
  `source` varchar(20) NOT NULL,
  `recommendation_id` int(10) DEFAULT NULL,
  `feedback_given` text DEFAULT NULL,
  `answered_at` datetime NOT NULL,
  `retake_id` int(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `fib_learner_answers_tbl`
--

INSERT INTO `fib_learner_answers_tbl` (`answer_id`, `acc_id`, `fib_id`, `answer_given`, `attempt_number`, `status`, `source`, `recommendation_id`, `feedback_given`, `answered_at`, `retake_id`) VALUES
(31, 'LR2607300002', 3, 'def', 1, 'incorrect', 'self', NULL, 'So close! Only the capitalization or spacing is off - Python is picky about those. Not quite. the correct answer is def.', '2026-09-27 16:05:18', NULL),
(32, 'LR2607300002', 3, 'Def', 2, 'correct', 'self', NULL, 'Correct! the def keyword is used to define a function in python.', '2026-09-27 16:05:33', NULL),
(33, 'LR2607300002', 4, 'print()', 1, 'incorrect', 'self', NULL, 'So close! Only the capitalization or spacing is off - Python is picky about those. Incorrect. the function used to display output is print().', '2026-09-27 16:05:41', NULL),
(34, 'LR2607300002', 4, 'Print()', 2, 'correct', 'self', NULL, 'Correct! the print() function displays text or values on the screen.', '2026-09-27 16:05:45', NULL),
(35, 'LR2607300002', 5, 'Number', 1, 'correct', 'self', NULL, 'Correct! number = 10 stores the value 10 in the variable named number.', '2026-09-27 16:05:57', NULL),
(36, 'LR2607300002', 6, 'If', 1, 'correct', 'self', NULL, 'Correct! the if keyword is used to execute code when a condition is true.', '2026-09-27 16:06:02', NULL),
(37, 'LR2607300002', 7, 'Input()', 1, 'correct', 'self', NULL, 'Correct! the input() function allows a program to receive input from the user.', '2026-09-27 16:06:09', NULL),
(38, 'ACC00005', 3, 'variable', 1, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:06', NULL),
(39, 'ACC00005', 3, 'print', 2, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:22', NULL),
(40, 'ACC00005', 3, 'print', 3, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:24', NULL),
(41, 'ACC00005', 3, 'print', 4, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:25', NULL),
(42, 'ACC00005', 3, 'print', 5, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:25', NULL),
(43, 'ACC00005', 3, 'print', 6, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:25', NULL),
(44, 'ACC00005', 3, 'print', 7, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:25', NULL),
(45, 'ACC00005', 3, 'print', 8, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:26', NULL),
(46, 'ACC00005', 3, 'print', 9, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:26', NULL),
(47, 'ACC00005', 3, 'print', 10, 'incorrect', 'self', NULL, 'Not quite. the correct answer is def.', '2026-09-28 09:36:26', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `fib_learner_lives_tbl`
--

CREATE TABLE `fib_learner_lives_tbl` (
  `lives_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `lives` tinyint(1) NOT NULL DEFAULT 3,
  `lives_regen_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `fib_learner_lives_tbl`
--

INSERT INTO `fib_learner_lives_tbl` (`lives_id`, `acc_id`, `lives`, `lives_regen_at`, `updated_at`) VALUES
(1, 'LR2607300002', 3, NULL, '2026-09-26 21:10:42');

-- --------------------------------------------------------

--
-- Table structure for table `fill_blanks_tbl`
--

CREATE TABLE `fill_blanks_tbl` (
  `fib_id` int(10) NOT NULL,
  `la_id` int(10) NOT NULL,
  `instruction` varchar(255) DEFAULT NULL,
  `content` text NOT NULL,
  `correct_answer` varchar(255) NOT NULL,
  `answer_choices` text DEFAULT NULL,
  `correct_feedback` varchar(500) DEFAULT NULL,
  `incorrect_feedback` varchar(500) DEFAULT NULL,
  `sort_order` int(5) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `fill_blanks_tbl`
--

INSERT INTO `fill_blanks_tbl` (`fib_id`, `la_id`, `instruction`, `content`, `correct_answer`, `answer_choices`, `correct_feedback`, `incorrect_feedback`, `sort_order`) VALUES
(3, 11, NULL, 'To define a function in python, we use the _____ keyword.', 'Def', NULL, 'Correct! the def keyword is used to define a function in python.', 'Not quite. the correct answer is def.', 0),
(4, 11, NULL, 'Which function is used to display text or output on the screen in python? _____', 'Print()', NULL, 'Correct! the print() function displays text or values on the screen.', 'Incorrect. the function used to display output is print().', 0),
(5, 11, NULL, 'Complete the code to store the value 10 in a variable: _____ = 10', 'Number', NULL, 'Correct! number = 10 stores the value 10 in the variable named number.', 'Not quite. the missing variable name is number.', 0),
(6, 11, NULL, 'Which python keyword is used to make a decision when a condition is true? _____', 'If', NULL, 'Correct! the if keyword is used to execute code when a condition is true.', 'Incorrect. the correct keyword is if.', 0),
(7, 11, NULL, 'Complete the code to get input from the user: name = _____(\"enter your name: \")', 'Input()', NULL, 'Correct! the input() function allows a program to receive input from the user.', 'Not quite. the correct function is input().', 0),
(8, 58, NULL, 'Which value should be assigned to message_1 so it matches the description \"allowed: starts with a letter\"?\npython\nmessage_1 = __________\nprint(message_1)', '\"Allowed: starts with a letter\"', NULL, 'Great! you assigned \"allowed: starts with a letter\" to message_1.', 'Not quite! the blank should be \"allowed: starts with a letter\", matching the value assigned to message_1.', 0),
(9, 58, NULL, 'Which variable name uses an underscore instead of a space, following the naming rules?\npython\n__________ = \"allowed: underscore instead of space\"\nprint(greeting_message)', 'greeting_message', NULL, 'Great! greeting_message uses an underscore instead of a space.', 'Not quite! the blank should be greeting_message, matching the variable used later in print(greeting_message).', 0),
(10, 58, NULL, 'Which variable name is described as \"short but clear\" in this example?\npython\n__________ = \"allowed: short but clear\"\nprint(student_name)', 'student_name', NULL, 'Great! student_name demonstrates a name that\'s short but clear.', 'Not quite! the blank should be student_name, matching the variable used later in print(student_name).', 0),
(11, 58, NULL, 'Which function should be called to display the value stored in message_1?\npython\nmessage_1 = \"allowed: starts with a letter\"\n__________(message_1)', 'print', NULL, 'Great! print() displays the value stored in message_1.', 'Not quite! the blank should be print, the function used to display each variable\'s value.', 0),
(12, 58, NULL, 'Which variable should be passed to the third print() call so \"allowed: short but clear\" is displayed?\npython\nstudent_name = \"allowed: short but clear\"\nprint(message_1)\nprint(greeting_message)\nprint(__________)', 'student_name', NULL, 'Great! student_name holds \"allowed: short but clear\", which the third print() displays.', 'Not quite! the blank should be student_name, the variable holding the third message.', 0),
(13, 59, NULL, 'Which value should be assigned to message_1 so it matches the description \"allowed: starts with a letter\"?\npython\nmessage_1 = __________\nprint(message_1)', '\"Allowed: starts with a letter\"', NULL, 'Great! you assigned \"allowed: starts with a letter\" to message_1.', 'Not quite! the blank should be \"allowed: starts with a letter\", matching the value assigned to message_1.', 0),
(14, 59, NULL, 'Which variable name uses an underscore instead of a space, following the naming rules?\npython\n__________ = \"allowed: underscore instead of space\"\nprint(greeting_message)', 'greeting_message', NULL, 'Great! greeting_message uses an underscore instead of a space.', 'Not quite! the blank should be greeting_message, matching the variable used later in print(greeting_message).', 0),
(15, 59, NULL, 'Which variable name is described as \"short but clear\" in this example?\npython\n__________ = \"allowed: short but clear\"\nprint(student_name)\nanswer: student_name', 'student_name', NULL, 'Great! student_name demonstrates a name that\'s short but clear.', 'Not quite! the blank should be student_name, matching the variable used later in print(student_name).', 0),
(16, 59, NULL, 'Which function should be called to display the value stored in message_1?\npython\nmessage_1 = \"allowed: starts with a letter\"\n__________(message_1)', 'print', NULL, 'Great! print() displays the value stored in message_1.', 'Not quite! the blank should be print, the function used to display each variable\'s value.', 0),
(17, 60, NULL, 'Which correctly spelled variable name should be assigned this string, based on the working example later in the lesson?\npython\n__________ = \"hello python crash course reader!\"\nprint(mesage)', 'mesage', NULL, 'Great! you used mesage consistently on both lines, so this version runs successfully.', 'Not quite! the blank should be mesage, matching the spelling used in the print() call right after it.', 0),
(18, 60, NULL, 'Which variable name causes a nameerror in the broken example, since it doesn\'t match the assigned variable message?\npython\nmessage = \"hello python crash course reader!\"\nprint(__________)  # misspelled variable name!', 'mesage', NULL, 'Great! mesage is the misspelled name that triggers the nameerror shown in the traceback.', 'Not quite! the blank should be mesage, matching the misspelling shown in the traceback\'s error message.', 0),
(19, 60, NULL, 'Which exception type is shown at the end of this traceback?\npython\n__________: name \'mesage\' is not defined. did you mean: \'message\'?', 'NameError', NULL, 'Great! nameerror is the exception raised when python encounters an unrecognized variable name.', 'Not quite! the blank should be nameerror, matching the exception type shown in the traceback.', 0),
(20, 60, NULL, 'Which correctly spelled variable name should be used in print() so it matches message and avoids a nameerror?\npython\nmessage = \"hello python crash course reader!\"\nprint(__________)', 'message', NULL, 'Great! message matches the variable name assigned above, so this line runs without raising a nameerror.', 'Not quite! the blank should be message, matching the variable name assigned on the line above.', 0),
(21, 60, NULL, 'which line number does the traceback report for the failing print(mesage) line?\npython\nfile \"hello_world.py\", line __________, in <module>\n    print(mesage)', '2', NULL, 'Great! 2 is the line number reported in the traceback, telling you exactly where the problem occurred.', 'Not quite! the blank should be 2, matching the line number shown in the traceback.', 0),
(22, 61, NULL, 'Which method capitalizes the first letter of each word in name?\npython\nname = \"ada lovelace\"\nprint(name.__________())', 'title', NULL, 'Great! .title() capitalizes the first letter of each word, turning \"ada lovelace\" into \"ada lovelace\".', 'Not quite! the blank should be title, the method that capitalizes the first letter of each word.', 0),
(23, 61, NULL, 'which method converts all the letters in name to uppercase?\npython\nname = \"ada lovelace\"\nprint(name.__________())', 'upper', NULL, 'Great! .upper() converts every letter in name to uppercase, producing \"ada lovelace\".', 'Not quite! the blank should be upper, the method that converts all letters to uppercase.', 0),
(24, 61, NULL, 'Which method converts all the letters in name to lowercase?\npython\nname = \"ada lovelace\"\nprint(name.__________())', 'lower', NULL, 'Great! .lower() converts every letter in name to lowercase.', 'Not quite! the blank should be lower, the method that converts all letters to lowercase.', 0),
(25, 61, NULL, 'Which value should be assigned to name so that name.title() produces \"ada lovelace\"?\npython\nname = __________\nprint(name.title())', '\"ada lovelace\"', NULL, 'Great! \"ada lovelace\" is the original value, which .title() capitalizes into \"ada lovelace\".', 'Not quite! the blank should be \"ada lovelace\", matching the lesson\'s example input.', 0),
(26, 61, NULL, 'Which function should be used to display the result of name.upper()?\npython\nname = \"ada lovelace\"\n__________(name.upper())', 'print', NULL, 'Great! print() displays the result of name.upper(), which is \"ada lovelace\".', 'Not quite! the blank should be print, the function used to display the method\'s result.', 0),
(27, 62, NULL, 'Which method removes trailing whitespace from the right side of favorite_language?\npython\nfavorite_language = \' python \'\nprint(favorite_language.__________())', 'rstrip', NULL, 'Great! .rstrip() removes the trailing whitespace from the right side, leaving \' python\'.', 'Not quite! the blank should be rstrip, the method that removes whitespace from the right side.', 0),
(28, 62, NULL, 'Which method removes leading whitespace from the left side of favorite_language?\npython\nfavorite_language = \' python \'\nprint(favorite_language.__________())', 'lstrip', NULL, 'Great! .lstrip() removes the leading whitespace from the left side, leaving \'python \'.', 'Not quite! the blank should be lstrip, the method that removes whitespace from the left side.', 0),
(29, 62, NULL, 'Which method removes whitespace from both sides of favorite_language at once?\npython\nfavorite_language = \' python \'\nprint(favorite_language.__________())', 'strip', NULL, 'Great! .strip() removes whitespace from both the start and end of the string, leaving \'python\'.', 'Not quite! the blank should be strip, the method that removes whitespace from both sides.', 0),
(30, 62, NULL, 'After this line runs, favorite_language still has a trailing space. which method call, when reassigned, would permanently remove it?\npython\nfavorite_language = \'python \'\nfavorite_language = favorite_language.__________()\nprint(favorite_language)', 'rstrip', NULL, 'Great! reassigning favorite_language.rstrip() back to favorite_language permanently removes the trailing space.', 'Not quite! the blank should be rstrip, since only the trailing (right-side) space needs removing here.', 0),
(31, 62, NULL, 'Which variable should this stripped result be reassigned to, so the change becomes permanent?\npython\nfavorite_language = \'python \'\n__________ = favorite_language.rstrip()\nprint(favorite_language)', 'favorite_language', NULL, 'Great! reassigning back to favorite_language itself is what makes the stripped change permanent.', 'Not quite! the blank should be favorite_language, the same variable, so the stripped result replaces its old value.', 0),
(32, 63, NULL, 'Complete the string using double quotes outside so the apostrophe in python\'s is handled safely.\npython\nmessage = \"one of python\'s strengths is its diverse community.____\nprint(message)', '\"', NULL, 'Great! you used double quotes outside the string to safely include the apostrophe.', 'Not quite! use double quotes around the complete string because it contains an apostrophe.', 0),
(33, 63, NULL, 'Complete the print() statement to display the message.\npython\nmessage = \"one of python\'s strengths is its diverse community.\"\n__________(message)', 'print', NULL, 'Great! you used print() to display the string.', 'Not quite! use print(message) to display the stored string.', 0),
(34, 63, NULL, 'Complete the quotation marks so the apostrophe in python\'s does not end the string.\npython\nmessage = __________one of python\'s strengths is its diverse community.__________', '\"One of Python\'s strengths is its diverse community.\"', NULL, 'Great! the double quotation marks safely wrap the string.', 'Not quite! place double quotes at the beginning and end of the string.', 0),
(35, 63, NULL, 'Complete the code using double quotes outside the string.\npython\nmessage = __________one of python\'s strengths is its diverse community.__________\nprint(message)', '\"One of Python\'s strengths is its diverse community.\"', NULL, 'Great! the quotation marks are correctly placed around the string.', 'Not quite! the apostrophe requires double quotes around the complete string.', 0),
(36, 63, NULL, 'Complete the missing function name to display the correctly written string.\npython\nmessage = \"one of python\'s strengths is its diverse community.\"\n__________(message)', 'print', NULL, 'Great! you used print() to display the correctly quoted string.', 'Not quite! use the print() function with message.', 0),
(37, 64, NULL, 'Question & context: complete the arithmetic expression to add the two floats.\npython\nprint(0.1 __________ 0.1)', '+', NULL, 'Great! you used + to add the two floats.', 'Not quite! use the addition symbol + between the two floats.', 0),
(38, 64, NULL, 'Complete the multiplication expression using 2 and 0.1.\npython\nprint(2 __________ 0.1)', '*', NULL, 'Great! you used * to multiply the values.', 'Not quite! use * for multiplication.', 0),
(39, 64, NULL, 'complete the expression that produces the unexpected decimal result.\npython\nprint(0.2 __________ 0.1)', '+', NULL, 'Great! you used addition with the two floats.', 'Not quite! use + between 0.2 and 0.1.', 0),
(40, 64, NULL, 'complete the multiplication expression that produces the unexpected decimal result.\npython\nprint(3 __________ 0.1)', '*', NULL, 'Great! you used multiplication with the float.', 'Not quite! use * between 3 and 0.1.', 0),
(41, 64, NULL, 'Complete the expression using 0.2 and 0.2.\npython\nprint(0.2 __________ 0.2)', '+', NULL, 'Great! you added the two floats correctly.', 'Not quite! use + to add 0.2 and 0.2.', 0);

-- --------------------------------------------------------

--
-- Table structure for table `flashcards_tbl`
--

CREATE TABLE `flashcards_tbl` (
  `flashcard_id` int(10) NOT NULL,
  `la_id` int(10) NOT NULL,
  `front_text` text NOT NULL,
  `back_text` text NOT NULL,
  `correct_feedback` varchar(500) DEFAULT NULL,
  `incorrect_feedback` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `flashcards_tbl`
--

INSERT INTO `flashcards_tbl` (`flashcard_id`, `la_id`, `front_text`, `back_text`, `correct_feedback`, `incorrect_feedback`) VALUES
(3, 10, 'What keyword is used to define a function in python?', 'Def', 'Correct! the def keyword is used to define a function in python.', 'Not quite. the correct answer is def.'),
(4, 10, 'What is the result of 8 × 7?', '56', 'Correct! 8 multiplied by 7 equals 56.', 'Incorrect. try multiplying 8 by 7 again. the answer is 56.'),
(5, 10, 'What gas do plants absorb from the atmosphere during photosynthesis?', 'Carbon dioxide (co₂)', 'Correct! plants absorb carbon dioxide during photosynthesis.', 'Not quite. plants absorb carbon dioxide (co₂) during photosynthesis.'),
(6, 10, 'What does html stand for?', 'Hypertext markup language', 'Correct! html stands for hypertext markup language.', 'Incorrect. html stands for hypertext markup language.'),
(7, 10, 'What is the largest planet in our solar system?', 'Jupiter', 'Correct! jupiter is the largest planet in our solar system.', 'Not quite. the largest planet in our solar system is jupiter.');

-- --------------------------------------------------------

--
-- Table structure for table `flashcard_activity_sessions_tbl`
--

CREATE TABLE `flashcard_activity_sessions_tbl` (
  `session_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `la_id` int(10) NOT NULL,
  `current_flashcard_id` int(10) DEFAULT NULL,
  `score` int(5) NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL,
  `started_at` datetime NOT NULL,
  `paused_at` datetime DEFAULT NULL,
  `resumed_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `flashcard_activity_sessions_tbl`
--

INSERT INTO `flashcard_activity_sessions_tbl` (`session_id`, `acc_id`, `la_id`, `current_flashcard_id`, `score`, `status`, `started_at`, `paused_at`, `resumed_at`, `completed_at`) VALUES
(1, 'LR2607300002', 10, NULL, 4, 'completed', '2026-09-27 16:06:19', NULL, NULL, '2026-09-27 16:07:48');

-- --------------------------------------------------------

--
-- Table structure for table `flashcard_learner_answers_tbl`
--

CREATE TABLE `flashcard_learner_answers_tbl` (
  `answer_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `flashcard_id` int(10) NOT NULL,
  `answer_given` varchar(255) NOT NULL,
  `attempt_number` int(5) NOT NULL,
  `status` varchar(20) NOT NULL,
  `source` varchar(20) NOT NULL,
  `recommendation_id` int(10) DEFAULT NULL,
  `feedback_given` text DEFAULT NULL,
  `answered_at` datetime NOT NULL,
  `retake_id` int(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `flashcard_learner_answers_tbl`
--

INSERT INTO `flashcard_learner_answers_tbl` (`answer_id`, `acc_id`, `flashcard_id`, `answer_given`, `attempt_number`, `status`, `source`, `recommendation_id`, `feedback_given`, `answered_at`, `retake_id`) VALUES
(7, 'LR2607300002', 3, 'Def', 1, 'correct', 'self', NULL, 'Correct! the def keyword is used to define a function in python.', '2026-09-27 16:06:29', NULL),
(8, 'LR2607300002', 4, '56', 1, 'correct', 'self', NULL, 'Correct! 8 multiplied by 7 equals 56.', '2026-09-27 16:06:41', NULL),
(9, 'LR2607300002', 5, 'oxygen', 1, 'incorrect', 'self', NULL, 'Not quite. plants absorb carbon dioxide (co₂) during photosynthesis.', '2026-09-27 16:06:55', NULL),
(10, 'LR2607300002', 5, 'Carbon dioxide(CO2)', 2, 'incorrect', 'self', NULL, 'Not quite. plants absorb carbon dioxide (co₂) during photosynthesis.', '2026-09-27 16:07:09', NULL),
(11, 'LR2607300002', 5, '', 3, 'skipped', 'self', NULL, NULL, '2026-09-27 16:07:16', NULL),
(12, 'LR2607300002', 6, 'Hypertext markup language', 1, 'correct', 'self', NULL, 'Correct! html stands for hypertext markup language.', '2026-09-27 16:07:32', NULL),
(13, 'LR2607300002', 7, 'Jupiter', 1, 'correct', 'self', NULL, 'Correct! jupiter is the largest planet in our solar system.', '2026-09-27 16:07:48', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `gender_tbl`
--

CREATE TABLE `gender_tbl` (
  `gender_id` int(10) NOT NULL,
  `gender` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `gender_tbl`
--

INSERT INTO `gender_tbl` (`gender_id`, `gender`) VALUES
(1, 'Male'),
(2, 'Female');

-- --------------------------------------------------------

--
-- Table structure for table `learner_activity_progress_tbl`
--

CREATE TABLE `learner_activity_progress_tbl` (
  `progress_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `la_id` int(10) NOT NULL,
  `status` varchar(20) NOT NULL,
  `score` int(5) NOT NULL,
  `completed_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learner_activity_progress_tbl`
--

INSERT INTO `learner_activity_progress_tbl` (`progress_id`, `acc_id`, `la_id`, `status`, `score`, `completed_at`) VALUES
(35, 'LR2607300002', 9, 'completed', 3, '2026-09-27 16:05:08'),
(36, 'LR2607300002', 11, 'completed', 3, '2026-09-27 16:06:09'),
(37, 'LR2607300002', 10, 'completed', 4, '2026-09-27 16:07:48'),
(38, 'ACC00005', 9, 'completed', 2, '2026-09-28 09:35:08'),
(39, 'ACC00005', 2, 'completed', 2, '2026-09-28 09:39:03');

-- --------------------------------------------------------

--
-- Table structure for table `learner_badges_tbl`
--

CREATE TABLE `learner_badges_tbl` (
  `lb_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `badge_id` int(10) NOT NULL,
  `earned_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learner_badges_tbl`
--

INSERT INTO `learner_badges_tbl` (`lb_id`, `acc_id`, `badge_id`, `earned_at`) VALUES
(1, 'ACC00005', 10, '2026-10-01 22:26:02'),
(2, 'ACC00005', 12, '2026-10-01 22:26:02');

-- --------------------------------------------------------

--
-- Table structure for table `learner_exercise_progress_tbl`
--

CREATE TABLE `learner_exercise_progress_tbl` (
  `progress_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `exercise_id` int(10) NOT NULL,
  `status` varchar(20) NOT NULL,
  `completed_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `learner_lives_tbl`
--

CREATE TABLE `learner_lives_tbl` (
  `lives_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `activity_type_id` int(10) NOT NULL,
  `lives` tinyint(2) NOT NULL DEFAULT 5,
  `bonus_lives` tinyint(2) NOT NULL DEFAULT 0,
  `lives_regen_at` datetime DEFAULT NULL,
  `daily_reset_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learner_lives_tbl`
--

INSERT INTO `learner_lives_tbl` (`lives_id`, `acc_id`, `activity_type_id`, `lives`, `bonus_lives`, `lives_regen_at`, `daily_reset_at`, `updated_at`) VALUES
(73, 'LR2607300002', 1, 1, 0, '2026-09-27 16:04:29', '2026-09-27 08:00:00', '2026-09-27 16:05:08'),
(86, 'LR2607300002', 2, 4, 0, '2026-09-27 16:05:41', '2026-09-27 08:00:00', '2026-09-27 16:06:09'),
(190, 'LR2607300002', 3, 5, 3, NULL, '2026-09-27 08:00:00', '2026-09-27 16:07:48'),
(199, 'ACC00005', 1, 2, 0, '2026-09-28 09:34:34', '2026-09-28 08:00:00', '2026-09-28 09:39:03'),
(214, 'ACC00005', 2, 0, 0, '2026-09-28 09:36:25', '2026-09-28 08:00:00', '2026-09-28 09:39:06');

-- --------------------------------------------------------

--
-- Table structure for table `learner_progress_unlocks_tbl`
--

CREATE TABLE `learner_progress_unlocks_tbl` (
  `unlock_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `entity_type` varchar(20) NOT NULL,
  `entity_id` int(10) NOT NULL,
  `unlocked_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learner_progress_unlocks_tbl`
--

INSERT INTO `learner_progress_unlocks_tbl` (`unlock_id`, `acc_id`, `entity_type`, `entity_id`, `unlocked_at`) VALUES
(6, 'ACC00005', 'category', 2, '2026-09-28 09:32:35'),
(7, 'LR2610010001', 'category', 7, '2026-10-01 00:30:21'),
(8, 'ACC00005', 'category', 7, '2026-10-01 22:26:11'),
(9, 'ACC00005', 'category', 9, '2026-10-01 22:26:11'),
(10, 'ACC00005', 'category', 10, '2026-10-01 22:26:11'),
(11, 'ACC00005', 'category', 11, '2026-10-01 22:26:11'),
(12, 'ACC00005', 'category', 12, '2026-10-01 22:26:11'),
(13, 'ACC00005', 'category', 13, '2026-10-01 22:26:11'),
(14, 'ACC00005', 'category', 14, '2026-10-01 22:26:11');

-- --------------------------------------------------------

--
-- Table structure for table `learner_resource_progress_tbl`
--

CREATE TABLE `learner_resource_progress_tbl` (
  `progress_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `status` varchar(20) NOT NULL,
  `started_at` datetime(5) NOT NULL,
  `video_watched_at` datetime DEFAULT NULL,
  `content_read_at` datetime DEFAULT NULL,
  `completed_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learner_resource_progress_tbl`
--

INSERT INTO `learner_resource_progress_tbl` (`progress_id`, `acc_id`, `resource_id`, `status`, `started_at`, `video_watched_at`, `content_read_at`, `completed_at`) VALUES
(28, 'LR2607300002', 1, 'completed', '2026-09-27 16:04:18.00000', NULL, '2026-09-27 16:04:19', '2026-09-27 16:07:56'),
(29, 'LR2607300002', 5, 'in_progress', '2026-09-27 16:08:00.00000', NULL, NULL, '0000-00-00 00:00:00'),
(30, 'ACC00005', 1, 'in_progress', '2026-09-28 09:32:44.00000', NULL, '2026-09-28 09:32:45', '0000-00-00 00:00:00'),
(31, 'ACC00005', 5, 'in_progress', '2026-09-28 09:37:51.00000', '2026-09-28 09:37:59', '2026-09-28 09:38:05', '0000-00-00 00:00:00'),
(32, 'LR2610010001', 13, 'completed', '2026-10-01 00:30:50.00000', NULL, '2026-10-01 00:30:56', '2026-10-01 00:45:33'),
(33, 'LR2610010001', 14, 'completed', '2026-10-01 00:31:22.00000', NULL, '2026-10-01 00:31:25', '2026-10-01 00:45:44'),
(34, 'LR2610010001', 15, 'in_progress', '2026-10-01 00:31:41.00000', NULL, NULL, '0000-00-00 00:00:00'),
(35, 'ACC00005', 13, 'completed', '2026-10-01 22:18:53.00000', NULL, '2026-10-01 22:26:34', '2026-10-02 01:56:23'),
(36, 'ACC00005', 14, 'completed', '2026-10-02 01:53:15.00000', NULL, '2026-10-02 01:53:17', '2026-10-02 01:53:18'),
(37, 'ACC00005', 15, 'completed', '2026-10-02 01:53:25.00000', NULL, '2026-10-02 01:53:25', '2026-10-02 01:53:27'),
(38, 'ACC00005', 17, 'completed', '2026-10-02 01:53:35.00000', NULL, '2026-10-02 01:53:37', '2026-10-02 01:54:21'),
(39, 'ACC00005', 18, 'completed', '2026-10-02 01:53:57.00000', NULL, '2026-10-02 01:53:58', '2026-10-02 01:54:00'),
(40, 'ACC00005', 19, 'completed', '2026-10-02 01:54:09.00000', NULL, '2026-10-02 01:54:09', '2026-10-02 01:54:12'),
(41, 'ACC00005', 22, 'completed', '2026-10-02 01:54:31.00000', NULL, '2026-10-02 01:54:33', '2026-10-02 01:55:35'),
(42, 'ACC00005', 20, 'completed', '2026-10-02 01:56:05.00000', NULL, '2026-10-02 01:56:08', '2026-10-02 01:56:11'),
(43, 'ACC00005', 21, 'completed', '2026-10-02 01:56:44.00000', NULL, '2026-10-02 01:56:45', '2026-10-02 02:42:20'),
(44, 'ACC00005', 23, 'completed', '2026-10-02 01:57:37.00000', NULL, '2026-10-02 01:57:38', '2026-10-02 01:57:39'),
(45, 'ACC00005', 27, 'completed', '2026-10-02 01:58:18.00000', NULL, '2026-10-02 01:58:19', '2026-10-02 01:58:20'),
(46, 'ACC00005', 28, 'completed', '2026-10-02 01:58:40.00000', NULL, '2026-10-02 01:58:41', '2026-10-02 01:58:42'),
(47, 'ACC00005', 24, 'completed', '2026-10-02 01:58:47.00000', NULL, '2026-10-02 01:58:48', '2026-10-02 01:58:48'),
(48, 'ACC00005', 25, 'completed', '2026-10-02 01:58:59.00000', NULL, '2026-10-02 01:59:00', '2026-10-02 01:59:01'),
(49, 'ACC00005', 26, 'completed', '2026-10-02 01:59:06.00000', NULL, '2026-10-02 01:59:07', '2026-10-02 01:59:08'),
(50, 'ACC00005', 29, 'completed', '2026-10-02 01:59:14.00000', NULL, '2026-10-02 01:59:16', '2026-10-02 01:59:17'),
(51, 'ACC00005', 30, 'completed', '2026-10-02 01:59:24.00000', NULL, '2026-10-02 01:59:25', '2026-10-02 01:59:26'),
(52, 'ACC00005', 31, 'completed', '2026-10-02 01:59:31.00000', NULL, '2026-10-02 01:59:32', '2026-10-02 01:59:33'),
(53, 'ACC00005', 32, 'completed', '2026-10-02 01:59:40.00000', NULL, '2026-10-02 01:59:42', '2026-10-02 01:59:43'),
(54, 'ACC00005', 33, 'completed', '2026-10-02 01:59:49.00000', NULL, '2026-10-02 01:59:49', '2026-10-02 01:59:51');

-- --------------------------------------------------------

--
-- Table structure for table `learner_time_tbl`
--

CREATE TABLE `learner_time_tbl` (
  `acc_id` varchar(15) NOT NULL,
  `total_seconds` int(10) NOT NULL DEFAULT 0,
  `last_beat_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learner_time_tbl`
--

INSERT INTO `learner_time_tbl` (`acc_id`, `total_seconds`, `last_beat_at`) VALUES
('ACC00005', 3746, '2026-10-02 15:44:27');

-- --------------------------------------------------------

--
-- Table structure for table `learning_activities_stats_tbl`
--

CREATE TABLE `learning_activities_stats_tbl` (
  `la_stats_id` int(10) NOT NULL,
  `la_stats_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learning_activities_stats_tbl`
--

INSERT INTO `learning_activities_stats_tbl` (`la_stats_id`, `la_stats_name`) VALUES
(3, 'Archived'),
(1, 'Draft'),
(2, 'Published'),
(4, 'Ready to Publish');

-- --------------------------------------------------------

--
-- Table structure for table `learning_activities_tbl`
--

CREATE TABLE `learning_activities_tbl` (
  `la_id` int(10) NOT NULL,
  `activity_title` varchar(255) NOT NULL,
  `cat_id` int(10) NOT NULL,
  `module_id` int(10) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `activity_type_id` int(10) NOT NULL,
  `points` int(5) DEFAULT NULL,
  `la_stats_id` int(10) NOT NULL,
  `uploaded_by` varchar(15) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `published_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learning_activities_tbl`
--

INSERT INTO `learning_activities_tbl` (`la_id`, `activity_title`, `cat_id`, `module_id`, `resource_id`, `activity_type_id`, `points`, `la_stats_id`, `uploaded_by`, `created_at`, `updated_at`, `published_at`) VALUES
(2, 'Act 1 l1m1c1', 2, 5, 5, 1, 2, 3, 'ACC00001', '2026-09-09 00:29:23', '2026-09-30 15:42:19', '2026-09-23 05:22:28'),
(9, 'Try activity', 2, 1, 1, 1, 5, 3, 'LR2607300001', '2026-09-26 19:37:09', '2026-09-30 15:41:51', '2026-09-26 19:37:55'),
(10, 'Testing of flashcards', 2, 1, 1, 3, 5, 3, 'LR2607300001', '2026-09-27 14:54:26', '2026-09-30 15:41:51', '2026-09-27 14:54:26'),
(11, 'Testing for fill in the blanks', 2, 1, 1, 2, 5, 3, 'LR2607300001', '2026-09-27 14:57:29', '2026-09-30 15:41:51', '2026-09-27 14:57:29'),
(12, 'Multiple Choice', 9, 14, 23, 1, 1, 1, 'ACC00001', '2026-10-01 17:47:08', '2026-10-01 17:47:08', NULL),
(13, 'What Really Happens When You Run hello_world.py', 14, 36, 82, 1, 5, 1, 'ACC00001', '2026-10-01 22:06:51', '2026-10-01 22:06:51', NULL),
(14, 'Variables', 14, 37, 83, 1, 5, 1, 'ACC00001', '2026-10-01 23:11:21', '2026-10-01 23:11:21', NULL),
(15, 'Avoiding Name Errors When Using Variables', 14, 37, 84, 1, 5, 1, 'ACC00001', '2026-10-01 23:23:03', '2026-10-01 23:38:37', NULL),
(16, 'Changing Case in a String with Methods', 14, 38, 85, 1, 5, 1, 'ACC00001', '2026-10-01 23:58:23', '2026-10-01 23:58:23', NULL),
(17, 'Stripping Whitespace', 14, 38, 86, 1, 5, 1, 'ACC00001', '2026-10-02 00:17:12', '2026-10-02 00:17:12', NULL),
(18, 'Avoiding Syntax Errors with Strings', 14, 38, 87, 1, 5, 1, 'ACC00001', '2026-10-02 00:24:47', '2026-10-02 00:24:47', NULL),
(19, 'Floats', 14, 39, 88, 1, 5, 1, 'ACC00001', '2026-10-02 01:08:09', '2026-10-02 01:08:09', NULL),
(20, 'What Kinds of Comments Should You Write?', 14, 40, 89, 1, 5, 1, 'ACC00001', '2026-10-02 01:14:56', '2026-10-02 01:14:56', NULL),
(21, 'Accessing Elements in a List', 9, 14, 24, 1, 5, 1, 'ACC00001', '2026-10-02 03:44:39', '2026-10-02 03:44:39', NULL),
(22, 'Index Positions Start at 0, Not 1', 9, 14, 25, 1, 1, 1, 'ACC00001', '2026-10-02 03:47:05', '2026-10-02 03:47:05', NU