-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 01, 2026 at 11:18 AM
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
('ACC00001', 'gregorioirish1111@gmail.com', 'aydatkam', 'scrypt:32768:8:1$q3mR6E8pnyRGMU5K$67e6b333b12078dd07fb530dcf3415bf783d73fa67c08e8e902d766c32287b5e51cf2b41b9f4ac118d5c559729e98c9bc1a30676341a63d84133c15a97d8ba2c', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-30 22:25:13'),
('ACC00002', 'mijoynicole.cdsga@gmail.com', 'nikol', 'scrypt:32768:8:1$mwyd9c3Y67xLIEGm$8469035001056f301321122ed4873b5dcee4daba7e3d313e8503479fcc0983b0f421a27b52e3b92105d8d37988b3506efdfd9d0e96e164a93a508e18a3cfaf17', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00003', 'espchristiangold@gmail.com', 'golfd123', 'scrypt:32768:8:1$F8uxYEYjJ298xDAe$67ba5a80ecaf090633f9c8b87db5b488947330f2cfdb5676282e026241c1faccaa34be02a993d040ee422deaef7b7ff4ab8fd7b9faa8a99eab1225db878b5dbf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-18 15:38:57'),
('ACC00004', 'danzenaquino@gmail.com', 'danzen123', 'scrypt:32768:8:1$rt1ybreR60SN0xiy$71bf5e05d4bfe44995bf97febaea36c1c55c018bcc01896c5182c51d07d94a56483ba1a7f0445c8e7c055022b6fe3432f2c43d61ade861830cd639f031a156e0', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00005', 'gregorioirish1971@gmail.com', 'aydatkam8', 'scrypt:32768:8:1$d5Q3wGF1VQ7iOzTk$22d973c79f05c86174443c84b3f54b91d90bd28dd9c4a53fb5667c54e316541b05eacd8c34047cf761968a1caa4f3deadb1917a988d9cafc540c9d7d5a42adcf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-28 10:05:51'),
('ACC00006', 'mijoynicole@gmail.com', 'taleng', 'scrypt:32768:8:1$mJfMSpNbOm3nmNuQ$6a4ffbcac742f69fa860986a60b65ceecdd70a100870f49a69bdcf3c8dc6c7cd200bf2eca3a1147efb565b0ece407fc66bbb969b43da368f40de06df0fa50e98', 2, 'Inactive', 1, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-07-30 17:09:11'),
('LR2607300001', 'emmanuelspicer123@gmail.com', 'spicer', 'scrypt:32768:8:1$jZJZqv2Vp709B1ih$10fc3def14498aa07ad23e71ada0bf1b598bf78600a0b8d1efffb4321152fe0a254cfac3079de3464840680d2987696cf0f45f0bc9d14c97007069d422769dca', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 08:48:22', '2026-10-01 17:07:56'),
('LR2607300002', 'gmark7688@gmail.com', 'markgil', 'scrypt:32768:8:1$sOdBnMP9sWWgplEO$d351a40a60d0d11e2ea459618d798bd6a21725b72b1849f2eea59cb2e4e68f0139e00861c75d6341d53799ba2d385e9c8003666a5759f91c9b4aea66a75962bf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 08:58:41', '2026-10-01 16:48:12'),
('LR2608010001', 'gefreedom7688@gmail.com', 'markgil7688', 'scrypt:32768:8:1$iMe1rOuCKJA9dfyt$1205b855adb80174b4b4187fad8e0a382bd54ce02ef92ed0fee379c626304d960909ddfc55029c8dff7a7feeb6738d65c20032baa98246567a42c93f37f6fc81', 1, 'Inactive', 0, 0, NULL, NULL, '2026-08-01 08:45:30', '2026-08-06 15:26:06');

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
(7055, 'ACC00001', '4c07d0ea1a90d643ca543a1bc80c510ca255e973e27b31fc91910c275ae6c57a', '2026-09-30 14:49:44', '2026-09-30 14:49:44'),
(7489, 'LR2607300001', '587e76ba20484d5a63e05e8f9da906d2c8ddd7a942918743fdbb253a7c71167a', '2026-10-01 09:08:09', '2026-10-01 09:08:34');

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

--
-- Dumping data for table `activity_retakes_tbl`
--

INSERT INTO `activity_retakes_tbl` (`retake_id`, `acc_id`, `la_id`, `round_no`, `item_ids`, `status`, `started_at`, `completed_at`) VALUES
(1, 'LR2607300001', 15, 1, '25,28', 'in_progress', '2026-10-01 15:51:58', NULL);

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
(6, 'Try', 1, 1, 5, '2026-09-30 05:10:43', '2026-09-30 05:10:28'),
(7, 'Getting started', 0, 1, 6, NULL, NULL),
(8, 'Variables and simple data types', 1, 1, 7, '2026-10-01 08:44:36', NULL),
(9, 'Chapter 1', 1, 1, 8, NULL, NULL),
(10, 'Variables and simple data types', 0, 3, 9, '2026-10-01 15:31:23', '2026-10-01 10:11:10'),
(13, 'Try chapter', 0, 1, 10, NULL, NULL),
(14, 'Try chapter 2', 0, 1, 11, NULL, NULL);

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
(54, 'LR2607300001', 8, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:36:53', NULL),
(55, 'LR2607300001', 9, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:37:00', NULL),
(56, 'LR2607300001', 10, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:37:02', NULL),
(57, 'LR2607300001', 11, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:37:02', NULL),
(58, 'LR2607300001', 12, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:37:05', NULL),
(59, 'LR2607300001', 13, '\"', 1, 'correct', 'self', NULL, 'Great! \" closes the double-quoted string, matching the opening quotation mark.', '2026-10-01 15:48:03', NULL),
(60, 'LR2607300001', 14, '\'', 1, 'correct', 'self', NULL, 'Great! \' closes the single-quoted string, matching the opening quotation mark.', '2026-10-01 15:48:10', NULL),
(61, 'LR2607300001', 15, 'sda', 1, 'incorrect', 'self', NULL, 'Not quite! The blank should be \', since single quotes outside allow double quotes to be used inside without conflict.', '2026-10-01 15:48:47', NULL),
(62, 'LR2607300001', 15, '\'', 2, 'correct', 'self', NULL, 'Great! Single quotes on the outside let the double quotes appear safely inside the string.', '2026-10-01 15:48:56', NULL),
(63, 'LR2607300001', 16, 'dsa', 1, 'incorrect', 'self', NULL, 'Not quite! The blank should be \", since double quotes outside allow single quotes to be used inside without conflict.', '2026-10-01 15:49:02', NULL),
(64, 'LR2607300001', 16, '\"', 2, 'correct', 'self', NULL, 'Great! Double quotes on the outside let the single quotes appear safely inside the string.', '2026-10-01 15:49:07', NULL),
(65, 'LR2607300001', 17, '\'', 1, 'incorrect', 'self', NULL, 'Not quite! The blank should be a matching pair of quotes — the lesson\'s example uses \", since there\'s no internal quote conflict here.', '2026-10-01 15:49:12', NULL),
(66, 'LR2607300001', 17, '\"\"', 2, 'incorrect', 'self', NULL, 'Not quite! The blank should be a matching pair of quotes — the lesson\'s example uses \", since there\'s no internal quote conflict here.', '2026-10-01 15:49:21', NULL),
(67, 'LR2607300001', 17, '', 3, 'skipped', 'self', NULL, NULL, '2026-10-01 15:49:26', NULL);

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
(1, 3, NULL, 'Sino ____ tama', 'Ang', NULL, 'Okay edi wow', 'La na mali ka', 0),
(2, 4, NULL, 'Okokokkok ----------------------', 'Ok', NULL, 'Okokok', 'Kokoko', 0),
(3, 11, NULL, 'To define a function in python, we use the _____ keyword.', 'Def', NULL, 'Correct! the def keyword is used to define a function in python.', 'Not quite. the correct answer is def.', 0),
(4, 11, NULL, 'Which function is used to display text or output on the screen in python? _____', 'Print()', NULL, 'Correct! the print() function displays text or values on the screen.', 'Incorrect. the function used to display output is print().', 0),
(5, 11, NULL, 'Complete the code to store the value 10 in a variable: _____ = 10', 'Number', NULL, 'Correct! number = 10 stores the value 10 in the variable named number.', 'Not quite. the missing variable name is number.', 0),
(6, 11, NULL, 'Which python keyword is used to make a decision when a condition is true? _____', 'If', NULL, 'Correct! the if keyword is used to execute code when a condition is true.', 'Incorrect. the correct keyword is if.', 0),
(7, 11, NULL, 'Complete the code to get input from the user: name = _____(\"enter your name: \")', 'Input()', NULL, 'Correct! the input() function allows a program to receive input from the user.', 'Not quite. the correct function is input().', 0),
(8, 13, NULL, 'Which value should be assigned to message so that printing it displays \"hello python world!\"?\npython\nmessage = __________\nprint(message)', '\"hello python world!\"', NULL, 'Great! you assigned \"hello python world!\" to message, so print(message) displays it.', 'Not quite! the blank should be \"hello python world!\", matching the value stored in message.', 0),
(9, 13, NULL, 'Which variable should be passed to print() so the stored message is displayed?\npython\nmessage = \"hello python world!\"\nprint(__________)', 'message', NULL, 'Great! message holds the string value, so print(message) displays it.', 'Not quite! the blank should be message, the variable holding the value to display.', 0),
(10, 13, NULL, 'Which new value should message be reassigned to, so the second print(message) displays \"hello python crash course world!\"?\npython\nmessage = \"hello python world!\"\nprint(message)\nmessage = __________\nprint(message)', '\"hello python crash course world!\"', NULL, 'Great! you reassigned message to \"hello python crash course world!\", which the second print() displays.', 'Not quite! the blank should be \"hello python crash course world!\", matching the second line of output.', 0),
(11, 13, NULL, 'Which symbol assigns a value to the message variable?\npython\nmessage ___ \"hello python world!\"', '=', NULL, 'Great! = is the assignment symbol that stores the given value into message.', 'Not quite! the blank should be =, the symbol used to assign a value to a variable.', 0),
(12, 13, NULL, 'Which function should be called to display the value currently stored in message?\npython\nmessage = \"hello python world!\"\n__________(message)', 'print', NULL, 'Great! print() displays the value currently stored in message.', 'Not quite! the blank should be print, the function used to display message\'s value.', 0),
(13, 16, NULL, 'Which punctuation mark should complete this double-quoted string, so it correctly closes the string?\n\n\"This is a string.___', '\"', NULL, 'Great! \" closes the double-quoted string, matching the opening quotation mark.', 'Not quite! The blank should be \", the closing double quote that matches the opening one.', 0),
(14, 16, NULL, 'Which punctuation mark should complete this single-quoted string, so it correctly closes the string?\n\n\'This is also a string.____', '\'', NULL, 'Great! \' closes the single-quoted string, matching the opening quotation mark.', 'Not quite! The blank should be \', the closing single quote that matches the opening one.', 0),
(15, 16, NULL, 'This sentence contains an apostrophe-based quote inside it. Which outer quote type should complete this line, so the inner quote marks don\'t break the string?\n\n__________I told my friend, \"Python is my favorite language!\"__________', '\'', NULL, 'Great! Single quotes on the outside let the double quotes appear safely inside the string.', 'Not quite! The blank should be \', since single quotes outside allow double quotes to be used inside without conflict.', 0),
(16, 16, NULL, 'This sentence has a word in single quotes inside it. Which outer quote type should complete this line, so the inner single quotes don\'t break the string?\n\n__________The language \'Python\' is named after Monty Python, not the snake.__________', '\"', NULL, 'Great! Double quotes on the outside let the single quotes appear safely inside the string.', 'Not quite! The blank should be \", since double quotes outside allow single quotes to be used inside without conflict.', 0),
(17, 16, NULL, 'This sentence has no internal quote marks at all. Which quote type completes this standard string?\n\n__________One of Python\'s strengths is its diverse and supportive community.__________', '\"/\'', NULL, 'Reat! Since there are no conflicting quote marks inside, either quote type works — the lesson\'s example uses double quotes.', 'Not quite! The blank should be a matching pair of quotes — the lesson\'s example uses \", since there\'s no internal quote conflict here.', 0);

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
(1, 5, 'O', 'K', 'Wow', 'Why'),
(2, 7, 'Hello what', 'Hello world', 'Nice', 'Wrong'),
(3, 10, 'What keyword is used to define a function in python?', 'Def', 'Correct! the def keyword is used to define a function in python.', 'Not quite. the correct answer is def.'),
(4, 10, 'What is the result of 8 × 7?', '56', 'Correct! 8 multiplied by 7 equals 56.', 'Incorrect. try multiplying 8 by 7 again. the answer is 56.'),
(5, 10, 'What gas do plants absorb from the atmosphere during photosynthesis?', 'Carbon dioxide (co₂)', 'Correct! plants absorb carbon dioxide during photosynthesis.', 'Not quite. plants absorb carbon dioxide (co₂) during photosynthesis.'),
(6, 10, 'What does html stand for?', 'Hypertext markup language', 'Correct! html stands for hypertext markup language.', 'Incorrect. html stands for hypertext markup language.'),
(7, 10, 'What is the largest planet in our solar system?', 'Jupiter', 'Correct! jupiter is the largest planet in our solar system.', 'Not quite. the largest planet in our solar system is jupiter.'),
(8, 14, 'What is the full output when this code runs?\n\nmessage = \"hello python world!\"\nprint(message)\nmessage = \"hello python crash course world!\"\nprint(message)', 'hello python world!\nhello python crash course world!', 'Great job! the first print(message) displays the original value, and after message is reassigned, the second print(message) displays the new value.', 'Not quite! the output shows hello python world! first, then hello python crash course world! after message is reassigned.'),
(9, 14, 'What does the first print(message) display?\n\nmessage = \"hello python world!\"\nprint(message)', 'hello python world!', 'Great job! message holds \"hello python world!\" at that point, so that\'s what the first print(message) displays.', 'Not quite! the first print(message) displays hello python world!, the value message holds at that point.'),
(10, 14, 'What does the second print(message) display, after message is reassigned?\n\nmessage = \"hello python crash course world!\"\nprint(message)', 'hello python crash course world!', 'Great job! after the reassignment, message holds \"hello python crash course world!\", which is what the second print(message) displays.', 'Not quite! the second print(message) displays hello python crash course world!, matching the newly assigned value.'),
(11, 14, 'After the reassignment, is the original value \"hello python world!\" still stored anywhere in message?\n\nmessage = \"hello python world!\"\nmessage = \"hello python crash course world!\"', 'no', 'Great job! python replaces the old value with the new one, so message no longer holds \"hello python world!\" after the reassignment.', 'Not quite! the old value is gone — message now holds only \"hello python crash course world!\", since python replaces the old value with the new one.'),
(12, 14, 'How many lines of output does this code produce in total?\n\nmessage = \"hello python world!\"\nprint(message)\nmessage = \"hello python crash course world!\"\nprint(message)', '2 lines', 'Great job! with two print(message) calls, this code produces two lines of output.', 'Not quite! two lines of output are produced, one for each print(message) call.');

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
(3, 'LR2607300001', 14, NULL, 2, 'completed', '2026-10-01 11:37:11', NULL, NULL, '2026-10-01 11:38:12');

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
(14, 'LR2607300001', 8, 'adadasd', 1, 'incorrect', 'self', NULL, 'Not quite! the output shows hello python world! first, then hello python crash course world! after message is reassigned.', '2026-10-01 11:37:14', NULL),
(15, 'LR2607300001', 8, '', 2, 'skipped', 'self', NULL, NULL, '2026-10-01 11:37:17', NULL),
(16, 'LR2607300001', 9, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:37:20', NULL),
(17, 'LR2607300001', 10, 'hello python crash course world!', 1, 'correct', 'self', NULL, 'Great job! after the reassignment, message holds \"hello python crash course world!\", which is what the second print(message) displays.', '2026-10-01 11:37:46', NULL),
(18, 'LR2607300001', 11, 'no', 1, 'correct', 'self', NULL, 'Great job! python replaces the old value with the new one, so message no longer holds \"hello python world!\" after the reassignment.', '2026-10-01 11:38:06', NULL),
(19, 'LR2607300001', 12, '', 1, 'skipped', 'self', NULL, NULL, '2026-10-01 11:38:12', NULL);

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
(42, 'LR2607300001', 12, 'completed', 1, '2026-10-01 11:30:28'),
(43, 'LR2607300001', 13, 'completed', 0, '2026-10-01 11:37:05'),
(44, 'LR2607300001', 14, 'completed', 2, '2026-10-01 11:38:12'),
(45, 'LR2607300001', 15, 'completed', 3, '2026-10-01 15:47:47'),
(46, 'LR2607300001', 16, 'completed', 2, '2026-10-01 15:49:26');

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
(1, 'LR2607300002', 1, '2026-10-01 14:58:55'),
(2, 'LR2607300002', 3, '2026-10-01 14:58:55'),
(3, 'LR2607300002', 12, '2026-10-01 14:58:55'),
(13, 'LR2607300001', 1, '2026-10-01 15:51:10'),
(14, 'LR2607300001', 3, '2026-10-01 15:51:10'),
(15, 'LR2607300001', 4, '2026-10-01 15:51:10'),
(16, 'LR2607300001', 12, '2026-10-01 15:51:10');

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
(73, 'LR2607300002', 1, 5, 1, NULL, '2026-10-01 08:00:00', '2026-10-01 10:32:46'),
(86, 'LR2607300002', 2, 5, 4, NULL, '2026-10-01 08:00:00', '2026-10-01 10:24:21'),
(190, 'LR2607300002', 3, 5, 5, NULL, '2026-10-01 08:00:00', '2026-10-01 10:24:50'),
(199, 'ACC00005', 1, 2, 0, '2026-09-28 09:34:34', '2026-09-28 08:00:00', '2026-09-28 09:39:03'),
(214, 'ACC00005', 2, 0, 0, '2026-09-28 09:36:25', '2026-09-28 08:00:00', '2026-09-28 09:39:06'),
(257, 'LR2607300001', 1, 0, 0, '2026-10-01 15:47:31', '2026-10-01 08:00:00', '2026-10-01 15:54:14'),
(268, 'LR2607300001', 2, 1, 0, '2026-10-01 15:48:47', '2026-10-01 08:00:00', '2026-10-01 15:49:26'),
(275, 'LR2607300001', 3, 5, 2, NULL, '2026-10-01 08:00:00', '2026-10-01 11:38:12');

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
(12, 'LR2607300002', 'category', 7, '2026-10-01 10:32:49'),
(13, 'LR2607300002', 'category', 10, '2026-10-01 10:32:49'),
(14, 'LR2607300001', 'category', 7, '2026-10-01 10:49:34'),
(15, 'LR2607300001', 'category', 10, '2026-10-01 10:49:34'),
(16, 'LR2607300002', 'category', 11, '2026-10-01 14:58:45'),
(17, 'LR2607300001', 'category', 11, '2026-10-01 15:06:02'),
(18, 'LR2607300001', 'category', 13, '2026-10-01 15:31:51'),
(19, 'LR2607300002', 'category', 13, '2026-10-01 15:56:59');

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
(43, 'LR2607300002', 17, 'completed', '2026-10-01 10:30:29.00000', '2026-10-01 10:30:33', '2026-10-01 10:30:39', '2026-10-01 10:30:40'),
(44, 'LR2607300002', 18, 'in_progress', '2026-10-01 10:30:42.00000', NULL, '2026-10-01 10:30:44', '0000-00-00 00:00:00'),
(45, 'LR2607300001', 17, 'completed', '2026-10-01 11:05:45.00000', '2026-10-01 11:29:42', '2026-10-01 11:29:46', '2026-10-01 11:29:46'),
(46, 'LR2607300001', 18, 'completed', '2026-10-01 11:29:49.00000', NULL, '2026-10-01 11:29:51', '2026-10-01 11:40:32'),
(47, 'LR2607300001', 19, 'completed', '2026-10-01 15:23:36.00000', NULL, '2026-10-01 15:23:37', '2026-10-01 15:49:29');

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
('LR2607300001', 1886, '2026-10-01 17:09:28'),
('LR2607300002', 1915, '2026-10-01 17:07:40');

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
(3, 'Act 2 l1m1c1', 2, 5, 5, 2, 1, 3, 'ACC00001', '2026-09-09 00:30:33', '2026-09-30 15:42:19', '2026-09-23 05:22:31'),
(4, 'Act 1 l1m1c2', 4, 4, 7, 2, 1, 3, 'ACC00001', '2026-09-09 00:31:50', '2026-09-30 15:42:14', '2026-09-23 05:23:34'),
(5, 'Act 1 l2m1c2', 4, 4, 8, 3, 1, 3, 'ACC00001', '2026-09-09 00:32:52', '2026-09-30 15:42:10', '2026-09-23 05:23:40'),
(6, 'Act 1 l3m1c2', 4, 4, 9, 1, 1, 3, 'ACC00001', '2026-09-09 00:33:37', '2026-09-30 15:42:05', '2026-09-23 05:48:27'),
(7, 'Act 1 l1m1c3', 5, 6, 3, 3, 1, 3, 'ACC00001', '2026-09-09 00:34:48', '2026-09-30 15:42:23', NULL),
(8, 'Act 1 l1m2c3', 5, 6, 4, 1, 1, 3, 'ACC00001', '2026-09-09 00:35:47', '2026-09-30 15:42:00', NULL),
(9, 'Try activity', 2, 1, 1, 1, 5, 3, 'LR2607300001', '2026-09-26 19:37:09', '2026-09-30 15:41:51', '2026-09-26 19:37:55'),
(10, 'Testing of flashcards', 2, 1, 1, 3, 5, 3, 'LR2607300001', '2026-09-27 14:54:26', '2026-09-30 15:41:51', '2026-09-27 14:54:26'),
(11, 'Testing for fill in the blanks', 2, 1, 1, 2, 5, 3, 'LR2607300001', '2026-09-27 14:57:29', '2026-09-30 15:41:51', '2026-09-27 14:57:29'),
(12, 'Variables', 10, 15, 18, 1, 5, 2, 'LR2607300001', '2026-10-01 09:35:50', '2026-10-01 10:11:10', '2026-10-01 10:11:10'),
(13, 'Fill in the blanks', 10, 15, 18, 2, 5, 2, 'LR2607300001', '2026-10-01 09:42:18', '2026-10-01 10:22:21', '2026-10-01 10:11:10'),
(14, 'Flashcards', 10, 15, 18, 3, 5, 2, 'LR2607300001', '2026-10-01 09:48:44', '2026-10-01 10:11:10', '2026-10-01 10:11:10'),
(15, 'Multiple choice', 10, 16, 19, 1, 5, 2, 'LR2607300001', '2026-10-01 11:22:51', '2026-10-01 11:29:14', '2026-10-01 11:29:14'),
(16, 'Fill in the blank', 10, 16, 19, 2, 5, 2, 'LR2607300001', '2026-10-01 11:27:58', '2026-10-01 11:29:14', '2026-10-01 11:29:14');

-- --------------------------------------------------------

--
-- Table structure for table `learning_resources_stats_tbl`
--

CREATE TABLE `learning_resources_stats_tbl` (
  `lr_stats_id` int(10) NOT NULL,
  `lr_stats_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learning_resources_stats_tbl`
--

INSERT INTO `learning_resources_stats_tbl` (`lr_stats_id`, `lr_stats_name`) VALUES
(3, 'Archived'),
(1, 'Draft'),
(2, 'Published'),
(4, 'Ready to Publish');

-- --------------------------------------------------------

--
-- Table structure for table `learning_resources_tbl`
--

CREATE TABLE `learning_resources_tbl` (
  `resource_id` int(10) NOT NULL,
  `resource_title` varchar(255) NOT NULL,
  `resource_type_id` int(10) NOT NULL,
  `cat_id` int(10) NOT NULL,
  `module_id` int(10) NOT NULL,
  `uploaded_by` varchar(15) DEFAULT NULL,
  `lr_stats_id` int(10) NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `display_order` int(10) DEFAULT NULL,
  `published_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learning_resources_tbl`
--

INSERT INTO `learning_resources_tbl` (`resource_id`, `resource_title`, `resource_type_id`, `cat_id`, `module_id`, `uploaded_by`, `lr_stats_id`, `created_at`, `updated_at`, `display_order`, `published_at`) VALUES
(1, '12345', 1, 2, 1, 'ACC00001', 3, '2026-08-21 13:37:07', '2026-09-30 15:44:17', 1, '2026-09-26 19:37:48'),
(2, 'Mod 2.2.1', 1, 3, 2, 'ACC00001', 3, '2026-08-21 13:49:20', '2026-09-30 15:44:12', 1, NULL),
(3, 'Run hello world.py.', 1, 5, 6, 'ACC00001', 3, '2026-08-28 13:52:46', '2026-09-30 15:43:29', 1, NULL),
(4, 'Lesson 2 sample', 1, 5, 6, 'ACC00001', 3, '2026-09-08 21:39:28', '2026-09-30 15:43:29', 2, NULL),
(5, 'Lesson 1 sample for ch1', 1, 2, 5, 'ACC00001', 3, '2026-09-08 21:44:18', '2026-09-30 15:44:07', 1, '2026-09-23 05:22:25'),
(6, 'Lesson 2 saple for ch1', 1, 2, 5, 'ACC00001', 3, '2026-09-08 21:45:05', '2026-09-30 15:44:00', 2, '2026-09-23 05:22:39'),
(7, 'Ch2 lesson ex1m1', 1, 4, 4, 'ACC00001', 3, '2026-09-08 21:46:09', '2026-09-30 15:43:52', 1, '2026-09-23 05:23:31'),
(8, 'Cch2 l2 m1', 1, 4, 4, 'ACC00001', 3, '2026-09-08 21:46:37', '2026-09-30 15:43:17', 2, '2026-09-23 05:23:37'),
(9, 'Ch2 l3', 1, 4, 4, 'ACC00001', 3, '2026-09-08 21:47:13', '2026-09-30 15:43:13', 3, '2026-09-23 05:23:44'),
(10, 'Ch2 m2l1', 1, 4, 3, 'ACC00001', 3, '2026-09-08 21:47:37', '2026-09-30 15:43:08', 1, '2026-09-23 05:23:19'),
(11, 'Ch2l2m2', 1, 4, 3, 'ACC00001', 3, '2026-09-08 21:48:10', '2026-09-30 15:42:54', 2, '2026-09-23 05:23:23'),
(12, 'Adalovelace', 1, 4, 4, 'LR2607300001', 3, '2026-09-09 07:28:36', '2026-09-30 15:42:48', 4, '2026-09-23 05:23:51'),
(13, 'Python versions', 1, 7, 8, 'ACC00001', 1, '2026-09-30 15:58:53', '2026-09-30 21:54:26', 1, NULL),
(14, 'Running snippets of python code', 1, 7, 8, 'ACC00001', 1, '2026-09-30 16:06:53', '2026-09-30 21:53:40', 2, NULL),
(15, 'About the vs code editor', 1, 7, 8, 'ACC00001', 1, '2026-09-30 16:08:17', '2026-09-30 16:08:17', 3, NULL),
(16, 'Python on windows', 1, 7, 9, 'ACC00001', 3, '2026-09-30 22:05:10', '2026-09-30 22:06:15', 1, NULL),
(17, 'What really happens when you run hello_world.py', 1, 10, 14, 'LR2607300001', 2, '2026-10-01 09:16:45', '2026-10-01 10:11:10', 1, '2026-10-01 10:11:10'),
(18, 'Variable', 1, 10, 15, 'LR2607300001', 2, '2026-10-01 09:30:04', '2026-10-01 10:11:10', 1, '2026-10-01 10:11:10'),
(19, 'String', 1, 10, 16, 'LR2607300001', 2, '2026-10-01 11:18:09', '2026-10-01 11:29:14', 1, '2026-10-01 11:29:14');

-- --------------------------------------------------------

--
-- Table structure for table `lesson_content_tbl`
--

CREATE TABLE `lesson_content_tbl` (
  `lesson_content_id` int(10) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `content_body` longtext DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `lesson_content_tbl`
--

INSERT INTO `lesson_content_tbl` (`lesson_content_id`, `resource_id`, `content_body`) VALUES
(1, 1, '<div>wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww<br>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd<span style=\"font-size: 1rem;\">wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</span></div><div>awdAWdawdawdwaDAwdadwawdawdawdawdawd</div><div>adwadawd</div>'),
(2, 2, '<div>ok ok ok ok ok ok ok ok ok ok<div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"main.py\">\n                </div>\n                <select class=\"editor-code-mode-select\">\n                    <option value=\"exercise\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" placeholder=\"# Write your code here...\">def calculate_average(numbers):\n    \"\"\"Return the average of a list of numbers.\"\"\"\n    if not numbers:\n        return 0\n    return sum(numbers) / len(numbers)\n\n\nscores = [85, 92, 78, 90, 88]\nresult = calculate_average(scores)\nprint(f\"Average score: {result}\")</div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                        <select class=\"editor-output-mode-select\">\n                            <option value=\"manual\" selected=\"selected\">Manual Input</option>\n                            <option value=\"auto\">Auto-Evaluate from Code</option>\n                        </select>\n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Set the expected output manually.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"true\" placeholder=\"Enter expected output...\">Average score: 86.6</div>\n                </div>\n            </div>\n        </div><div><br></div></div>'),
(3, 3, 'hello worldmsmsmsmsmssssssssssssssssssssssssssssssssssssss<div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"hello_world.py\">\n                </div>\n                <select class=\"editor-code-mode-select\" title=\"Component Type\">\n                    <option value=\"interactive\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\" style=\"grid-column: auto;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\" style=\"display: flex;\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" placeholder=\"e.g. print(&quot;Hello, World!&quot;)\">print(\"hi\")</div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\" style=\"display: flex;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                        \n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Output is dynamically generated based on code execution.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"false\" placeholder=\"e.g. Hello, World!\" style=\"background: rgb(255, 255, 255); color: rgb(55, 65, 81);\">hi</div>\n                </div>\n            </div>\n        </div><div><br></div>'),
(4, 4, '<div>hihihihihihihihi</div><div><div class=\"editor-terminal-container\" contenteditable=\"false\">\n            <div class=\"editor-terminal-card-header\"></div>\n            <div class=\"editor-terminal-card-body\">\n                <div class=\"editor-code-title-row\" style=\"margin-bottom: 4px;\">\n                    <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Terminal / Command Prompt</div>\n                    <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n                </div>\n                <p class=\"editor-code-desc\">Provide command line or REPL shell example for students.</p>\n                <div class=\"editor-terminal-box\" contenteditable=\"true\" spellcheck=\"false\" placeholder=\"Type command prompt or shell example here...\">hello</div>\n            </div>\n        </div><blockquote>holabels</blockquote><div>hello po<br></div><div><div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"hello_name.py\">\n                </div>\n                <select class=\"editor-code-mode-select\" title=\"Component Type\">\n                    <option value=\"interactive\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\" style=\"grid-column: auto;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\" style=\"display: flex;\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" placeholder=\"e.g. print(&quot;Hello, World!&quot;)\">name = input(\"name: \")<div>print(\"hi, \" + name)</div></div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\" style=\"display: flex;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Output is dynamically generated based on code execution.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"false\" placeholder=\"Output will be automatically evaluated from code execution...\">name: hi\nhi, hi</div>\n                </div>\n            </div>\n        </div><div><br></div><br></div><br></div>'),
(5, 5, '<div>ok na ba to pang example?</div><blockquote>tandaan mo time is freaking gold</blockquote><div>pano na to<div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"hello\">\n                </div>\n                <select class=\"editor-code-mode-select\" title=\"Component Type\">\n                    <option value=\"interactive\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\" style=\"grid-column: auto;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\" style=\"display: flex;\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" placeholder=\"e.g. print(&quot;Hello, World!&quot;)\">print(\"hi\")</div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\" style=\"display: flex;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Output is dynamically generated based on code execution.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"false\" placeholder=\"Output will be automatically evaluated from code execution...\"></div>\n                </div>\n            </div>\n        </div><div><br></div><br></div>'),
(6, 6, '<div>so paano na ang magiging itsura nito ngayon ha?</div>'),
(7, 7, '<div>so paano to l1e1n1 hahahahahahahhaaahha</div>'),
(8, 8, '<div>ahjhskajhakjhdkjahdakjdhskjadhskahdsajhdakhdskahdkjahdkjashkjahsdjsahdjahdjaskhd</div>'),
(9, 9, '<div>ch2hdhh33hkjqhwjwqhkjqhkjhkjhkjhkqjhjkqhkjhaskjahkjhdsaksjnasnjxnakjsxnakjndkwndk</div>'),
(10, 10, '<div>hehehehehhe hiihihihihihi</div>'),
(11, 11, '<div>oh ano matatapos pa ba natin to ha hatdog</div>'),
(12, 12, '<div>aandjkasnkdjasnkdjnakjdaksjnda</div>'),
(13, 13, '<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">Python\ncontinually evolves to stay powerful and versatile. This course is designed for\nPython 3.9 or later (with Python 3.11 being the current latest).<o:p></o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\"><o:p>&nbsp;</o:p></span></b></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">Try this:</span></b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\"> Open the command-line app\nfor your operating system:<o:p></o:p></span></p>\n\n<p class=\"MsoListParagraph\" style=\"margin-bottom:0cm;text-align:justify;\ntext-indent:-18.0pt;line-height:normal;mso-list:l0 level1 lfo1\"></p><ul><li><b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">Windows:\n</span></b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">Click Start,\ntype cmd, and press Enter to open Command Prompt.<o:p></o:p></span></li><li><b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">macOS:</span></b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\"> Press Cmd + Space, type\nTerminal, and press Enter.<o:p></o:p></span></li><li><b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">Linux\n(Ubuntu):</span></b><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">\nPress Ctrl + Alt + T.</span></li></ul><!--[if !supportLists]--><p></p>\n\n\n\n\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\"><o:p>&nbsp;</o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span lang=\"EN-US\" style=\"font-family:&quot;Arial&quot;,sans-serif\">Once it\'s open,\n<b>type:</b><o:p></o:p></span></p>\n\n<div class=\"editor-terminal-container\" contenteditable=\"false\">\n            <div class=\"editor-terminal-card-header\"></div>\n            <div class=\"editor-terminal-card-body\">\n                <div class=\"editor-code-title-row\" style=\"margin-bottom: 4px;\">\n                    <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Terminal / Command Prompt</div>\n                    <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n                </div>\n                <p class=\"editor-code-desc\">Provide command line or REPL shell example for students.</p>\n                <div class=\"editor-terminal-box\" contenteditable=\"true\" spellcheck=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"Type command prompt or shell example here...\">            python –version</div>\n            </div>\n        </div><div><br></div>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">You\nshould see something like Python 3.11.4. If the number is lower than 3.9, or\nyou get an error saying the command isn\'t recognized, you\'ll need to install a\nnewer version — the next module walks you through that per OS.<o:p></o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><b>&nbsp;</b></p>\n\n<blockquote><b><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">Common\nmistake:</span></b><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:\nEN-PH\"> Skipping this check and assuming Python is already installed. Confusing\nerrors later on are often actually a version problem in disguise, not a mistake\nin your code.<br><o:p></o:p></span></blockquote>'),
(14, 14, '<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">You\ncan run the Python interpreter directly in your command-line app, letting you\ntest quick bits of code without saving a full file.<o:p></o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\"><o:p>&nbsp;</o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">Open\nthe same command-line app you used in the last lesson, and type:<o:p></o:p></span></p>\n\n<div class=\"editor-terminal-container\" contenteditable=\"false\">\n            <div class=\"editor-terminal-card-header\"></div>\n            <div class=\"editor-terminal-card-body\">\n                <div class=\"editor-code-title-row\" style=\"margin-bottom: 4px;\">\n                    <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Terminal / Command Prompt</div>\n                    <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n                </div>\n                <p class=\"editor-code-desc\">Provide command line or REPL shell example for students.</p>\n                <div class=\"editor-terminal-box\" contenteditable=\"true\" spellcheck=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"Type command prompt or shell example here...\">            python</div>\n            </div>\n        </div><div><br></div>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-fareast-font-family:\nArial;mso-ansi-language:EN-PH;mso-fareast-language:EN-PH\">Press Enter. Your\nprompt will change to &gt;&gt;&gt; — this means you\'re now inside the Python\ninterpreter. You\'ll see snippets like this throughout the course:<o:p></o:p></span></p>\n\n<div class=\"editor-terminal-container\" contenteditable=\"false\">\n            <div class=\"editor-terminal-card-header\"></div>\n            <div class=\"editor-terminal-card-body\">\n                <div class=\"editor-code-title-row\" style=\"margin-bottom: 4px;\">\n                    <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Terminal / Command Prompt</div>\n                    <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n                </div>\n                <p class=\"editor-code-desc\">Provide command line or REPL shell example for students.</p>\n                <div class=\"editor-terminal-box\" contenteditable=\"true\" spellcheck=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"Type command prompt or shell example here...\">&gt;&gt;&gt; print(\"Hello Python interpreter!\")<div>Hello Python interpreter!</div></div>\n            </div>\n        </div><div><br></div>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-fareast-font-family:\nArial;mso-ansi-language:EN-PH;mso-fareast-language:EN-PH\">Type the text <i>after</i>\nthe &gt;&gt;&gt; and press ENTER to run it.<o:p></o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><b>&nbsp;</b></p>\n\n<blockquote><b><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-fareast-font-family:\nArial;mso-ansi-language:EN-PH;mso-fareast-language:EN-PH\">Common mistake:</span></b><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-fareast-font-family:Arial;mso-ansi-language:\nEN-PH;mso-fareast-language:EN-PH\"> Don\'t type the &gt;&gt;&gt; yourself — it\'s\nalready there once you\'re inside the interpreter. Typing &gt;&gt;&gt;\nprint(...) will cause an error.<o:p></o:p></span></blockquote>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-fareast-font-family:\nArial;mso-ansi-language:EN-PH;mso-fareast-language:EN-PH\"><o:p>&nbsp;</o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-fareast-font-family:\nArial;mso-ansi-language:EN-PH;mso-fareast-language:EN-PH\">To leave the\ninterpreter and return to your normal prompt, type exit() and press Enter.<o:p></o:p></span></p>'),
(15, 15, '<div><p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">VS\nCode (Visual Studio Code) is a free, professional-grade text editor that\'s\nbeginner-friendly. It scales from simple exercises to large applications, and\nit runs smoothly on Windows, macOS, and Linux with excellent Python support.<o:p></o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\"><o:p>&nbsp;</o:p></span></p>\n\n<p class=\"MsoNormal\" style=\"margin-bottom:0cm;text-align:justify;line-height:\nnormal\"><span style=\"font-family:&quot;Arial&quot;,sans-serif;mso-ansi-language:EN-PH\">This\ncourse uses VS Code, and installing it is covered in the next module. If you\nalready have a different text editor installed and know how to configure it to\nrun Python, you\'re welcome to use that instead.<o:p></o:p></span></p></div>');
INSERT INTO `lesson_content_tbl` (`lesson_content_id`, `resource_id`, `content_body`) VALUES
(16, 16, '<div class=\"SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; color: rgb(0, 0, 0); font-family: &quot;Segoe UI&quot;, &quot;Segoe UI Web&quot;, Arial, Verdana, sans-serif; font-size: 12px;\"><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"842256714\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{29}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Windows computers don\'t usually come with Python out of the box, so we will likely need to grab the installer and set up VS Code together.</span></span><span class=\"EOP Selected SCXW127615156 BCX0\" data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335551550&quot;:6,&quot;335551620&quot;:6,&quot;335559739&quot;:0,&quot;335559740&quot;:240}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: default; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; background-color: rgb(96, 96, 96) !important; border-color: rgb(96, 96, 96) !important;\">&nbsp;</span></p></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"695295952\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{35}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><br></p></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"511745230\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{39}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-weight: bold; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Step 1: Do You Already Have It?</span></span></p></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"149998104\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{45}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Before downloading anything, let\'s see if your system already has Python installed:</span></span></p></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ol class=\"NumberListStyle1 SCXW127615156 BCX0\" role=\"list\" start=\"1\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"%1.\" data-font=\"Arial\" data-listid=\"9\" data-list-defn-props=\"{&quot;335552541&quot;:0,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769242&quot;:[65533,0],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;%1.&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"1\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"411416004\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{51}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Click your Start menu, type \"</span><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">cmd</span><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">\", and open the Command Prompt app.</span></span></p></li></ol></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ol class=\"NumberListStyle1 SCXW127615156 BCX0\" role=\"list\" start=\"2\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"%1.\" data-font=\"Arial\" data-listid=\"9\" data-list-defn-props=\"{&quot;335552541&quot;:0,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769242&quot;:[65533,0],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;%1.&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"2\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1553651910\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{61}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Type python (all lowercase) and hit ENTER.</span></span></p></li></ol></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ul class=\"BulletListStyle1 SCXW127615156 BCX0\" role=\"list\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; font-family: verdana; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"\" data-font=\"Symbol\" data-listid=\"10\" data-list-defn-props=\"{&quot;335552541&quot;:1,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769226&quot;:&quot;Symbol&quot;,&quot;469769242&quot;:[8226],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"1\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"997917463\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{67}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">If you see a &gt;&gt;&gt; prompt: Awesome! Python is already there. Just make sure the version number starts with 3.9 or higher. If it does, you\'re good to skip ahead!</span></span><span class=\"EOP Selected SCXW127615156 BCX0\" data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335551550&quot;:6,&quot;335551620&quot;:6,&quot;335559739&quot;:0,&quot;335559740&quot;:240}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: default; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; background-color: rgb(96, 96, 96) !important; border-color: rgb(96, 96, 96) !important;\">&nbsp;</span></p></li></ul></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ul class=\"BulletListStyle1 SCXW127615156 BCX0\" role=\"list\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; font-family: verdana; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"\" data-font=\"Symbol\" data-listid=\"10\" data-list-defn-props=\"{&quot;335552541&quot;:1,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769226&quot;:&quot;Symbol&quot;,&quot;469769242&quot;:[8226],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"2\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"2033342222\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{73}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">If you get an error or the Microsoft Store suddenly pops up: Python isn\'t installed yet. Go ahead and close the Microsoft Store if it opened—we want the official version instead.</span></span><span class=\"EOP Selected SCXW127615156 BCX0\" data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335551550&quot;:6,&quot;335551620&quot;:6,&quot;335559739&quot;:0,&quot;335559740&quot;:240}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: default; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; background-color: rgb(96, 96, 96) !important; border-color: rgb(96, 96, 96) !important;\">&nbsp;</span></p></li></ul></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1060416743\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{79}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><br></p></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"457350090\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{83}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-weight: bold; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Step 2: Grab the Official Installer</span></span><span class=\"LineBreakBlob BlobObject DragDrop SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: WordVisiCarriageReturn_MSFontService, Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif;\"><span class=\"SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; white-space: pre !important;\">&nbsp;</span><br class=\"SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; white-space: pre !important;\"></span><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">If you need Python (or have an older version before 3.9), let\'s get it set up:</span></span></p></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ol class=\"NumberListStyle1 SCXW127615156 BCX0\" role=\"list\" start=\"1\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"%1.\" data-font=\"Arial\" data-listid=\"11\" data-list-defn-props=\"{&quot;335552541&quot;:0,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769242&quot;:[65533,0],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;%1.&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"1\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1700746968\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{91}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Head over to python.org and hover over the Downloads menu.</span></span></p></li></ol></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ol class=\"NumberListStyle1 SCXW127615156 BCX0\" role=\"list\" start=\"2\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"%1.\" data-font=\"Arial\" data-listid=\"11\" data-list-defn-props=\"{&quot;335552541&quot;:0,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769242&quot;:[65533,0],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;%1.&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"2\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"361986747\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{97}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Click the big download button for the latest version. It will automatically grab the correct installer for your Windows system.</span></span><span class=\"EOP Selected SCXW127615156 BCX0\" data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335551550&quot;:6,&quot;335551620&quot;:6,&quot;335559739&quot;:0,&quot;335559740&quot;:240}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: default; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; background-color: rgb(96, 96, 96) !important; border-color: rgb(96, 96, 96) !important;\">&nbsp;</span></p></li></ol></div><div class=\"ListContainerWrapper SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; position: relative;\"><ol class=\"NumberListStyle1 SCXW127615156 BCX0\" role=\"list\" start=\"3\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: text; overflow: visible;\"><li aria-setsize=\"-1\" data-leveltext=\"%1.\" data-font=\"Arial\" data-listid=\"11\" data-list-defn-props=\"{&quot;335552541&quot;:0,&quot;335559685&quot;:720,&quot;335559991&quot;:360,&quot;469769242&quot;:[65533,0],&quot;469777803&quot;:&quot;left&quot;,&quot;469777804&quot;:&quot;%1.&quot;,&quot;469777815&quot;:&quot;multilevel&quot;}\" data-aria-posinset=\"3\" data-aria-level=\"1\" role=\"listitem\" class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px 0px 0px 24px; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; display: block; font-size: 11pt; font-family: Arial, Arial_MSFontService, sans-serif; vertical-align: baseline;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1440227005\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{103}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Open the downloaded file to run the installer.</span></span></p></li></ol></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1574531485\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{109}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><br></p></div></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; color: rgb(0, 0, 0); font-family: &quot;Segoe UI&quot;, &quot;Segoe UI Web&quot;, Arial, Verdana, sans-serif; font-size: 12px;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1595943795\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{113}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-weight: bold; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">NOTE:</span></span><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\"> At the very bottom of the installation window, you will see a tiny checkbox that says \"Add python.exe to PATH\" (or \"Add Python to PATH\"). You MUST check this box! Skipping this is the number one reason beginners run into errors later, because it tells Windows exactly where to find your Python tools.</span></span><span class=\"EOP Selected SCXW127615156 BCX0\" data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335551550&quot;:6,&quot;335551620&quot;:6,&quot;335559739&quot;:0,&quot;335559740&quot;:240}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: default; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; background-color: rgb(96, 96, 96) !important; border-color: rgb(96, 96, 96) !important;\">&nbsp;</span></p></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; color: rgb(0, 0, 0); font-family: &quot;Segoe UI&quot;, &quot;Segoe UI Web&quot;, Arial, Verdana, sans-serif; font-size: 12px;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1725752384\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{121}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext; text-align: justify;\"><br></p></div><div class=\"OutlineElement Ltr SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; clear: both; cursor: text; overflow: visible; position: relative; direction: ltr; color: rgb(0, 0, 0); font-family: &quot;Segoe UI&quot;, &quot;Segoe UI Web&quot;, Arial, Verdana, sans-serif; font-size: 12px;\"><p class=\"Paragraph SCXW127615156 BCX0\" paraid=\"1882177307\" paraeid=\"{9a31d2e0-0a59-4b9f-b1c1-587f4fd44b31}{125}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; margin: 0px; user-select: text; overflow-wrap: break-word; vertical-align: baseline; font-kerning: none; background-color: transparent; color: windowtext;\"><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-weight: bold; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Step 3: Running Python in a Terminal Session</span></span><span class=\"LineBreakBlob BlobObject DragDrop SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: WordVisiCarriageReturn_MSFontService, Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif;\"><span class=\"SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; white-space: pre !important;\">&nbsp;</span><br class=\"SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; white-space: pre !important;\"></span><span data-contrast=\"auto\" xml:lang=\"EN-PH\" lang=\"EN-PH\" class=\"TextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; font-variant-ligatures: none !important;\"><span class=\"NormalTextRun SCXW127615156 BCX0\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text;\">Open a new command window and enter python in lowercase. You should see a Python prompt (&gt;&gt;&gt;), which means Windows has found the version of Python you just installed.</span></span><span class=\"EOP Selected SCXW127615156 BCX0\" data-ccp-props=\"{&quot;201341983&quot;:0,&quot;335559739&quot;:0,&quot;335559740&quot;:240}\" style=\"-webkit-user-drag: none; -webkit-tap-highlight-color: transparent; user-select: text; cursor: default; font-size: 11pt; line-height: 16px; font-family: Arial, Arial_EmbeddedFont, Arial_MSFontService, sans-serif; background-color: rgb(96, 96, 96) !important; border-color: rgb(96, 96, 96) !important;\">&nbsp;</span></p></div>'),
(17, 17, '<div><span id=\"docs-internal-guid-0ad6ab44-7fff-8742-11fe-2ce3a47b45cf\"><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Even for a simple script, Python performs a series of background steps to execute your code.</span></p><div><br></div><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">hello_world.py</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">print(\"Hello Python world!\")</span></p><div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"hello_world.py\">\n                </div>\n                <select class=\"editor-code-mode-select\" title=\"Component Type\">\n                    <option value=\"interactive\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\" style=\"grid-column: auto;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\" style=\"display: flex;\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"e.g. print(&quot;Hello, World!&quot;)\">print(\"Hello Python world!\")</div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\" style=\"display: flex;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Output is dynamically generated based on code execution.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"Output will be automatically evaluated from code execution...\">Hello Python world!</div>\n                </div>\n            </div>\n        </div><div><br></div><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">When you run this code, you should see the following output:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Hello Python world!</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">How Python Interprets Your Code</span></p><br><ul style=\"padding-inline-start: 48px;\"><li dir=\"ltr\" style=\"list-style-type: disc; font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre;\" aria-level=\"1\"><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\" role=\"presentation\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">File Recognition: The .py file extension signals to your editor and system that the file contains a Python program.</span></p></li><li dir=\"ltr\" style=\"list-style-type: disc; font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre;\" aria-level=\"1\"><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\" role=\"presentation\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">The Interpreter: Your editor executes the file through the Python interpreter, which reads line-by-line to determine the meaning of each word.</span></p></li><li dir=\"ltr\" style=\"list-style-type: disc; font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre;\" aria-level=\"1\"><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\" role=\"presentation\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Function Execution: When the interpreter detects print() followed by parentheses, it outputs whatever text is contained within those parentheses directly to the screen.</span></p></li></ul><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">As you write programs, your code editor automatically applies syntax highlighting to visually organize and color-code different structural elements of your code.&nbsp;</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">For instance, the editor recognizes print() as a built-in Python function and displays it in one color, while recognizing \"Hello Python world!\" as text data rather than executable code and displaying it in a completely different color.&nbsp;</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">This visual distinction helps you immediately separate functions from data and makes syntax errors much easier to spot as you write.</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:0pt;margin-bottom:0pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">NOTE</span><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">: Syntax highlighting helps you visually separate executable commands from data, making typos and structural errors easy to catch as you write.</span></p><div><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"><br></span></div></span></div><div><br></div><div><br></div>');
INSERT INTO `lesson_content_tbl` (`lesson_content_id`, `resource_id`, `content_body`) VALUES
(18, 18, '<div><span id=\"docs-internal-guid-0da0699d-7fff-2c99-c883-9086866d406a\"><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">A </span><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">variable</span><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"> is a label that holds a value. Every variable is connected to information, and Python always keeps track of its current value.</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">1. How Variables Work</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">​When you assign a value to a variable, Python stores it. If you update the variable later, Python replaces the old value with the new one.</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">code example:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"># hello_world.py</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">message = \"Hello Python world!\"</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">print(message)</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">code output:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Hello Python world!</span></p><div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"hello_world.py\">\n                </div>\n                <select class=\"editor-code-mode-select\" title=\"Component Type\">\n                    <option value=\"interactive\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\" style=\"grid-column: auto;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\" style=\"display: flex;\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"e.g. print(&quot;Hello, World!&quot;)\">message = \"Hello Python world!\"<div><br></div><div>print(message)</div></div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\" style=\"display: flex;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Output is dynamically generated based on code execution.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"Output will be automatically evaluated from code execution...\">Hello Python world!</div>\n                </div>\n            </div>\n        </div><div><br></div><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">We\'ve added a variable named message. Every variable is connected to a value, which is the information associated with that variable. In this case the value is the \"Hello Python world!\" text.</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Adding a variable makes a little more work for the Python interpreter.When it processes the first line, it associates the variable message with the\"Hello Python world!\" text. When it reaches the second line, it prints the value associated with the message to the screen.</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Also, you can change the value stored in a variable at any time:</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">code example:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">message = \"Hello Python world!\"</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">print(message)</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">message = \"Hello Python Crash Course world!\"</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">print(message)</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">code output</span><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Hello Python world!</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Hello Python Crash Course world!</span></p><div class=\"editor-code-container\" contenteditable=\"false\">\n            <div class=\"editor-code-top-bar\">\n                <div class=\"editor-code-filename-group\">\n                    <i class=\"fa-regular fa-file-code\" style=\"color: #6b7280; font-size: 1.1rem;\"></i>\n                    <input type=\"text\" class=\"editor-code-filename\" placeholder=\"File name (e.g. main.py)\" value=\"hello_world.py\">\n                </div>\n                <select class=\"editor-code-mode-select\" title=\"Component Type\">\n                    <option value=\"interactive\" selected=\"selected\">Interactive Exercise (Console + Output)</option>\n                    <option value=\"snippet\">Code Example Only (Console)</option>\n                </select>\n                <button type=\"button\" class=\"editor-delete-block-btn\" title=\"Delete Block\"><i class=\"fa-solid fa-trash-can\"></i></button>\n            </div>\n            <div class=\"editor-code-card console-card-pane\" style=\"grid-column: auto;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-code\"></i> Console</div>\n                        <button type=\"button\" class=\"console-action-btn run-btn\" title=\"Run Code\" style=\"display: flex;\"><i class=\"fa-solid fa-play\"></i> Run</button>\n                    </div>\n                    <p class=\"editor-code-desc\">Provide example code for students.</p>\n                    <div class=\"editor-console-box\" contenteditable=\"true\" spellcheck=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"e.g. print(&quot;Hello, World!&quot;)\">message = \"Hello Python world!\"<div><br></div><div>print(message)</div><div><br></div><div>message = \"Hello Python Crash Course world!\"</div><div><br></div><div>print(message)</div></div>\n                </div>\n            </div>\n            <div class=\"editor-code-card output-card-pane\" style=\"display: flex;\">\n                <div class=\"editor-code-card-header\" style=\"background: #06b6d4 !important;\"></div>\n                <div class=\"editor-code-card-body\">\n                    <div class=\"editor-code-title-row\">\n                        <div class=\"editor-code-title\"><i class=\"fa-solid fa-terminal\"></i> Expected Output</div>\n                    </div>\n                    <p class=\"editor-code-desc output-desc-text\">Output is dynamically generated based on code execution.</p>\n                    <div class=\"editor-output-box\" contenteditable=\"false\" data-gramm=\"false\" data-gramm_editor=\"false\" data-enable-grammarly=\"false\" placeholder=\"Output will be automatically evaluated from code execution...\">Hello Python world!\nHello Python Crash Course world!</div>\n                </div>\n            </div>\n        </div><div><br></div><div><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"><br></span></div></span></div>'),
(19, 19, '<div><span id=\"docs-internal-guid-10e5818b-7fff-ce47-15de-434127feb073\"><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">A string is simply a series of characters. It is one of the most fundamental data types in Python, used to store and manipulate text.</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">1. What is a String?</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Anything enclosed inside quotes is considered a string in Python. You can use either single quotes (\'...\') or double quotes (\"...\") to define them:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">\"This is a string.\"</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">\'This is also a string.\'</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">2. Quotes &amp; Apostrophes Inside Strings</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Python\'s support for both single and double quotes gives you flexibility when your text contains quote marks or apostrophes:</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Double quotes outside allow you to use single quotes/apostrophes inside.</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Single quotes outside allow you to use double quotes inside.</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">&nbsp;Code Examples:&nbsp;</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"># Single quotes inside double quotes</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">\'I told my friend, \"Python is my favorite language!\"\'</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"># Double quotes inside single quotes</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">\"The language \'Python\' is named after Monty Python, not the snake.\"</span></p><br><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"># Standard string without internal quotes</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">\"One of Python\'s strengths is its diverse and supportive community.”</span></p><p dir=\"ltr\" style=\"line-height:1.38;margin-top:12pt;margin-bottom:12pt;\"><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-weight: 700; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">NOTE</span><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">: </span><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\">Match the outer quotes to avoid breaking your string, or choose the outer quote type that doesn\'t conflict with any quote marks inside your text.</span></p><div><span style=\"font-size: 11pt; font-family: Arial, sans-serif; color: rgb(0, 0, 0); background-color: transparent; font-style: italic; font-variant: normal; vertical-align: baseline; white-space: pre-wrap;\"><br></span></div></span></div>');

-- --------------------------------------------------------

--
-- Table structure for table `lesson_recommendations_tbl`
--

CREATE TABLE `lesson_recommendations_tbl` (
  `recommendation_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `module_id` int(10) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `generated_at` datetime NOT NULL,
  `resolved` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `lesson_recommendations_tbl`
--

INSERT INTO `lesson_recommendations_tbl` (`recommendation_id`, `acc_id`, `module_id`, `resource_id`, `reason`, `generated_at`, `resolved`) VALUES
(7, 'LR2607300001', 15, 18, 'Review \'Introduction\' - 12 missed items', '2026-10-01 11:52:42', 0);

-- --------------------------------------------------------

--
-- Table structure for table `lockout_logs_tbl`
--

CREATE TABLE `lockout_logs_tbl` (
  `lockout_id` int(11) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `locked_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `login_logs_tbl`
--

CREATE TABLE `login_logs_tbl` (
  `log_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `attempt_status` varchar(10) NOT NULL,
  `attempted_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `login_logs_tbl`
--

INSERT INTO `login_logs_tbl` (`log_id`, `acc_id`, `ip_address`, `attempt_status`, `attempted_at`) VALUES
(1, 'LR2607300001', '127.0.0.1', 'Success', '2026-07-30 09:09:11'),
(2, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-30 09:31:10'),
(3, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-30 17:02:32'),
(4, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-30 17:11:08'),
(5, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-30 17:11:21'),
(6, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 09:56:20'),
(7, 'LR2607300001', '127.0.0.1', 'Failed', '2026-07-31 10:00:50'),
(8, 'LR2607300001', '127.0.0.1', 'Failed', '2026-07-31 10:00:50'),
(9, 'LR2607300001', '127.0.0.1', 'Failed', '2026-07-31 10:00:51'),
(10, 'LR2607300001', '127.0.0.1', 'Failed', '2026-07-31 10:00:51'),
(11, 'LR2607300001', '127.0.0.1', 'Failed', '2026-07-31 10:00:51'),
(12, 'ACC00001', '127.0.0.1', 'Failed', '2026-07-31 10:01:23'),
(13, 'ACC00001', '127.0.0.1', 'Failed', '2026-07-31 10:01:23'),
(14, 'ACC00001', '127.0.0.1', 'Failed', '2026-07-31 10:01:24'),
(15, 'ACC00001', '127.0.0.1', 'Failed', '2026-07-31 10:01:24'),
(16, 'ACC00001', '127.0.0.1', 'Failed', '2026-07-31 10:01:24'),
(17, 'LR2607300001', '127.0.0.1', 'Success', '2026-07-31 10:03:04'),
(18, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 10:11:53'),
(19, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 10:14:22'),
(20, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 10:14:58'),
(21, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 10:18:40'),
(22, 'LR2607300001', '127.0.0.1', 'Success', '2026-07-31 10:19:31'),
(23, 'LR2607300001', '127.0.0.1', 'Success', '2026-07-31 10:29:35'),
(24, 'LR2607300001', '127.0.0.1', 'Success', '2026-07-31 10:30:21'),
(25, 'LR2607300001', '127.0.0.1', 'Success', '2026-07-31 10:41:46'),
(26, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 11:11:58'),
(27, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 11:12:52'),
(28, 'LR2607300002', '127.0.0.1', 'Success', '2026-07-31 14:34:06'),
(29, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:41:32'),
(30, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:41:33'),
(31, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:41:34'),
(32, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:41:36'),
(33, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:41:38'),
(34, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:42:49'),
(35, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:42:51'),
(36, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:42:52'),
(37, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:42:53'),
(38, 'LR2607300002', '127.0.0.1', 'Failed', '2026-07-31 14:42:55'),
(39, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:22:55'),
(40, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:27:32'),
(41, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:41:13'),
(42, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:42:11'),
(43, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:44:12'),
(44, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-01 08:45:52'),
(45, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:46:31'),
(46, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:56:28'),
(47, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 08:57:32'),
(48, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:00:28'),
(49, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:01:07'),
(50, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:01:22'),
(51, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:07:18'),
(52, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:14:16'),
(53, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:14:29'),
(54, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:17:37'),
(55, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 09:20:26'),
(56, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 14:47:43'),
(57, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 14:54:57'),
(58, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 14:55:03'),
(59, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 14:57:03'),
(60, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:00:30'),
(61, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:04:09'),
(62, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:04:44'),
(63, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:05:42'),
(64, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:08:22'),
(65, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:21:29'),
(66, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:22:29'),
(67, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 15:25:07'),
(68, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:25:10'),
(69, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:28:57'),
(70, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:32:01'),
(71, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:32:11'),
(72, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-01 15:32:28'),
(73, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-01 15:36:54'),
(74, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-01 15:37:53'),
(75, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-01 15:39:08'),
(76, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:42:27'),
(77, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:42:44'),
(78, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 15:54:06'),
(79, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 16:02:28'),
(80, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-01 16:04:54'),
(81, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 16:08:14'),
(82, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 16:08:16'),
(83, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 16:08:17'),
(84, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 16:08:18'),
(85, 'LR2607300002', '127.0.0.1', 'Failed', '2026-08-01 16:08:19'),
(86, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 16:09:54'),
(87, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 16:15:21'),
(88, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-01 16:27:07'),
(89, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-02 03:48:05'),
(90, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-02 04:55:47'),
(91, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-02 12:33:12'),
(92, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-02 12:42:21'),
(93, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 12:43:06'),
(94, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-02 12:48:04'),
(95, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 12:48:17'),
(96, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 13:12:57'),
(97, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 13:13:14'),
(98, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 13:17:30'),
(99, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 13:19:12'),
(100, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 13:20:56'),
(101, 'LR2608010001', '127.0.0.1', 'Failed', '2026-08-02 13:23:23'),
(102, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-02 13:23:27'),
(103, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-03 09:05:27'),
(104, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-03 09:05:56'),
(105, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-04 13:04:15'),
(106, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-04 13:04:46'),
(107, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-06 06:04:36'),
(108, 'LR2607300002', '127.0.0.1', 'Success', '2026-08-06 06:05:53'),
(109, 'LR2607300001', '127.0.0.1', 'Success', '2026-08-06 06:09:43'),
(110, 'LR2608010001', '127.0.0.1', 'Success', '2026-08-06 06:41:59'),
(111, 'LR2607300001', '127.0.0.1', 'Success', '2026-08-06 07:26:51'),
(112, 'LR2607300001', '127.0.0.1', 'Failed', '2026-08-06 07:29:23'),
(113, 'LR2607300001', '127.0.0.1', 'Success', '2026-08-06 07:29:26'),
(114, 'ACC00001', '127.0.0.1', 'Success', '2026-08-07 01:59:47'),
(115, 'ACC00001', '127.0.0.1', 'Success', '2026-08-07 02:01:08'),
(116, 'ACC00001', '127.0.0.1', 'Success', '2026-08-07 08:56:34'),
(117, 'ACC00001', '127.0.0.1', 'Success', '2026-08-07 08:59:33'),
(118, 'ACC00005', '127.0.0.1', 'Failed', '2026-08-07 09:02:08'),
(119, 'ACC00005', '127.0.0.1', 'Failed', '2026-08-07 09:02:14'),
(120, 'ACC00005', '127.0.0.1', 'Success', '2026-08-07 09:03:23'),
(121, 'ACC00001', '127.0.0.1', 'Success', '2026-08-07 09:03:42'),
(122, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-16 06:39:46'),
(123, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-16 06:39:54'),
(124, 'ACC00001', '127.0.0.1', 'Success', '2026-08-16 06:41:47'),
(125, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-16 14:38:25'),
(126, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-16 14:38:35'),
(127, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-16 14:38:43'),
(128, 'ACC00001', '127.0.0.1', 'Success', '2026-08-16 14:40:58'),
(129, 'ACC00001', '127.0.0.1', 'Success', '2026-08-17 00:43:54'),
(130, 'ACC00001', '127.0.0.1', 'Success', '2026-08-17 05:22:22'),
(131, 'ACC00001', '127.0.0.1', 'Success', '2026-08-17 14:54:16'),
(132, 'ACC00001', '127.0.0.1', 'Success', '2026-08-18 05:21:44'),
(133, 'ACC00001', '127.0.0.1', 'Success', '2026-08-18 09:00:16'),
(134, 'ACC00001', '127.0.0.1', 'Success', '2026-08-18 10:01:18'),
(135, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-19 05:54:58'),
(136, 'ACC00001', '127.0.0.1', 'Success', '2026-08-19 05:55:10'),
(137, 'ACC00001', '127.0.0.1', 'Success', '2026-08-21 05:36:23'),
(138, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-22 03:30:30'),
(139, 'ACC00001', '127.0.0.1', 'Success', '2026-08-22 03:30:37'),
(140, 'ACC00001', '127.0.0.1', 'Success', '2026-08-22 03:52:31'),
(141, 'ACC00001', '127.0.0.1', 'Success', '2026-08-23 10:34:45'),
(142, 'ACC00001', '127.0.0.1', 'Success', '2026-08-28 02:59:07'),
(143, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-31 14:17:49'),
(144, 'ACC00001', '127.0.0.1', 'Failed', '2026-08-31 14:17:54'),
(145, 'ACC00001', '127.0.0.1', 'Success', '2026-08-31 14:18:03'),
(146, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-05 12:10:59'),
(147, 'ACC00001', '127.0.0.1', 'Success', '2026-09-05 12:11:04'),
(148, 'ACC00005', '127.0.0.1', 'Success', '2026-09-06 19:49:07'),
(149, 'ACC00005', '127.0.0.1', 'Success', '2026-09-06 20:11:45'),
(150, 'ACC00005', '127.0.0.1', 'Success', '2026-09-06 20:24:28'),
(151, 'ACC00005', '127.0.0.1', 'Success', '2026-09-07 08:48:03'),
(152, 'ACC00005', '127.0.0.1', 'Success', '2026-09-07 11:23:16'),
(153, 'ACC00005', '127.0.0.1', 'Success', '2026-09-07 12:11:49'),
(154, 'ACC00005', '127.0.0.1', 'Success', '2026-09-07 12:18:03'),
(155, 'ACC00005', '127.0.0.1', 'Success', '2026-09-07 12:22:04'),
(156, 'ACC00005', '127.0.0.1', 'Success', '2026-09-07 12:25:38'),
(157, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-08 09:11:25'),
(158, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 09:50:25'),
(159, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 09:50:58'),
(160, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 10:19:34'),
(161, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 10:20:47'),
(162, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 10:22:21'),
(163, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-08 10:27:03'),
(164, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 10:27:07'),
(165, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 10:50:05'),
(166, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 12:58:11'),
(167, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 13:37:20'),
(168, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 13:39:59'),
(169, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 13:41:29'),
(170, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-08 13:48:26'),
(171, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 13:48:31'),
(172, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 13:52:10'),
(173, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 13:57:20'),
(174, 'ACC00001', '127.0.0.1', 'Success', '2026-09-08 16:57:17'),
(175, 'ACC00005', '127.0.0.1', 'Success', '2026-09-08 17:19:11'),
(176, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-08 17:20:51'),
(177, 'ACC00005', '127.0.0.1', 'Success', '2026-09-09 02:54:17'),
(178, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-09 02:55:05'),
(179, 'ACC00005', '127.0.0.1', 'Success', '2026-09-09 02:58:01'),
(180, 'ACC00001', '127.0.0.1', 'Success', '2026-09-09 03:02:05'),
(181, 'ACC00005', '127.0.0.1', 'Success', '2026-09-09 05:10:45'),
(182, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-09 06:06:15'),
(183, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-09 06:08:27'),
(184, 'ACC00005', '127.0.0.1', 'Success', '2026-09-09 06:08:35'),
(185, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-09 12:59:59'),
(186, 'ACC00001', '127.0.0.1', 'Success', '2026-09-09 13:00:07'),
(187, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-10 01:46:52'),
(188, 'ACC00005', '127.0.0.1', 'Success', '2026-09-10 01:46:57'),
(189, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-10 02:01:58'),
(190, 'ACC00001', '127.0.0.1', 'Success', '2026-09-10 02:02:04'),
(191, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-11 05:11:49'),
(192, 'ACC00005', '127.0.0.1', 'Success', '2026-09-11 05:11:59'),
(193, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-11 05:14:06'),
(194, 'ACC00001', '127.0.0.1', 'Success', '2026-09-11 05:14:20'),
(195, 'ACC00001', '127.0.0.1', 'Success', '2026-09-11 09:15:34'),
(196, 'ACC00005', '127.0.0.1', 'Success', '2026-09-15 06:03:36'),
(197, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-15 06:46:18'),
(198, 'ACC00001', '127.0.0.1', 'Success', '2026-09-15 06:46:23'),
(199, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-16 10:26:20'),
(200, 'ACC00005', '127.0.0.1', 'Success', '2026-09-16 10:26:25'),
(201, 'ACC00005', '127.0.0.1', 'Success', '2026-09-16 10:28:53'),
(202, 'ACC00005', '127.0.0.1', 'Success', '2026-09-16 10:30:15'),
(203, 'ACC00001', '127.0.0.1', 'Success', '2026-09-16 13:24:32'),
(204, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-16 13:28:51'),
(205, 'ACC00005', '127.0.0.1', 'Success', '2026-09-16 13:28:56'),
(206, 'ACC00001', '127.0.0.1', 'Success', '2026-09-16 17:58:26'),
(207, 'ACC00005', '127.0.0.1', 'Success', '2026-09-16 17:59:47'),
(208, 'ACC00001', '127.0.0.1', 'Success', '2026-09-16 18:03:10'),
(209, 'ACC00006', '127.0.0.1', 'Failed', '2026-09-18 05:26:22'),
(210, 'ACC00003', '127.0.0.1', 'Success', '2026-09-18 05:28:55'),
(211, 'ACC00005', '127.0.0.1', 'Success', '2026-09-18 05:30:40'),
(212, 'ACC00003', '127.0.0.1', 'Success', '2026-09-18 07:34:09'),
(213, 'ACC00001', '127.0.0.1', 'Success', '2026-09-18 07:37:23'),
(214, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-18 07:38:14'),
(215, 'ACC00005', '127.0.0.1', 'Success', '2026-09-18 07:38:19'),
(216, 'ACC00003', '127.0.0.1', 'Success', '2026-09-18 07:38:57'),
(217, 'ACC00001', '127.0.0.1', 'Success', '2026-09-22 00:43:54'),
(218, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-22 12:44:58'),
(219, 'ACC00005', '127.0.0.1', 'Success', '2026-09-22 12:45:04'),
(220, 'ACC00005', '127.0.0.1', 'Success', '2026-09-22 12:45:22'),
(221, 'ACC00001', '127.0.0.1', 'Success', '2026-09-22 12:47:38'),
(222, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-26 11:30:31'),
(223, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-26 11:31:39'),
(224, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-26 11:38:20'),
(225, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-26 12:48:33'),
(226, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-26 13:14:01'),
(227, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-26 13:14:28'),
(228, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-26 17:20:57'),
(229, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-27 03:48:39'),
(230, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-27 06:48:53'),
(231, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-27 06:50:05'),
(232, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-27 06:58:05'),
(233, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-27 06:58:23'),
(234, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-27 07:38:08'),
(235, 'ACC00005', '127.0.0.1', 'Success', '2026-09-28 01:32:29'),
(236, 'ACC00001', '127.0.0.1', 'Success', '2026-09-28 01:40:23'),
(237, 'ACC00005', '127.0.0.1', 'Success', '2026-09-28 02:05:51'),
(238, 'ACC00001', '127.0.0.1', 'Success', '2026-09-28 15:48:38'),
(239, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-28 16:56:41'),
(240, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-28 16:56:52'),
(241, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-29 01:45:06'),
(242, 'ACC00005', '127.0.0.1', 'Failed', '2026-09-29 01:45:48'),
(243, 'ACC00001', '127.0.0.1', 'Success', '2026-09-29 01:45:58'),
(244, 'ACC00001', '127.0.0.1', 'Success', '2026-09-29 10:38:00'),
(245, 'ACC00001', '127.0.0.1', 'Failed', '2026-09-30 13:50:46'),
(246, 'ACC00001', '127.0.0.1', 'Success', '2026-09-30 13:50:55'),
(247, 'ACC00001', '127.0.0.1', 'Success', '2026-09-30 14:25:13'),
(248, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-30 19:36:57'),
(249, 'LR2607300001', '127.0.0.1', 'Success', '2026-09-30 19:45:42'),
(250, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-30 19:47:05'),
(251, 'LR2607300002', '127.0.0.1', 'Success', '2026-09-30 19:52:00'),
(252, 'LR2607300001', '127.0.0.1', 'Failed', '2026-10-01 00:38:53'),
(253, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 00:39:01'),
(254, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 01:49:03'),
(255, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 02:00:06'),
(256, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 02:05:54'),
(257, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 02:09:43'),
(258, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 02:16:34'),
(259, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 02:21:33'),
(260, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 02:22:36'),
(261, 'LR2607300001', '127.0.0.1', 'Failed', '2026-10-01 02:48:52'),
(262, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 02:48:56'),
(263, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 04:23:23'),
(264, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 04:27:31'),
(265, 'LR2607300001', '127.0.0.1', 'Failed', '2026-10-01 06:24:37'),
(266, 'LR2607300001', '127.0.0.1', 'Failed', '2026-10-01 06:24:42'),
(267, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 06:24:51'),
(268, 'LR2607300002', '127.0.0.1', 'Failed', '2026-10-01 06:31:02'),
(269, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 06:31:09'),
(270, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 06:35:56'),
(271, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 06:58:40'),
(272, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 07:03:50'),
(273, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 07:16:35'),
(274, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 07:16:55'),
(275, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 07:56:55'),
(276, 'LR2607300002', '127.0.0.1', 'Failed', '2026-10-01 08:48:03'),
(277, 'LR2607300002', '127.0.0.1', 'Failed', '2026-10-01 08:48:10'),
(278, 'LR2607300002', '127.0.0.1', 'Success', '2026-10-01 08:48:12'),
(279, 'LR2607300001', '127.0.0.1', 'Success', '2026-10-01 09:07:56');

-- --------------------------------------------------------

--
-- Table structure for table `mcq_activity_sessions_tbl`
--

CREATE TABLE `mcq_activity_sessions_tbl` (
  `session_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `la_id` int(10) NOT NULL,
  `current_q_id` int(10) DEFAULT NULL,
  `score` int(5) NOT NULL DEFAULT 0,
  `status` varchar(20) NOT NULL,
  `started_at` datetime NOT NULL,
  `paused_at` datetime DEFAULT NULL,
  `resumed_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `mcq_activity_sessions_tbl`
--

INSERT INTO `mcq_activity_sessions_tbl` (`session_id`, `acc_id`, `la_id`, `current_q_id`, `score`, `status`, `started_at`, `paused_at`, `resumed_at`, `completed_at`) VALUES
(17, 'LR2607300002', 12, 19, 0, 'in_progress', '2026-10-01 10:30:49', NULL, NULL, NULL),
(18, 'LR2607300001', 12, NULL, 1, 'completed', '2026-10-01 11:29:54', NULL, NULL, '2026-10-01 11:30:28'),
(19, 'LR2607300001', 15, NULL, 3, 'completed', '2026-10-01 15:23:45', '2026-10-01 15:30:14', '2026-10-01 15:46:30', '2026-10-01 15:47:47');

-- --------------------------------------------------------

--
-- Table structure for table `mcq_learner_answers_tbl`
--

CREATE TABLE `mcq_learner_answers_tbl` (
  `answer_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `q_id` int(10) NOT NULL,
  `option_id` int(10) DEFAULT NULL,
  `attempt_number` int(5) NOT NULL,
  `status` varchar(20) NOT NULL,
  `source` varchar(20) NOT NULL,
  `recommendation_id` int(10) DEFAULT NULL,
  `feedback_given` text DEFAULT NULL,
  `answered_at` datetime NOT NULL,
  `retake_id` int(10) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `mcq_learner_answers_tbl`
--

INSERT INTO `mcq_learner_answers_tbl` (`answer_id`, `acc_id`, `q_id`, `option_id`, `attempt_number`, `status`, `source`, `recommendation_id`, `feedback_given`, `answered_at`, `retake_id`) VALUES
(96, 'LR2607300001', 19, 44, 1, 'incorrect', 'self', NULL, 'Not quite. a variable isn\'t a file extension — file extensions like .py are a separate concept covered earlier.', '2026-10-01 11:29:57', NULL),
(97, 'LR2607300001', 19, NULL, 2, 'skipped', 'self', NULL, NULL, '2026-10-01 11:29:59', NULL),
(98, 'LR2607300001', 20, 46, 1, 'correct', 'self', NULL, 'Correct! the lesson explains that when you assign a value to a variable, python stores it.', '2026-10-01 11:30:08', NULL),
(99, 'LR2607300001', 21, 51, 1, 'incorrect', 'self', NULL, 'Correct! the lesson explains that if you update the variable later, python replaces the old value with the new one.', '2026-10-01 11:30:15', NULL),
(100, 'LR2607300001', 21, NULL, 2, 'skipped', 'self', NULL, NULL, '2026-10-01 11:30:19', NULL),
(101, 'LR2607300001', 22, 55, 1, 'incorrect', 'self', NULL, 'Not quite. print(message) does display something — specifically, the value stored in message at that point.', '2026-10-01 11:30:22', NULL),
(102, 'LR2607300001', 22, NULL, 2, 'skipped', 'self', NULL, NULL, '2026-10-01 11:30:23', NULL),
(103, 'LR2607300001', 23, 57, 1, 'incorrect', 'self', NULL, 'Not quite. the common mistake note explicitly says this isn\'t true — you don\'t need to create a new variable to change a value.', '2026-10-01 11:30:27', NULL),
(104, 'LR2607300001', 23, NULL, 2, 'skipped', 'self', NULL, NULL, '2026-10-01 11:30:28', NULL),
(105, 'LR2607300001', 24, 63, 1, 'correct', 'self', NULL, 'Correct! The lesson defines a string as simply a series of characters, one of the most fundamental data types in Python, used to store and manipulate text.', '2026-10-01 15:25:08', NULL),
(106, 'LR2607300001', 25, 65, 1, 'incorrect', 'self', NULL, 'Not quite. The lesson isn\'t limited to double quotes — anything enclosed inside quotes, single or double, is considered a string.', '2026-10-01 15:25:25', NULL),
(107, 'LR2607300001', 25, 66, 2, 'correct', 'self', NULL, 'Correct! The lesson explains that anything enclosed inside quotes is considered a string in Python, using either single quotes or double quotes.', '2026-10-01 15:25:35', NULL),
(108, 'LR2607300001', 26, 70, 1, 'correct', 'self', NULL, 'Correct! The lesson explains that Python\'s support for both single and double quotes gives you flexibility when your text contains quote marks or apostrophes.', '2026-10-01 15:26:05', NULL),
(109, 'LR2607300001', 27, 74, 1, 'correct', 'self', NULL, 'Correct! The lesson explains that double quotes outside allow you to use single quotes/apostrophes inside, avoiding a conflict.', '2026-10-01 15:29:08', NULL),
(110, 'LR2607300001', 28, 80, 1, 'incorrect', 'self', NULL, 'Not quite. This isn\'t related to the note\'s guidance — the concern is about matching outer and inner quote types correctly.', '2026-10-01 15:29:59', NULL),
(111, 'LR2607300001', 28, 78, 2, 'incorrect', 'self', NULL, 'Not quite. Triple quotes aren\'t part of this lesson\'s guidance — the note is about matching your outer quotes carefully.', '2026-10-01 15:30:14', NULL),
(112, 'LR2607300001', 28, 78, 3, 'incorrect', 'self', NULL, 'Not quite. Triple quotes aren\'t part of this lesson\'s guidance — the note is about matching your outer quotes carefully.', '2026-10-01 15:47:31', NULL),
(113, 'LR2607300001', 28, 77, 4, 'incorrect', 'self', NULL, 'Not quite. The lesson doesn\'t forbid quote marks inside strings — it shows examples of using them, as long as the outer quote type is chosen carefully.', '2026-10-01 15:47:44', NULL),
(114, 'LR2607300001', 28, 79, 5, 'correct', 'self', NULL, 'Correct! The common mistake note says to match the outer quotes to avoid breaking your string, or choose the outer quote type that doesn\'t conflict with any quote marks inside your text.', '2026-10-01 15:47:47', NULL),
(115, 'LR2607300001', 25, 67, 3, 'incorrect', 'self', NULL, 'Not quite. The lesson isn\'t limited to single quotes — both single and double quotes can define a string.', '2026-10-01 15:52:28', 1);

-- --------------------------------------------------------

--
-- Table structure for table `mcq_options_tbl`
--

CREATE TABLE `mcq_options_tbl` (
  `option_id` int(10) NOT NULL,
  `q_id` int(10) NOT NULL,
  `option_letter` varchar(2) NOT NULL,
  `option_text` varchar(500) NOT NULL,
  `is_correct` tinyint(1) NOT NULL,
  `feedback` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `mcq_options_tbl`
--

INSERT INTO `mcq_options_tbl` (`option_id`, `q_id`, `option_letter`, `option_text`, `is_correct`, `feedback`) VALUES
(13, 5, 'A', 'Aba ewan', 1, 'Wow tama'),
(14, 5, 'B', 'Idk', 0, 'Maliii ka po'),
(15, 6, 'A', 'Aba ewan', 0, 'Not nice'),
(16, 6, 'B', 'Idk', 1, 'Nice'),
(17, 7, 'A', 'A', 1, 'B'),
(18, 7, 'B', 'B', 0, 'A'),
(19, 8, 'A', 'Ba', 1, 'Is'),
(20, 8, 'B', 'Liw', 0, 'Si'),
(31, 14, 'A', 'Mark', 1, 'Tama'),
(32, 14, 'B', 'Idk', 0, 'Mali'),
(33, 15, 'A', 'Idk', 0, 'Mali'),
(34, 15, 'B', 'Emman', 1, 'Tama to'),
(35, 16, 'A', 'Mark, emman', 1, 'Tama ka pare'),
(36, 16, 'B', 'Idk', 0, 'Maling mali'),
(37, 17, 'A', 'To the moon', 1, 'Tama'),
(38, 17, 'B', 'Sa bulacan', 0, 'Mali ka'),
(39, 18, 'A', 'Nagcocode', 1, 'Galing mo ah'),
(40, 18, 'B', 'Naglalaro', 0, 'Malii'),
(41, 19, 'A', 'A function that displays text', 0, 'Not quite. a variable isn\'t a function — the lesson defines it as a label that holds a value.'),
(42, 19, 'B', 'A type of error message', 0, 'Not quite. a variable isn\'t related to error messages — it\'s a label connected to information that python keeps track of.'),
(43, 19, 'C', 'A label that holds a value', 1, 'Correct! the lesson defines a variable as a label that holds a value, connected to information that python always keeps track of.'),
(44, 19, 'D', 'A file extension', 0, 'Not quite. a variable isn\'t a file extension — file extensions like .py are a separate concept covered earlier.'),
(45, 20, 'A', 'It deletes the value immediately', 0, 'Not quite. assigning a value doesn\'t delete it — python stores the value so it can be used later.'),
(46, 20, 'B', 'It stores the value', 1, 'Correct! the lesson explains that when you assign a value to a variable, python stores it.'),
(47, 20, 'C', 'It prints the value automatically', 0, 'Not quite. assignment alone doesn\'t print anything — a separate print() call is needed to display the value.'),
(48, 20, 'D', 'It converts the value into a different data type', 0, 'Not quite. assignment doesn\'t change the value\'s data type — it simply stores whatever value was assigned.'),
(49, 21, 'A', 'Python keeps both the old and new values together', 1, 'Not quite. python doesn\'t keep both values — it replaces the old value with the new one.'),
(50, 21, 'B', 'Python creates a second variable with the same name', 0, 'Not quite. python doesn\'t create a second variable — it replaces the value stored in the existing one.'),
(51, 21, 'C', 'Python replaces the old value with the new one', 0, 'Correct! the lesson explains that if you update the variable later, python replaces the old value with the new one.'),
(52, 21, 'D', 'Python raises an error', 0, 'Not quite. updating a variable\'s value doesn\'t cause an error — it\'s a normal operation that replaces the old value.'),
(53, 22, 'A', 'The word \"message\"', 0, 'Not quite. print(message) doesn\'t display the variable\'s name — it displays the value currently stored in message.'),
(54, 22, 'B', 'Hello python world!', 1, 'Correct! print(message) displays the value currently stored in message, which is \"hello python world!\".'),
(55, 22, 'C', 'Nothing, since message hasn\'t been printed yetc', 0, 'Not quite. print(message) does display something — specifically, the value stored in message at that point.'),
(56, 22, 'D', 'An error, since message isn\'t defined', 0, 'Not quite. message is defined on the line above, so print(message) runs successfully rather than causing an error.'),
(57, 23, 'A', 'Yes, a new variable must always be created', 0, 'Not quite. the common mistake note explicitly says this isn\'t true — you don\'t need to create a new variable to change a value.'),
(58, 23, 'B', 'No, you just assign the variable again', 1, 'Correct! the common mistake note explains that you don\'t need to \"create\" a new variable to change its value — you just assign it again, and python replaces what was there before.'),
(59, 23, 'C', 'Yes, but only for text values', 0, 'Not quite. this isn\'t limited to certain value types — reassigning works the same way regardless of what kind of value is stored.'),
(60, 23, 'D', 'No, variables can never be changed once assigned', 0, 'Not quite. variables absolutely can be changed — the lesson\'s second example shows message being reassigned to a new value.'),
(61, 24, 'A', 'A type of number used for calculations', 0, 'Not quite. A string isn\'t a number type — the lesson defines it as a series of characters used to store and manipulate text.'),
(62, 24, 'B', 'A file extension used to save Python programs', 0, 'Not quite. File extensions like .py are a separate concept — a string is defined as a series of characters.'),
(63, 24, 'C', 'A series of characters used to store and manipulate text', 1, 'Correct! The lesson defines a string as simply a series of characters, one of the most fundamental data types in Python, used to store and manipulate text.'),
(64, 24, 'D', 'A method used to change capitalization', 0, 'Not quite. Capitalization methods are covered in a different lesson — a string itself is defined as a series of characters.'),
(65, 25, 'A', 'Only text enclosed in double quotes', 0, 'Not quite. The lesson isn\'t limited to double quotes — anything enclosed inside quotes, single or double, is considered a string.'),
(66, 25, 'B', 'Anything enclosed inside quotes, single or double', 1, 'Correct! The lesson explains that anything enclosed inside quotes is considered a string in Python, using either single quotes or double quotes.'),
(67, 25, 'C', 'Only text enclosed in single quotes', 0, 'Not quite. The lesson isn\'t limited to single quotes — both single and double quotes can define a string.'),
(68, 25, 'D', 'Only text without any punctuation', 0, 'Not quite. Punctuation isn\'t the deciding factor — what matters is that the text is enclosed inside quotes.'),
(69, 26, 'A', 'To make code run faster', 0, 'Not quite. Speed isn\'t the reason given — the lesson explains this gives you flexibility when your text contains quote marks or apostrophes.'),
(70, 26, 'B', 'To give flexibility when your text contains quote marks or apostrophes', 1, 'Correct! The lesson explains that Python\'s support for both single and double quotes gives you flexibility when your text contains quote marks or apostrophes.'),
(71, 26, 'C', 'Because single quotes are deprecated', 0, 'Not quite. Single quotes aren\'t deprecated — both single and double quotes are valid, functioning ways to define a string.'),
(72, 26, 'D', 'Because double quotes only work with numbers', 0, 'Not quite. Double quotes work with any text, not just numbers — quote flexibility is about handling apostrophes and quote marks inside the text.'),
(73, 27, 'A', 'Single quotes outside', 0, 'Not quite. Using single quotes outside would conflict with the apostrophe-based quotes inside — double quotes outside are needed to allow single quotes/apostrophes inside.'),
(74, 27, 'B', 'Double quotes outside', 1, 'Correct! The lesson explains that double quotes outside allow you to use single quotes/apostrophes inside, avoiding a conflict.'),
(75, 27, 'C', 'No quotes at all', 0, 'Not quite. Strings must be enclosed in quotes — the choice is between single and double quotes, not omitting them entirely.'),
(76, 27, 'D', 'Triple quotes only', 0, 'Not quite. Triple quotes aren\'t mentioned in this lesson — the lesson covers choosing between single and double quotes for the outer quote type.'),
(77, 28, 'A', 'Never use quote marks inside a string', 0, 'Not quite. The lesson doesn\'t forbid quote marks inside strings — it shows examples of using them, as long as the outer quote type is chosen carefully.'),
(78, 28, 'B', 'Always use triple quotes for every string', 0, 'Not quite. Triple quotes aren\'t part of this lesson\'s guidance — the note is about matching your outer quotes carefully.'),
(79, 28, 'C', 'Match the outer quotes to avoid conflicting with quote marks inside your text', 1, 'Correct! The common mistake note says to match the outer quotes to avoid breaking your string, or choose the outer quote type that doesn\'t conflict with any quote marks inside your text.'),
(80, 28, 'D', 'Only use quotes for numbers, not words', 0, 'Not quite. This isn\'t related to the note\'s guidance — the concern is about matching outer and inner quote types correctly.');

-- --------------------------------------------------------

--
-- Table structure for table `mcq_questions_tbl`
--

CREATE TABLE `mcq_questions_tbl` (
  `q_id` int(10) NOT NULL,
  `la_id` int(10) NOT NULL,
  `question_text` text NOT NULL,
  `sort_order` int(5) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `mcq_questions_tbl`
--

INSERT INTO `mcq_questions_tbl` (`q_id`, `la_id`, `question_text`, `sort_order`) VALUES
(5, 2, 'Ano ang pangalan mo', 0),
(6, 2, 'Ano ang pangalan ko', 0),
(7, 6, 'Aasas', 0),
(8, 8, 'Ba is liw', 0),
(14, 9, 'My name?', 0),
(15, 9, 'His name?', 1),
(16, 9, 'Our names?', 2),
(17, 9, 'San ka punta?', 3),
(18, 9, 'Gawa ko?', 4),
(19, 12, 'What is a variable, according to this lesson?', 0),
(20, 12, 'What does python do when you assign a value to a variable?', 1),
(21, 12, 'What happens if you update a variable later with a new value?', 2),
(22, 12, 'What does print(message) display, once message = \"hello python world!\" has run?', 3),
(23, 12, 'According to the common mistake note, do you need to \"create\" a new variable to change its value?', 4),
(24, 15, 'What is a string, according to this lesson?', 0),
(25, 15, 'Which of the following is considered a string in Python, according to this lesson?', 1),
(26, 15, 'Why does Python support both single and double quotes for defining strings?', 2),
(27, 15, 'If your string contains an apostrophe, like \"I told my friend, \'Python is my favorite language!\'\", which outer quote type should you use?', 3),
(28, 15, 'What does the common mistake note recommend to avoid breaking your string?', 4);

-- --------------------------------------------------------

--
-- Table structure for table `modules_tbl`
--

CREATE TABLE `modules_tbl` (
  `module_id` int(10) NOT NULL,
  `module_name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `cat_id` int(10) NOT NULL,
  `module_stats_id` int(10) NOT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `display_order` int(10) DEFAULT NULL,
  `published_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `modules_tbl`
--

INSERT INTO `modules_tbl` (`module_id`, `module_name`, `description`, `cat_id`, `module_stats_id`, `created_at`, `updated_at`, `is_archived`, `display_order`, `published_at`) VALUES
(1, 'Module 1', 'Mod1 desc', 2, 2, '2026-08-18 19:19:55', '2026-09-30 15:44:43', 1, 1, '2026-09-26 19:37:20'),
(2, 'Module 2.1', 'Desc', 3, 2, '2026-08-21 13:46:00', '2026-09-30 15:44:36', 1, 1, NULL),
(3, 'Setting up your programming environment', 'This gets your workspace totally ready for action.', 4, 2, '2026-08-28 13:16:29', '2026-09-30 15:44:33', 1, 1, '2026-09-23 05:23:15'),
(4, 'Python on different operating systems', 'No matter what kind of computer you\'re using, this part walks you through the specific installation steps.', 4, 2, '2026-08-28 13:34:46', '2026-09-30 15:44:27', 1, 2, '2026-09-23 05:23:27'),
(5, 'What really happens when you run hello_world.Py', 'This pulls back the curtain to show you the behind-the-scenes magic.', 2, 2, '2026-08-28 13:38:00', '2026-09-30 15:44:23', 1, 2, '2026-09-23 05:22:19'),
(6, 'Variables', 'Think of these as labeled boxes for your data.', 5, 2, '2026-08-28 13:38:33', '2026-09-30 15:43:29', 1, 1, NULL),
(7, 'Zgagawa ako ng napaka haba na super duperhaba na title na hindi mailimutan ng lahat ng tao sa buong mundo', 'Okay na ba to', 4, 2, '2026-09-28 17:55:17', '2026-09-28 19:13:08', 1, 3, NULL),
(8, 'Setting up your programming environment', 'This gets your workspace totally ready for action. You\'ll learn how to install python and set up a solid text editor or ide so you have a clean, comfortable place to write all your future code.', 7, 2, '2026-09-30 15:50:48', '2026-09-30 15:50:48', 0, 1, NULL),
(9, 'Python on different operating systems', 'No matter what kind of computer you\'re using, this part walks you through the specific installation steps and path setups so python runs smoothly whether you are on windows, macos, or linux.', 7, 2, '2026-09-30 15:51:30', '2026-09-30 15:51:30', 0, 2, NULL),
(10, 'Running a hello world program', 'The ultimate rite of passage for any programmer! you get to write your very first line of code—the classic print statement—and run it to make sure your setup is officially working.', 7, 2, '2026-09-30 15:52:03', '2026-09-30 15:52:03', 0, 3, NULL),
(11, 'Troubleshooting', 'Things don\'t always go smoothly on the first try, and that is totally normal. This section teaches you how to read those intimidating error messages, spot typos, and fix early setup hiccups like a pro.', 7, 2, '2026-09-30 15:52:39', '2026-09-30 15:52:39', 0, 4, NULL),
(12, 'Running python programs from a terminal', 'This takes you beyond your text editor and shows you how to use your command line or terminal to execute your python scripts directly, which is a super handy skill for any developer.', 7, 2, '2026-09-30 15:53:08', '2026-09-30 15:53:08', 0, 5, NULL),
(13, 'What really happens when you run hello_world.Py', 'Take a deep dive under the hood of python to discover how a simple line of code travels through tokenization, bytecode compilation, and the virtual machine to produce output on your screen.', 9, 2, '2026-10-01 09:05:31', '2026-10-01 09:07:26', 1, 1, NULL),
(14, 'What really happens when you run hello_world.Py', 'Learn how to write, run, and structure your first python scripts while discovering what happens under the hood as your code executes.', 10, 1, '2026-10-01 09:13:49', '2026-10-01 10:11:10', 0, 1, '2026-10-01 10:11:10'),
(15, 'Variables', 'Master how python stores, references, and manages data in memory through variables, types, and fundamental dynamic typing concepts.', 10, 1, '2026-10-01 09:25:36', '2026-10-01 10:11:10', 0, 2, '2026-10-01 10:11:10'),
(16, 'Strings', 'Discover how python handles text data, from string creation and formatting to powerful indexing, slicing, and built-in text manipulation methods.', 10, 1, '2026-10-01 11:08:24', '2026-10-01 11:29:14', 0, 3, '2026-10-01 11:29:14');

-- --------------------------------------------------------

--
-- Table structure for table `module_stats_tbl`
--

CREATE TABLE `module_stats_tbl` (
  `module_stats_id` int(10) NOT NULL,
  `module_stats_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `module_stats_tbl`
--

INSERT INTO `module_stats_tbl` (`module_stats_id`, `module_stats_name`) VALUES
(3, 'Archived'),
(2, 'Draft'),
(1, 'Published'),
(4, 'Ready to Publish');

-- --------------------------------------------------------

--
-- Table structure for table `notifications_tbl`
--

CREATE TABLE `notifications_tbl` (
  `notif_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `notif_type` varchar(30) NOT NULL,
  `title` varchar(200) NOT NULL,
  `detail` varchar(300) DEFAULT NULL,
  `link_url` varchar(255) DEFAULT NULL,
  `dedupe_key` varchar(150) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL,
  `read_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_logs_tbl`
--

CREATE TABLE `password_reset_logs_tbl` (
  `reset_id` int(11) NOT NULL,
  `acc_id` varchar(15) DEFAULT NULL,
  `reset_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `password_reset_logs_tbl`
--

INSERT INTO `password_reset_logs_tbl` (`reset_id`, `acc_id`, `reset_at`) VALUES
(1, 'ACC00005', '2026-08-07 09:03:12'),
(2, 'ACC00001', '2026-08-16 06:41:37'),
(3, 'ACC00001', '2026-08-16 14:40:49'),
(4, 'ACC00005', '2026-09-06 19:48:49'),
(5, 'ACC00003', '2026-09-18 05:28:07'),
(6, 'LR2607300002', '2026-10-01 07:01:01'),
(7, 'LR2607300002', '2026-10-01 07:01:55');

-- --------------------------------------------------------

--
-- Table structure for table `profile_tbl`
--

CREATE TABLE `profile_tbl` (
  `prof_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `firstname` varchar(50) DEFAULT NULL,
  `lastname` varchar(50) DEFAULT NULL,
  `gender` varchar(50) DEFAULT NULL,
  `birthdate` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `profile_tbl`
--

INSERT INTO `profile_tbl` (`prof_id`, `acc_id`, `firstname`, `lastname`, `gender`, `birthdate`) VALUES
(2, 'ACC00001', 'Irish', 'Gregorio', 'Female', '2005-11-11'),
(3, 'ACC00002', 'Nicole', 'Mijoy', 'Female', '2005-01-10'),
(4, 'ACC00003', 'Christian', 'Gold', 'Male', '2005-09-15'),
(5, 'ACC00004', 'Danzen', 'Aquino', 'Male', '2000-02-11'),
(6, 'ACC00005', 'Ayresh', 'Gregorio', 'Female', '2000-11-11'),
(7, 'ACC00006', 'Nathalie', 'Mijoy', 'Female', '2008-11-10'),
(8, 'LR2607300001', 'Emmanuel', 'Spicer', 'Male', '2003-12-08'),
(9, 'LR2607300002', 'Markgil', 'Gamboa', 'Male', '2002-12-26'),
(10, 'LR2608010001', 'Admin', 'Admin', 'Male', '2013-07-30');

-- --------------------------------------------------------

--
-- Table structure for table `resource_types_tbl`
--

CREATE TABLE `resource_types_tbl` (
  `resource_type_id` int(10) NOT NULL,
  `resource_type_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `resource_types_tbl`
--

INSERT INTO `resource_types_tbl` (`resource_type_id`, `resource_type_name`) VALUES
(1, 'Lesson Content');

-- --------------------------------------------------------

--
-- Table structure for table `sandbox_runs_tbl`
--

CREATE TABLE `sandbox_runs_tbl` (
  `run_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `snippet_id` int(10) DEFAULT NULL,
  `code_content` longtext NOT NULL,
  `output` longtext NOT NULL,
  `status` varchar(20) NOT NULL,
  `exec_time_ms` decimal(10,3) DEFAULT NULL,
  `run_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sandbox_runs_tbl`
--

INSERT INTO `sandbox_runs_tbl` (`run_id`, `acc_id`, `snippet_id`, `code_content`, `output`, `status`, `exec_time_ms`, `run_at`) VALUES
(1, 'ACC00005', 5, 'print(\"Hello Python World!\")\nprint(\"Hi Python!\")', 'Hello Python World!\nHi Python!', 'success', NULL, '2026-09-09 19:06:33'),
(2, 'ACC00005', 6, 'name = input(\"name: \")\nprint(\"hello, \" + name)', 'name: irish gregorio\nhello, irish gregorio', 'success', NULL, '2026-09-09 20:46:55'),
(3, 'ACC00005', NULL, 'print(\"hi\")', 'hi', 'success', 43.200, '2026-09-28 10:06:46'),
(4, 'LR2607300001', NULL, '# A simple interactive program for beginners\n\n# Ask for the user\'s name\nname = input(\"What is your name? \")\n\n# Ask for their birth year and convert it to an integer\nbirth_year = input(\"What year were you born? \")\nbirth_year = int(birth_year)\n\n# Calculate age assuming the current year is 2026\ncurrent_year = 2026\nage = current_year - birth_year\n\n# Print a personalized message\nprint(f\"Hello, {name}! You are approximately {age} years old.\")\n\n# Simple conditional (if-else) statement\nif age >= 18:\n    print(\"You are an adult!\")\nelse:\n    print(\"You are still a minor!\")', 'What is your name? emman\nWhat year were you born? 2003\nHello, emman! You are approximately 23 years old.\nYou are an adult!', 'success', 16.700, '2026-10-01 11:54:15'),
(5, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 36, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 5\nSyntaxError: \'await\' outside async function', 'error', 9.200, '2026-10-01 11:55:13'),
(6, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 36, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 5\nSyntaxError: \'await\' outside async function', 'error', 8.600, '2026-10-01 11:56:16'),
(7, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 36, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 5\nSyntaxError: \'await\' outside async function', 'error', 12.400, '2026-10-01 11:56:18'),
(8, 'LR2607300001', NULL, 'import asyncio\n\nasync def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    asyncio.run(sulat_at_basa_ng_file())', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 37, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 19, in _cobrabyte_main\n  File \"/lib/python312.zip/asyncio/runners.py\", line 190, in run\n    raise RuntimeError(\nRuntimeError: asyncio.run() cannot be called from a running event loop\n<exec>:41: RuntimeWarning: coroutine \'_cobrabyte_main.<locals>.sulat_at_basa_ng_file\' was never awaited\nRuntimeWarning: Enable tracemalloc to get the object allocation traceback', 'error', 47.800, '2026-10-01 11:56:30'),
(9, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 36, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 5\nSyntaxError: \'await\' outside async function', 'error', 10.500, '2026-10-01 11:56:47'),
(10, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 36, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 5\nSyntaxError: \'await\' outside async function', 'error', 11.300, '2026-10-01 12:02:33'),
(11, 'LR2607300001', NULL, 'async def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', '<sandbox>:17: RuntimeWarning: coroutine \'_cobrabyte_main.<locals>.sulat_at_basa_ng_file\' was never awaited\nRuntimeWarning: Enable tracemalloc to get the object allocation traceback', 'success', 8.800, '2026-10-01 12:03:45'),
(12, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Traceback (most recent call last):\n  File \"<exec>\", line 39, in <module>\n  File \"<exec>\", line 36, in _cobrabyte_exec_async\n  File \"<sandbox>\", line 5\nSyntaxError: \'await\' outside async function', 'error', 12.300, '2026-10-01 12:09:06'),
(13, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Ano ang gusto mong itala sa file? natuto na ang mag python\nMatagumpay na naisulat sa tala.txt!\n\nBinabasa ang nilalaman ng file...\nNilalaman: natuto na ang mag python', 'success', 22.700, '2026-10-01 12:20:32'),
(14, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Ano ang gusto mong itala sa file? natuto na ako mag python\nMatagumpay na naisulat sa tala.txt!\n\nBinabasa ang nilalaman ng file...\nNilalaman: natuto na ako mag python', 'success', 17.600, '2026-10-01 12:20:49'),
(15, 'LR2607300001', NULL, 'def sulat_at_basa_ng_file():\n    pangalan_ng_file = \"tala.txt\"\n\n    # Pagsusulat sa file\n    mensahe = input(\"Ano ang gusto mong itala sa file? \")\n    with open(pangalan_ng_file, \"w\", encoding=\"utf-8\") as file:\n        file.write(mensahe)\n    print(f\"Matagumpay na naisulat sa {pangalan_ng_file}!\")\n\n    # Pagbabasa mula sa file\n    print(\"\\nBinabasa ang nilalaman ng file...\")\n    with open(pangalan_ng_file, \"r\", encoding=\"utf-8\") as file:\n        nilalaman = file.read()\n        print(f\"Nilalaman: {nilalaman}\")\n\nif __name__ == \"__main__\":\n    sulat_at_basa_ng_file()', 'Ano ang gusto mong itala sa file? natuto nako mag code\nMatagumpay na naisulat sa tala.txt!\n\nBinabasa ang nilalaman ng file...\nNilalaman: natuto nako mag code', 'success', 15.800, '2026-10-01 12:22:08');

-- --------------------------------------------------------

--
-- Table structure for table `sandbox_snippets_tbl`
--

CREATE TABLE `sandbox_snippets_tbl` (
  `snippet_id` int(10) NOT NULL,
  `acc_id` varchar(15) NOT NULL,
  `title` varchar(100) NOT NULL,
  `code_content` longtext NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sandbox_snippets_tbl`
--

INSERT INTO `sandbox_snippets_tbl` (`snippet_id`, `acc_id`, `title`, `code_content`, `created_at`, `updated_at`) VALUES
(5, 'ACC00005', 'print(\"Hello Python World!\")', 'print(\"Hello Python World!\")\nprint(\"Hi Python!\")', '2026-09-09 19:05:33', '2026-09-09 20:50:37'),
(6, 'ACC00005', 'name = input(\"name: \")', 'name = input(\"name: \")\nprint(\"hello, \" + name)', '2026-09-09 20:45:24', '2026-09-09 20:49:45'),
(7, 'ACC00005', 'Untitled snippet', '', '2026-09-09 20:50:41', '0000-00-00 00:00:00'),
(8, 'ACC00005', 'print(\"HI\")', 'print(\"HI\")', '2026-09-11 13:13:13', '0000-00-00 00:00:00'),
(9, 'ACC00005', 'print(\"hi\")', 'print(\"hi\")', '2026-09-28 10:06:48', '0000-00-00 00:00:00');

-- --------------------------------------------------------

--
-- Table structure for table `test_cases_tbl`
--

CREATE TABLE `test_cases_tbl` (
  `test_case_id` int(10) NOT NULL,
  `exercise_id` int(10) NOT NULL,
  `test_order` int(5) NOT NULL,
  `test_input` varchar(500) NOT NULL,
  `expected_output` varchar(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `test_cases_tbl`
--

INSERT INTO `test_cases_tbl` (`test_case_id`, `exercise_id`, `test_order`, `test_input`, `expected_output`) VALUES
(9, 2, 1, 'Alice', 'Hello, Alice!'),
(10, 2, 2, 'Bob', 'Hello, Bob!');

-- --------------------------------------------------------

--
-- Table structure for table `title_history_tbl`
--

CREATE TABLE `title_history_tbl` (
  `history_id` int(10) UNSIGNED NOT NULL,
  `entity_type` enum('category','module','lesson','video','activity','exercise') NOT NULL,
  `entity_id` int(10) NOT NULL,
  `change_type` enum('created','renamed','reverted') NOT NULL DEFAULT 'renamed',
  `old_title` varchar(255) DEFAULT NULL,
  `new_title` varchar(255) NOT NULL,
  `changed_by` varchar(15) DEFAULT NULL,
  `changed_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `title_history_tbl`
--

INSERT INTO `title_history_tbl` (`history_id`, `entity_type`, `entity_id`, `change_type`, `old_title`, `new_title`, `changed_by`, `changed_at`) VALUES
(1, 'category', 2, 'created', NULL, 'Chapter 1', NULL, NULL),
(2, 'category', 3, 'created', NULL, 'Chapter 2', NULL, NULL),
(3, 'category', 4, 'created', NULL, 'Getting started na super duper haba na hindi na nakaktuwa na pati ako maiinis na hindi ko na gugustu', NULL, NULL),
(4, 'category', 5, 'created', NULL, 'Variables and simple data types', NULL, NULL),
(8, 'module', 1, 'created', NULL, 'Module 1', NULL, '2026-08-18 11:19:55'),
(9, 'module', 2, 'created', NULL, 'Module 2.1', NULL, '2026-08-21 05:46:00'),
(10, 'module', 3, 'created', NULL, 'Setting up your programming environment', NULL, '2026-08-28 05:16:29'),
(11, 'module', 4, 'created', NULL, 'Python on different operating systems', NULL, '2026-08-28 05:34:46'),
(12, 'module', 5, 'created', NULL, 'What really happens when you run hello_world.Py', NULL, '2026-08-28 05:38:00'),
(13, 'module', 6, 'created', NULL, 'Variables', NULL, '2026-08-28 05:38:33'),
(14, 'module', 7, 'created', NULL, 'Zgagawa ako ng napaka haba na super duperhaba na title na hindi mailimutan ng lahat ng tao sa buong mundo', NULL, '2026-09-28 09:55:17'),
(15, 'lesson', 1, 'created', NULL, '12345', 'ACC00001', '2026-08-21 05:37:07'),
(16, 'lesson', 2, 'created', NULL, 'Mod 2.2.1', 'ACC00001', '2026-08-21 05:49:20'),
(17, 'lesson', 3, 'created', NULL, 'Run hello world.py.', 'ACC00001', '2026-08-28 05:52:46'),
(18, 'lesson', 4, 'created', NULL, 'Lesson 2 sample', 'ACC00001', '2026-09-08 13:39:28'),
(19, 'lesson', 5, 'created', NULL, 'Lesson 1 sample for ch1', 'ACC00001', '2026-09-08 13:44:18'),
(20, 'lesson', 6, 'created', NULL, 'Lesson 2 saple for ch1', 'ACC00001', '2026-09-08 13:45:05'),
(21, 'lesson', 7, 'created', NULL, 'Ch2 lesson ex1m1', 'ACC00001', '2026-09-08 13:46:09'),
(22, 'lesson', 8, 'created', NULL, 'Cch2 l2 m1', 'ACC00001', '2026-09-08 13:46:37'),
(23, 'lesson', 9, 'created', NULL, 'Ch2 l3', 'ACC00001', '2026-09-08 13:47:13'),
(24, 'lesson', 10, 'created', NULL, 'Ch2 m2l1', 'ACC00001', '2026-09-08 13:47:37'),
(25, 'lesson', 11, 'created', NULL, 'Ch2l2m2', 'ACC00001', '2026-09-08 13:48:10'),
(26, 'lesson', 12, 'created', NULL, 'Adalovelace', 'LR2607300001', '2026-09-08 23:28:36'),
(30, 'video', 1, 'created', NULL, 'Python', 'LR2607300001', '2026-09-08 23:12:20'),
(31, 'video', 2, 'created', NULL, 'Example', 'LR2607300001', '2026-09-08 23:23:37'),
(32, 'video', 3, 'created', NULL, 'Sample video', 'LR2607300001', '2026-09-09 02:57:06'),
(33, 'video', 4, 'created', NULL, 'Bro code sample', 'ACC00001', '2026-09-09 14:37:42'),
(37, 'activity', 1, 'created', NULL, 'Hello world', 'ACC00001', '2026-08-28 06:47:53'),
(38, 'activity', 2, 'created', NULL, 'Act 1 l1m1c1', 'ACC00001', '2026-09-08 16:29:23'),
(39, 'activity', 3, 'created', NULL, 'Act 2 l1m1c1', 'ACC00001', '2026-09-08 16:30:33'),
(40, 'activity', 4, 'created', NULL, 'Act 1 l1m1c2', 'ACC00001', '2026-09-08 16:31:50'),
(41, 'activity', 5, 'created', NULL, 'Act 1 l2m1c2', 'ACC00001', '2026-09-08 16:32:52'),
(42, 'activity', 6, 'created', NULL, 'Act 1 l3m1c2', 'ACC00001', '2026-09-08 16:33:37'),
(43, 'activity', 7, 'created', NULL, 'Act 1 l1m1c3', 'ACC00001', '2026-09-08 16:34:48'),
(44, 'activity', 8, 'created', NULL, 'Act 1 l1m2c3', 'ACC00001', '2026-09-08 16:35:47'),
(45, 'activity', 9, 'created', NULL, 'Try activity', 'LR2607300001', '2026-09-26 11:37:09'),
(46, 'activity', 10, 'created', NULL, 'Testing of flashcards', 'LR2607300001', '2026-09-27 06:54:26'),
(47, 'activity', 11, 'created', NULL, 'Testing for fill in the blanks', 'LR2607300001', '2026-09-27 06:57:29'),
(52, 'exercise', 1, 'created', NULL, 'Hi', 'ACC00001', '2026-08-28 06:55:46'),
(53, 'exercise', 2, 'created', NULL, 'Greet the user', 'ACC00001', '2026-09-16 13:26:16'),
(55, 'module', 6, 'renamed', 'Variables', 'Varia and bles', 'ACC00001', '2026-09-28 17:51:25'),
(56, 'module', 6, 'reverted', 'Varia and bles', 'Variables', 'ACC00001', '2026-09-28 17:53:42'),
(57, 'category', 6, 'created', NULL, 'Try', 'ACC00001', '2026-09-29 20:50:01'),
(58, 'category', 7, 'created', NULL, 'Getting started', 'ACC00001', '2026-09-30 07:49:58'),
(59, 'module', 8, 'created', NULL, 'Setting up your programming environment', 'ACC00001', '2026-09-30 07:50:48'),
(60, 'module', 9, 'created', NULL, 'Python on different operating systems', 'ACC00001', '2026-09-30 07:51:30'),
(61, 'module', 10, 'created', NULL, 'Running a hello world program', 'ACC00001', '2026-09-30 07:52:03'),
(62, 'module', 11, 'created', NULL, 'Troubleshooting', 'ACC00001', '2026-09-30 07:52:39'),
(63, 'module', 12, 'created', NULL, 'Running python programs from a terminal', 'ACC00001', '2026-09-30 07:53:08'),
(64, 'lesson', 13, 'created', NULL, 'Python versions', 'ACC00001', '2026-09-30 07:58:53'),
(65, 'lesson', 14, 'created', NULL, 'Running snippets of python code', 'ACC00001', '2026-09-30 08:06:53'),
(66, 'lesson', 15, 'created', NULL, 'About the vs code editor', 'ACC00001', '2026-09-30 08:08:17'),
(67, 'lesson', 16, 'created', NULL, 'Python on windows', 'ACC00001', '2026-09-30 14:05:10'),
(68, 'category', 8, 'created', NULL, 'Variables', 'LR2607300001', '2026-10-01 00:39:18'),
(69, 'category', 8, 'renamed', 'Variables', 'Variables and simple data types', 'LR2607300001', '2026-10-01 00:44:36'),
(70, 'category', 9, 'created', NULL, 'Chapter 1', 'LR2607300001', '2026-10-01 01:04:17'),
(71, 'module', 13, 'created', NULL, 'What really happens when you run hello_world.Py', 'LR2607300001', '2026-10-01 01:05:31'),
(72, 'category', 10, 'created', NULL, 'Chapter 1', 'LR2607300001', '2026-10-01 01:10:22'),
(73, 'category', 10, 'renamed', 'Chapter 1', 'Chapter 1: variables and simple data types', 'LR2607300001', '2026-10-01 01:12:39'),
(74, 'module', 14, 'created', NULL, 'Module 1: simple scripts', 'LR2607300001', '2026-10-01 01:13:49'),
(75, 'lesson', 17, 'created', NULL, 'What really happens when you run hello_world.py', 'LR2607300001', '2026-10-01 01:16:45'),
(76, 'module', 14, 'renamed', 'Module 1: simple scripts', 'Module 1: running hello_world.Py', 'LR2607300001', '2026-10-01 01:18:44'),
(77, 'module', 14, 'renamed', 'Module 1: running hello_world.Py', 'Module 1: what really happens when you run hello_world.Py', 'LR2607300001', '2026-10-01 01:22:07'),
(78, 'video', 5, 'created', NULL, 'Running hello_world.py', 'LR2607300001', '2026-10-01 01:24:06'),
(79, 'module', 15, 'created', NULL, 'Module 2: variables', 'LR2607300001', '2026-10-01 01:25:36'),
(80, 'module', 14, 'renamed', 'Module 1: what really happens when you run hello_world.Py', 'What really happens when you run hello_world.Py', 'LR2607300001', '2026-10-01 01:26:44'),
(81, 'module', 15, 'renamed', 'Module 2: variables', 'Variables', 'LR2607300001', '2026-10-01 01:26:54'),
(82, 'lesson', 18, 'created', NULL, 'Variable', 'LR2607300001', '2026-10-01 01:30:04'),
(83, 'activity', 12, 'created', NULL, 'Variables', 'LR2607300001', '2026-10-01 01:35:50'),
(84, 'activity', 13, 'created', NULL, 'Fill in the blanks', 'LR2607300001', '2026-10-01 01:42:18'),
(85, 'activity', 14, 'created', NULL, 'Flashcards', 'LR2607300001', '2026-10-01 01:48:44'),
(86, 'category', 11, 'created', NULL, 'Try chapter', 'LR2607300001', '2026-10-01 02:49:28'),
(87, 'category', 12, 'created', NULL, 'Try chapter 2', 'LR2607300001', '2026-10-01 02:49:32'),
(88, 'module', 16, 'created', NULL, 'Strings', 'LR2607300001', '2026-10-01 03:08:24'),
(89, 'lesson', 19, 'created', NULL, 'String', 'LR2607300001', '2026-10-01 03:18:09'),
(90, 'activity', 15, 'created', NULL, 'Multiple choice', 'LR2607300001', '2026-10-01 03:22:51'),
(91, 'activity', 16, 'created', NULL, 'Fill in the blank', 'LR2607300001', '2026-10-01 03:27:58'),
(92, 'category', 13, 'created', NULL, 'Try chapter', 'LR2607300001', '2026-10-01 07:17:18'),
(93, 'category', 14, 'created', NULL, 'Try chapter 2', 'LR2607300001', '2026-10-01 07:17:26'),
(94, 'category', 10, 'renamed', 'Chapter 1: variables and simple data types', 'Variables and simple data types', 'LR2607300001', '2026-10-01 07:31:23');

-- --------------------------------------------------------

--
-- Table structure for table `usertype_tbl`
--

CREATE TABLE `usertype_tbl` (
  `ut_id` int(10) NOT NULL,
  `u_type` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `usertype_tbl`
--

INSERT INTO `usertype_tbl` (`ut_id`, `u_type`) VALUES
(1, 'Admin'),
(2, 'Learner');

-- --------------------------------------------------------

--
-- Table structure for table `video_tutorials_tbl`
--

CREATE TABLE `video_tutorials_tbl` (
  `video_tutorial_id` int(10) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `file_size` varchar(50) DEFAULT NULL,
  `video_title` varchar(255) NOT NULL DEFAULT '',
  `description` longtext DEFAULT NULL,
  `video_stats_id` int(10) DEFAULT NULL,
  `uploaded_by` varchar(15) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `published_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `video_tutorials_tbl`
--

INSERT INTO `video_tutorials_tbl` (`video_tutorial_id`, `resource_id`, `file_path`, `file_size`, `video_title`, `description`, `video_stats_id`, `uploaded_by`, `created_at`, `updated_at`, `published_at`) VALUES
(1, 5, 'uploads/videos/6.1.1-afc06022bd04.mp4', '57881122', 'Python', '<div style=\"text-align: left;\"><span style=\"font-family: inherit;\"><i style=\"\"><u style=\"\">adad</u></i></span></div>', 1, 'LR2607300001', '2026-09-09 07:12:20', '2026-09-30 15:40:25', NULL),
(2, 7, 'uploads/videos/6.2.1-cbd39bd37a35.mp4', '61759694', 'Example', 'sample video', 3, 'LR2607300001', '2026-09-09 07:23:37', '2026-09-30 15:43:52', '2026-09-09 08:06:46'),
(3, 5, 'uploads/videos/6.2.4-68f084264c1e.mp4', '211235970', 'Sample video', '<b><i><u>sample video</u></i></b>', 1, 'LR2607300001', '2026-09-09 10:57:06', '2026-09-30 15:40:25', '2026-09-09 10:57:06'),
(4, 5, 'Sg4GMVMdOPo', NULL, 'Bro code sample', 'brobro', 3, 'ACC00001', '2026-09-09 22:37:42', '2026-09-30 15:44:07', '2026-09-09 22:37:42'),
(5, 17, '4UT0eO25Rjc', NULL, 'Running hello_world.py', '<span style=\"color: rgb(255, 255, 255); font-family: Roboto, Arial, sans-serif; white-space: pre-wrap; background-color: rgba(255, 255, 255, 0.1);\">Learn how to set up a organized project folder and create your very first Python file (hello_world.py) using VS Code.</span>', 2, 'LR2607300001', '2026-10-01 09:24:06', '2026-10-01 10:11:10', '2026-10-01 10:11:10');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `account_tbl`
--
ALTER TABLE `account_tbl`
  ADD PRIMARY KEY (`acc_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `fk_account_usertype` (`u_type`);

--
-- Indexes for table `active_sessions_tbl`
--
ALTER TABLE `active_sessions_tbl`
  ADD PRIMARY KEY (`session_id`),
  ADD UNIQUE KEY `session_token` (`session_token`);

--
-- Indexes for table `activity_retakes_tbl`
--
ALTER TABLE `activity_retakes_tbl`
  ADD PRIMARY KEY (`retake_id`),
  ADD KEY `idx_retake_acc_la` (`acc_id`,`la_id`),
  ADD KEY `fk_retake_la_id` (`la_id`);

--
-- Indexes for table `activity_types_tbl`
--
ALTER TABLE `activity_types_tbl`
  ADD PRIMARY KEY (`activity_type_id`),
  ADD UNIQUE KEY `activity_type_name` (`activity_type_name`);

--
-- Indexes for table `badges_tbl`
--
ALTER TABLE `badges_tbl`
  ADD PRIMARY KEY (`badge_id`),
  ADD UNIQUE KEY `uq_badge_code` (`badge_code`);

--
-- Indexes for table `category_stats_tbl`
--
ALTER TABLE `category_stats_tbl`
  ADD PRIMARY KEY (`cat_stats_id`),
  ADD UNIQUE KEY `cat_stats_name` (`cat_stats_name`);

--
-- Indexes for table `category_tbl`
--
ALTER TABLE `category_tbl`
  ADD PRIMARY KEY (`cat_id`);

--
-- Indexes for table `coding_exercises_tbl`
--
ALTER TABLE `coding_exercises_tbl`
  ADD PRIMARY KEY (`exercise_id`),
  ADD KEY `fk_ce_stats_id` (`exercise_stats_id`),
  ADD KEY `fk_ce_uploaded_by` (`uploaded_by`),
  ADD KEY `fk_ce_resource_id` (`resource_id`);

--
-- Indexes for table `exercise_submissions_tbl`
--
ALTER TABLE `exercise_submissions_tbl`
  ADD PRIMARY KEY (`submission_id`),
  ADD KEY `fk_exsub_account_id` (`acc_id`),
  ADD KEY `fk_exsub_exercise_id` (`exercise_id`),
  ADD KEY `fk_exsub_recommendation_id` (`recommendation_id`);

--
-- Indexes for table `fib_learner_answers_tbl`
--
ALTER TABLE `fib_learner_answers_tbl`
  ADD PRIMARY KEY (`answer_id`),
  ADD KEY `fk_fibans_account_id` (`acc_id`),
  ADD KEY `fk_fibans_fib_id` (`fib_id`),
  ADD KEY `fk_fibans_recommendation_id` (`recommendation_id`),
  ADD KEY `idx_retake_id` (`retake_id`);

--
-- Indexes for table `fib_learner_lives_tbl`
--
ALTER TABLE `fib_learner_lives_tbl`
  ADD PRIMARY KEY (`lives_id`),
  ADD UNIQUE KEY `uq_fiblives_acc_id` (`acc_id`);

--
-- Indexes for table `fill_blanks_tbl`
--
ALTER TABLE `fill_blanks_tbl`
  ADD PRIMARY KEY (`fib_id`),
  ADD KEY `fk_fill_blanks_la_id` (`la_id`);

--
-- Indexes for table `flashcards_tbl`
--
ALTER TABLE `flashcards_tbl`
  ADD PRIMARY KEY (`flashcard_id`),
  ADD KEY `fk_flashcards_la_id` (`la_id`);

--
-- Indexes for table `flashcard_activity_sessions_tbl`
--
ALTER TABLE `flashcard_activity_sessions_tbl`
  ADD PRIMARY KEY (`session_id`),
  ADD KEY `idx_fcsess_acc_la` (`acc_id`,`la_id`),
  ADD KEY `fk_fcsess_la_id` (`la_id`);

--
-- Indexes for table `flashcard_learner_answers_tbl`
--
ALTER TABLE `flashcard_learner_answers_tbl`
  ADD PRIMARY KEY (`answer_id`),
  ADD KEY `fk_fcans_account_id` (`acc_id`),
  ADD KEY `fk_fcans_flashcard_id` (`flashcard_id`),
  ADD KEY `fk_fcans_recommendation_id` (`recommendation_id`),
  ADD KEY `idx_retake_id` (`retake_id`);

--
-- Indexes for table `gender_tbl`
--
ALTER TABLE `gender_tbl`
  ADD PRIMARY KEY (`gender_id`);

--
-- Indexes for table `learner_activity_progress_tbl`
--
ALTER TABLE `learner_activity_progress_tbl`
  ADD PRIMARY KEY (`progress_id`),
  ADD KEY `fk_activity_progress_account_id` (`acc_id`),
  ADD KEY `fk_activity_progress_la_id` (`la_id`);

--
-- Indexes for table `learner_badges_tbl`
--
ALTER TABLE `learner_badges_tbl`
  ADD PRIMARY KEY (`lb_id`),
  ADD UNIQUE KEY `uq_learner_badge` (`acc_id`,`badge_id`),
  ADD KEY `idx_lb_badge` (`badge_id`);

--
-- Indexes for table `learner_exercise_progress_tbl`
--
ALTER TABLE `learner_exercise_progress_tbl`
  ADD PRIMARY KEY (`progress_id`),
  ADD KEY `fk_exercise_progress_account_id` (`acc_id`),
  ADD KEY `fk_exercise_progress_exercise_id` (`exercise_id`);

--
-- Indexes for table `learner_lives_tbl`
--
ALTER TABLE `learner_lives_tbl`
  ADD PRIMARY KEY (`lives_id`),
  ADD UNIQUE KEY `uq_lives_acc_type` (`acc_id`,`activity_type_id`),
  ADD KEY `fk_lives_activity_type_id` (`activity_type_id`);

--
-- Indexes for table `learner_progress_unlocks_tbl`
--
ALTER TABLE `learner_progress_unlocks_tbl`
  ADD PRIMARY KEY (`unlock_id`),
  ADD KEY `fk_unlock_acc_id` (`acc_id`);

--
-- Indexes for table `learner_resource_progress_tbl`
--
ALTER TABLE `learner_resource_progress_tbl`
  ADD PRIMARY KEY (`progress_id`),
  ADD KEY `fk_resource_progress_account_id` (`acc_id`),
  ADD KEY `fk_resource_progress_resource_id` (`resource_id`);

--
-- Indexes for table `learner_time_tbl`
--
ALTER TABLE `learner_time_tbl`
  ADD PRIMARY KEY (`acc_id`);

--
-- Indexes for table `learning_activities_stats_tbl`
--
ALTER TABLE `learning_activities_stats_tbl`
  ADD PRIMARY KEY (`la_stats_id`),
  ADD UNIQUE KEY `la_stats_name` (`la_stats_name`);

--
-- Indexes for table `learning_activities_tbl`
--
ALTER TABLE `learning_activities_tbl`
  ADD PRIMARY KEY (`la_id`),
  ADD KEY `fk_la_category_id` (`cat_id`),
  ADD KEY `fk_la_module_id` (`module_id`),
  ADD KEY `fk_la_activity_type_id` (`activity_type_id`),
  ADD KEY `fk_la_stats_id` (`la_stats_id`),
  ADD KEY `fk_la_uploaded_by` (`uploaded_by`),
  ADD KEY `fk_la_resource_id` (`resource_id`);

--
-- Indexes for table `learning_resources_stats_tbl`
--
ALTER TABLE `learning_resources_stats_tbl`
  ADD PRIMARY KEY (`lr_stats_id`),
  ADD UNIQUE KEY `lr_stats_name` (`lr_stats_name`);

--
-- Indexes for table `learning_resources_tbl`
--
ALTER TABLE `learning_resources_tbl`
  ADD PRIMARY KEY (`resource_id`),
  ADD KEY `fk_lr_resource_type_id` (`resource_type_id`),
  ADD KEY `fk_lr_resource_category_id` (`cat_id`),
  ADD KEY `fk_lr_module_id` (`module_id`),
  ADD KEY `fk_lr_stats_id` (`lr_stats_id`),
  ADD KEY `fk_lr_uploaded_by` (`uploaded_by`);

--
-- Indexes for table `lesson_content_tbl`
--
ALTER TABLE `lesson_content_tbl`
  ADD PRIMARY KEY (`lesson_content_id`),
  ADD KEY `fk_lc_resource_id` (`resource_id`);

--
-- Indexes for table `lesson_recommendations_tbl`
--
ALTER TABLE `lesson_recommendations_tbl`
  ADD PRIMARY KEY (`recommendation_id`),
  ADD KEY `fk_lrec_account_id` (`acc_id`),
  ADD KEY `fk_lrec_module_id` (`module_id`),
  ADD KEY `fk_lrec_resource_id` (`resource_id`);

--
-- Indexes for table `lockout_logs_tbl`
--
ALTER TABLE `lockout_logs_tbl`
  ADD PRIMARY KEY (`lockout_id`);

--
-- Indexes for table `login_logs_tbl`
--
ALTER TABLE `login_logs_tbl`
  ADD PRIMARY KEY (`log_id`),
  ADD KEY `fk_login_logs_account_id` (`acc_id`);

--
-- Indexes for table `mcq_activity_sessions_tbl`
--
ALTER TABLE `mcq_activity_sessions_tbl`
  ADD PRIMARY KEY (`session_id`),
  ADD KEY `idx_mcqsess_acc_la` (`acc_id`,`la_id`),
  ADD KEY `fk_mcqsess_la_id` (`la_id`);

--
-- Indexes for table `mcq_learner_answers_tbl`
--
ALTER TABLE `mcq_learner_answers_tbl`
  ADD PRIMARY KEY (`answer_id`),
  ADD KEY `fk_mcqans_account_id` (`acc_id`),
  ADD KEY `fk_mcqans_question_id` (`q_id`),
  ADD KEY `fk_mcqans_option_id` (`option_id`),
  ADD KEY `fk_mcqans_recommendation_id` (`recommendation_id`),
  ADD KEY `idx_retake_id` (`retake_id`);

--
-- Indexes for table `mcq_options_tbl`
--
ALTER TABLE `mcq_options_tbl`
  ADD PRIMARY KEY (`option_id`),
  ADD KEY `fk_mcq_options_q_id` (`q_id`);

--
-- Indexes for table `mcq_questions_tbl`
--
ALTER TABLE `mcq_questions_tbl`
  ADD PRIMARY KEY (`q_id`),
  ADD KEY `fk_mcq_questions_la_id` (`la_id`);

--
-- Indexes for table `modules_tbl`
--
ALTER TABLE `modules_tbl`
  ADD PRIMARY KEY (`module_id`),
  ADD KEY `fk_modules_category_id` (`cat_id`),
  ADD KEY `fk_modules_status_id` (`module_stats_id`);

--
-- Indexes for table `module_stats_tbl`
--
ALTER TABLE `module_stats_tbl`
  ADD PRIMARY KEY (`module_stats_id`),
  ADD UNIQUE KEY `module_stats_name` (`module_stats_name`);

--
-- Indexes for table `notifications_tbl`
--
ALTER TABLE `notifications_tbl`
  ADD PRIMARY KEY (`notif_id`),
  ADD UNIQUE KEY `uq_notif_dedupe` (`acc_id`,`dedupe_key`),
  ADD KEY `idx_notif_acc_time` (`acc_id`,`created_at`);

--
-- Indexes for table `password_reset_logs_tbl`
--
ALTER TABLE `password_reset_logs_tbl`
  ADD PRIMARY KEY (`reset_id`);

--
-- Indexes for table `profile_tbl`
--
ALTER TABLE `profile_tbl`
  ADD PRIMARY KEY (`prof_id`),
  ADD KEY `fk_profile_account_id` (`acc_id`);

--
-- Indexes for table `resource_types_tbl`
--
ALTER TABLE `resource_types_tbl`
  ADD PRIMARY KEY (`resource_type_id`);

--
-- Indexes for table `sandbox_runs_tbl`
--
ALTER TABLE `sandbox_runs_tbl`
  ADD PRIMARY KEY (`run_id`),
  ADD KEY `fk_runs_account_id` (`acc_id`),
  ADD KEY `fk_runs_snippet_id` (`snippet_id`),
  ADD KEY `idx_sandbox_runs_run_at` (`run_at`);

--
-- Indexes for table `sandbox_snippets_tbl`
--
ALTER TABLE `sandbox_snippets_tbl`
  ADD PRIMARY KEY (`snippet_id`),
  ADD KEY `fk_snippets_account_id` (`acc_id`);

--
-- Indexes for table `test_cases_tbl`
--
ALTER TABLE `test_cases_tbl`
  ADD PRIMARY KEY (`test_case_id`),
  ADD KEY `fk_test_cases_exercise_id` (`exercise_id`);

--
-- Indexes for table `title_history_tbl`
--
ALTER TABLE `title_history_tbl`
  ADD PRIMARY KEY (`history_id`),
  ADD KEY `idx_entity` (`entity_type`,`entity_id`,`changed_at`),
  ADD KEY `idx_changed_by` (`changed_by`);

--
-- Indexes for table `usertype_tbl`
--
ALTER TABLE `usertype_tbl`
  ADD PRIMARY KEY (`ut_id`);

--
-- Indexes for table `video_tutorials_tbl`
--
ALTER TABLE `video_tutorials_tbl`
  ADD PRIMARY KEY (`video_tutorial_id`),
  ADD KEY `fk_vt_resource_id` (`resource_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `active_sessions_tbl`
--
ALTER TABLE `active_sessions_tbl`
  MODIFY `session_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7495;

--
-- AUTO_INCREMENT for table `activity_retakes_tbl`
--
ALTER TABLE `activity_retakes_tbl`
  MODIFY `retake_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `activity_types_tbl`
--
ALTER TABLE `activity_types_tbl`
  MODIFY `activity_type_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `badges_tbl`
--
ALTER TABLE `badges_tbl`
  MODIFY `badge_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=169;

--
-- AUTO_INCREMENT for table `category_stats_tbl`
--
ALTER TABLE `category_stats_tbl`
  MODIFY `cat_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `category_tbl`
--
ALTER TABLE `category_tbl`
  MODIFY `cat_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `coding_exercises_tbl`
--
ALTER TABLE `coding_exercises_tbl`
  MODIFY `exercise_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `exercise_submissions_tbl`
--
ALTER TABLE `exercise_submissions_tbl`
  MODIFY `submission_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `fib_learner_answers_tbl`
--
ALTER TABLE `fib_learner_answers_tbl`
  MODIFY `answer_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=68;

--
-- AUTO_INCREMENT for table `fib_learner_lives_tbl`
--
ALTER TABLE `fib_learner_lives_tbl`
  MODIFY `lives_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `fill_blanks_tbl`
--
ALTER TABLE `fill_blanks_tbl`
  MODIFY `fib_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=18;

--
-- AUTO_INCREMENT for table `flashcards_tbl`
--
ALTER TABLE `flashcards_tbl`
  MODIFY `flashcard_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `flashcard_activity_sessions_tbl`
--
ALTER TABLE `flashcard_activity_sessions_tbl`
  MODIFY `session_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `flashcard_learner_answers_tbl`
--
ALTER TABLE `flashcard_learner_answers_tbl`
  MODIFY `answer_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `gender_tbl`
--
ALTER TABLE `gender_tbl`
  MODIFY `gender_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `learner_activity_progress_tbl`
--
ALTER TABLE `learner_activity_progress_tbl`
  MODIFY `progress_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;

--
-- AUTO_INCREMENT for table `learner_badges_tbl`
--
ALTER TABLE `learner_badges_tbl`
  MODIFY `lb_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=43;

--
-- AUTO_INCREMENT for table `learner_exercise_progress_tbl`
--
ALTER TABLE `learner_exercise_progress_tbl`
  MODIFY `progress_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `learner_lives_tbl`
--
ALTER TABLE `learner_lives_tbl`
  MODIFY `lives_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=321;

--
-- AUTO_INCREMENT for table `learner_progress_unlocks_tbl`
--
ALTER TABLE `learner_progress_unlocks_tbl`
  MODIFY `unlock_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `learner_resource_progress_tbl`
--
ALTER TABLE `learner_resource_progress_tbl`
  MODIFY `progress_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=48;

--
-- AUTO_INCREMENT for table `learning_activities_stats_tbl`
--
ALTER TABLE `learning_activities_stats_tbl`
  MODIFY `la_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `learning_activities_tbl`
--
ALTER TABLE `learning_activities_tbl`
  MODIFY `la_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `learning_resources_stats_tbl`
--
ALTER TABLE `learning_resources_stats_tbl`
  MODIFY `lr_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `learning_resources_tbl`
--
ALTER TABLE `learning_resources_tbl`
  MODIFY `resource_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `lesson_content_tbl`
--
ALTER TABLE `lesson_content_tbl`
  MODIFY `lesson_content_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `lesson_recommendations_tbl`
--
ALTER TABLE `lesson_recommendations_tbl`
  MODIFY `recommendation_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `lockout_logs_tbl`
--
ALTER TABLE `lockout_logs_tbl`
  MODIFY `lockout_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `login_logs_tbl`
--
ALTER TABLE `login_logs_tbl`
  MODIFY `log_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=280;

--
-- AUTO_INCREMENT for table `mcq_activity_sessions_tbl`
--
ALTER TABLE `mcq_activity_sessions_tbl`
  MODIFY `session_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `mcq_learner_answers_tbl`
--
ALTER TABLE `mcq_learner_answers_tbl`
  MODIFY `answer_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=116;

--
-- AUTO_INCREMENT for table `mcq_options_tbl`
--
ALTER TABLE `mcq_options_tbl`
  MODIFY `option_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=81;

--
-- AUTO_INCREMENT for table `mcq_questions_tbl`
--
ALTER TABLE `mcq_questions_tbl`
  MODIFY `q_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=29;

--
-- AUTO_INCREMENT for table `modules_tbl`
--
ALTER TABLE `modules_tbl`
  MODIFY `module_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT for table `module_stats_tbl`
--
ALTER TABLE `module_stats_tbl`
  MODIFY `module_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `notifications_tbl`
--
ALTER TABLE `notifications_tbl`
  MODIFY `notif_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `password_reset_logs_tbl`
--
ALTER TABLE `password_reset_logs_tbl`
  MODIFY `reset_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `profile_tbl`
--
ALTER TABLE `profile_tbl`
  MODIFY `prof_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `resource_types_tbl`
--
ALTER TABLE `resource_types_tbl`
  MODIFY `resource_type_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `sandbox_runs_tbl`
--
ALTER TABLE `sandbox_runs_tbl`
  MODIFY `run_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `sandbox_snippets_tbl`
--
ALTER TABLE `sandbox_snippets_tbl`
  MODIFY `snippet_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `test_cases_tbl`
--
ALTER TABLE `test_cases_tbl`
  MODIFY `test_case_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `title_history_tbl`
--
ALTER TABLE `title_history_tbl`
  MODIFY `history_id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=95;

--
-- AUTO_INCREMENT for table `usertype_tbl`
--
ALTER TABLE `usertype_tbl`
  MODIFY `ut_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `video_tutorials_tbl`
--
ALTER TABLE `video_tutorials_tbl`
  MODIFY `video_tutorial_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `account_tbl`
--
ALTER TABLE `account_tbl`
  ADD CONSTRAINT `fk_account_usertype` FOREIGN KEY (`u_type`) REFERENCES `usertype_tbl` (`ut_id`);

--
-- Constraints for table `activity_retakes_tbl`
--
ALTER TABLE `activity_retakes_tbl`
  ADD CONSTRAINT `fk_retake_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_retake_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `coding_exercises_tbl`
--
ALTER TABLE `coding_exercises_tbl`
  ADD CONSTRAINT `fk_ce_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`),
  ADD CONSTRAINT `fk_ce_stats_id` FOREIGN KEY (`exercise_stats_id`) REFERENCES `learning_activities_stats_tbl` (`la_stats_id`),
  ADD CONSTRAINT `fk_ce_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `exercise_submissions_tbl`
--
ALTER TABLE `exercise_submissions_tbl`
  ADD CONSTRAINT `fk_exsub_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_exsub_exercise_id` FOREIGN KEY (`exercise_id`) REFERENCES `coding_exercises_tbl` (`exercise_id`),
  ADD CONSTRAINT `fk_exsub_recommendation_id` FOREIGN KEY (`recommendation_id`) REFERENCES `lesson_recommendations_tbl` (`recommendation_id`);

--
-- Constraints for table `fib_learner_answers_tbl`
--
ALTER TABLE `fib_learner_answers_tbl`
  ADD CONSTRAINT `fk_fibans_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_fibans_fib_id` FOREIGN KEY (`fib_id`) REFERENCES `fill_blanks_tbl` (`fib_id`),
  ADD CONSTRAINT `fk_fibans_recommendation_id` FOREIGN KEY (`recommendation_id`) REFERENCES `lesson_recommendations_tbl` (`recommendation_id`);

--
-- Constraints for table `fib_learner_lives_tbl`
--
ALTER TABLE `fib_learner_lives_tbl`
  ADD CONSTRAINT `fk_fiblives_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `fill_blanks_tbl`
--
ALTER TABLE `fill_blanks_tbl`
  ADD CONSTRAINT `fk_fill_blanks_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `flashcards_tbl`
--
ALTER TABLE `flashcards_tbl`
  ADD CONSTRAINT `fk_flashcards_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `flashcard_activity_sessions_tbl`
--
ALTER TABLE `flashcard_activity_sessions_tbl`
  ADD CONSTRAINT `fk_fcsess_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_fcsess_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `flashcard_learner_answers_tbl`
--
ALTER TABLE `flashcard_learner_answers_tbl`
  ADD CONSTRAINT `fk_fcans_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_fcans_flashcard_id` FOREIGN KEY (`flashcard_id`) REFERENCES `flashcards_tbl` (`flashcard_id`),
  ADD CONSTRAINT `fk_fcans_recommendation_id` FOREIGN KEY (`recommendation_id`) REFERENCES `lesson_recommendations_tbl` (`recommendation_id`);

--
-- Constraints for table `learner_activity_progress_tbl`
--
ALTER TABLE `learner_activity_progress_tbl`
  ADD CONSTRAINT `fk_activity_progress_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_activity_progress_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `learner_badges_tbl`
--
ALTER TABLE `learner_badges_tbl`
  ADD CONSTRAINT `fk_lb_acc` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_lb_badge` FOREIGN KEY (`badge_id`) REFERENCES `badges_tbl` (`badge_id`) ON DELETE CASCADE;

--
-- Constraints for table `learner_exercise_progress_tbl`
--
ALTER TABLE `learner_exercise_progress_tbl`
  ADD CONSTRAINT `fk_exercise_progress_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_exercise_progress_exercise_id` FOREIGN KEY (`exercise_id`) REFERENCES `coding_exercises_tbl` (`exercise_id`);

--
-- Constraints for table `learner_lives_tbl`
--
ALTER TABLE `learner_lives_tbl`
  ADD CONSTRAINT `fk_lives_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_lives_activity_type_id` FOREIGN KEY (`activity_type_id`) REFERENCES `activity_types_tbl` (`activity_type_id`);

--
-- Constraints for table `learner_progress_unlocks_tbl`
--
ALTER TABLE `learner_progress_unlocks_tbl`
  ADD CONSTRAINT `fk_unlock_acc_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `learner_resource_progress_tbl`
--
ALTER TABLE `learner_resource_progress_tbl`
  ADD CONSTRAINT `fk_resource_progress_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_resource_progress_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`);

--
-- Constraints for table `learner_time_tbl`
--
ALTER TABLE `learner_time_tbl`
  ADD CONSTRAINT `fk_learner_time_acc` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`) ON DELETE CASCADE;

--
-- Constraints for table `learning_activities_tbl`
--
ALTER TABLE `learning_activities_tbl`
  ADD CONSTRAINT `fk_la_activity_type_id` FOREIGN KEY (`activity_type_id`) REFERENCES `activity_types_tbl` (`activity_type_id`),
  ADD CONSTRAINT `fk_la_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`),
  ADD CONSTRAINT `fk_la_stats_id` FOREIGN KEY (`la_stats_id`) REFERENCES `learning_activities_stats_tbl` (`la_stats_id`),
  ADD CONSTRAINT `fk_la_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `learning_resources_tbl`
--
ALTER TABLE `learning_resources_tbl`
  ADD CONSTRAINT `fk_lr_module_id` FOREIGN KEY (`module_id`) REFERENCES `modules_tbl` (`module_id`),
  ADD CONSTRAINT `fk_lr_resource_category_id` FOREIGN KEY (`cat_id`) REFERENCES `category_tbl` (`cat_id`),
  ADD CONSTRAINT `fk_lr_resource_type_id` FOREIGN KEY (`resource_type_id`) REFERENCES `resource_types_tbl` (`resource_type_id`),
  ADD CONSTRAINT `fk_lr_stats_id` FOREIGN KEY (`lr_stats_id`) REFERENCES `learning_resources_stats_tbl` (`lr_stats_id`),
  ADD CONSTRAINT `fk_lr_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `lesson_content_tbl`
--
ALTER TABLE `lesson_content_tbl`
  ADD CONSTRAINT `fk_lc_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`);

--
-- Constraints for table `lesson_recommendations_tbl`
--
ALTER TABLE `lesson_recommendations_tbl`
  ADD CONSTRAINT `fk_lrec_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_lrec_module_id` FOREIGN KEY (`module_id`) REFERENCES `modules_tbl` (`module_id`),
  ADD CONSTRAINT `fk_lrec_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`);

--
-- Constraints for table `login_logs_tbl`
--
ALTER TABLE `login_logs_tbl`
  ADD CONSTRAINT `fk_login_logs_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `mcq_activity_sessions_tbl`
--
ALTER TABLE `mcq_activity_sessions_tbl`
  ADD CONSTRAINT `fk_mcqsess_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_mcqsess_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `mcq_learner_answers_tbl`
--
ALTER TABLE `mcq_learner_answers_tbl`
  ADD CONSTRAINT `fk_mcqans_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_mcqans_option_id` FOREIGN KEY (`option_id`) REFERENCES `mcq_options_tbl` (`option_id`),
  ADD CONSTRAINT `fk_mcqans_question_id` FOREIGN KEY (`q_id`) REFERENCES `mcq_questions_tbl` (`q_id`),
  ADD CONSTRAINT `fk_mcqans_recommendation_id` FOREIGN KEY (`recommendation_id`) REFERENCES `lesson_recommendations_tbl` (`recommendation_id`);

--
-- Constraints for table `mcq_options_tbl`
--
ALTER TABLE `mcq_options_tbl`
  ADD CONSTRAINT `fk_mcq_options_q_id` FOREIGN KEY (`q_id`) REFERENCES `mcq_questions_tbl` (`q_id`);

--
-- Constraints for table `mcq_questions_tbl`
--
ALTER TABLE `mcq_questions_tbl`
  ADD CONSTRAINT `fk_mcq_questions_la_id` FOREIGN KEY (`la_id`) REFERENCES `learning_activities_tbl` (`la_id`);

--
-- Constraints for table `modules_tbl`
--
ALTER TABLE `modules_tbl`
  ADD CONSTRAINT `fk_modules_category_id` FOREIGN KEY (`cat_id`) REFERENCES `category_tbl` (`cat_id`),
  ADD CONSTRAINT `fk_modules_status_id` FOREIGN KEY (`module_stats_id`) REFERENCES `module_stats_tbl` (`module_stats_id`);

--
-- Constraints for table `notifications_tbl`
--
ALTER TABLE `notifications_tbl`
  ADD CONSTRAINT `fk_notif_acc` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`) ON DELETE CASCADE;

--
-- Constraints for table `profile_tbl`
--
ALTER TABLE `profile_tbl`
  ADD CONSTRAINT `fk_profile_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `sandbox_runs_tbl`
--
ALTER TABLE `sandbox_runs_tbl`
  ADD CONSTRAINT `fk_runs_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_runs_snippet_id` FOREIGN KEY (`snippet_id`) REFERENCES `sandbox_snippets_tbl` (`snippet_id`) ON DELETE SET NULL;

--
-- Constraints for table `sandbox_snippets_tbl`
--
ALTER TABLE `sandbox_snippets_tbl`
  ADD CONSTRAINT `fk_snippets_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `test_cases_tbl`
--
ALTER TABLE `test_cases_tbl`
  ADD CONSTRAINT `fk_test_cases_exercise_id` FOREIGN KEY (`exercise_id`) REFERENCES `coding_exercises_tbl` (`exercise_id`);

--
-- Constraints for table `title_history_tbl`
--
ALTER TABLE `title_history_tbl`
  ADD CONSTRAINT `fk_th_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `account_tbl` (`acc_id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `video_tutorials_tbl`
--
ALTER TABLE `video_tutorials_tbl`
  ADD CONSTRAINT `fk_vt_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
