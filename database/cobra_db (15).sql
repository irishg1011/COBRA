-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 18, 2026 at 09:28 AM
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
('ACC00001', 'gregorioirish1111@gmail.com', 'aydatkam', 'scrypt:32768:8:1$q3mR6E8pnyRGMU5K$67e6b333b12078dd07fb530dcf3415bf783d73fa67c08e8e902d766c32287b5e51cf2b41b9f4ac118d5c559729e98c9bc1a30676341a63d84133c15a97d8ba2c', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-17 02:03:10'),
('ACC00002', 'mijoynicole.cdsga@gmail.com', 'nikol', 'scrypt:32768:8:1$mwyd9c3Y67xLIEGm$8469035001056f301321122ed4873b5dcee4daba7e3d313e8503479fcc0983b0f421a27b52e3b92105d8d37988b3506efdfd9d0e96e164a93a508e18a3cfaf17', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00003', 'espchristiangold@gmail.com', 'golfd123', 'scrypt:32768:8:1$F8uxYEYjJ298xDAe$67ba5a80ecaf090633f9c8b87db5b488947330f2cfdb5676282e026241c1faccaa34be02a993d040ee422deaef7b7ff4ab8fd7b9faa8a99eab1225db878b5dbf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-18 13:28:55'),
('ACC00004', 'danzenaquino@gmail.com', 'danzen123', 'scrypt:32768:8:1$rt1ybreR60SN0xiy$71bf5e05d4bfe44995bf97febaea36c1c55c018bcc01896c5182c51d07d94a56483ba1a7f0445c8e7c055022b6fe3432f2c43d61ade861830cd639f031a156e0', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00005', 'gregorioirish1971@gmail.com', 'aydatkam8', 'scrypt:32768:8:1$d5Q3wGF1VQ7iOzTk$22d973c79f05c86174443c84b3f54b91d90bd28dd9c4a53fb5667c54e316541b05eacd8c34047cf761968a1caa4f3deadb1917a988d9cafc540c9d7d5a42adcf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-09-18 13:30:40'),
('ACC00006', 'mijoynicole@gmail.com', 'taleng', 'scrypt:32768:8:1$mJfMSpNbOm3nmNuQ$6a4ffbcac742f69fa860986a60b65ceecdd70a100870f49a69bdcf3c8dc6c7cd200bf2eca3a1147efb565b0ece407fc66bbb969b43da368f40de06df0fa50e98', 2, 'Inactive', 1, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-07-30 17:09:11'),
('LR2607300001', 'emmanuelspicer123@gmail.com', 'spicer', 'scrypt:32768:8:1$jZJZqv2Vp709B1ih$10fc3def14498aa07ad23e71ada0bf1b598bf78600a0b8d1efffb4321152fe0a254cfac3079de3464840680d2987696cf0f45f0bc9d14c97007069d422769dca', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 08:48:22', '2026-09-09 14:06:15'),
('LR2607300002', 'gmark7688@gmail.com', 'markgil', 'scrypt:32768:8:1$aVlZNwBE6RAC9DrM$93eacd71c16d3528717ec247150a2721952b77114aa27b526c2e5230a9708ab7a3f898b213b7f8ffc2e8407e1304365a114925708f4e0eb92246aecb307f6f5b', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 08:58:41', '2026-08-06 14:05:53'),
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
(4814, 'ACC00005', '2f7e56261d308382b2af015b6a870db56450b86bf1a874ab3fba96a14d8b6dc1', '2026-09-18 05:30:40', '2026-09-18 05:30:40');

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
-- Table structure for table `category_tbl`
--

CREATE TABLE `category_tbl` (
  `cat_id` int(10) NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `category_tbl`
--

INSERT INTO `category_tbl` (`cat_id`, `category_name`, `is_archived`) VALUES
(2, 'Chapter 1', 0),
(3, 'Chapter 2', 1),
(4, 'Getting started', 0),
(5, 'Variables and simple data types', 0);

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
  `is_archived` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `coding_exercises_tbl`
--

INSERT INTO `coding_exercises_tbl` (`exercise_id`, `exercise_title`, `resource_id`, `points`, `exercise_stats_id`, `instruction`, `situation`, `problem_question`, `clue`, `expected_answer`, `correct_feedback`, `uploaded_by`, `created_at`, `updated_at`, `is_archived`) VALUES
(1, 'Hi', 3, 10, 2, 'Ssssssssssssssssssssssssssssssssss', 'Ssssssssssssssssssssssssssssssssss', 'Ssssssssssssssssssssssssssss', 'Sssssssssssssssssssssssssssssss', 'sdsdsdsds', 'Sdsdsdsdsdsdsd', 'ACC00001', '2026-08-28 14:55:46', '2026-08-28 14:58:27', 0),
(2, 'Greet the user', 5, 10, 2, 'Read the situation and problem below carefully. write your code in the editor, then click run to test it before submitting.', 'You\'ve learned that print() displays text on the screen. now it\'s time to make your program interactive by asking the user for information.', 'Write a program that asks the user for their name using input(), then prints a greeting in the exact format: hello, <name>!', 'Use input() to store what the user types into a variable, then use an f-string or string concatenation with print() to build the greeting.', 'name = input()\r\nprint(f\"Hello, {name}!\")', 'Nice work! you used input() to grab the user\'s name and print() to greet them back.', 'ACC00001', '2026-09-16 21:26:16', '2026-09-16 21:26:19', 0);

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
(11, 'ACC00005', 2, '# Write your code here\n', 0, 2, 11, 'incorrect', 'self', NULL, '0 of 2 test cases passed. Review your code and try again.', '2026-09-16 21:56:25');

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
  `answered_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fill_blanks_tbl`
--

CREATE TABLE `fill_blanks_tbl` (
  `fib_id` int(10) NOT NULL,
  `la_id` int(10) NOT NULL,
  `content` text NOT NULL,
  `correct_answer` varchar(255) NOT NULL,
  `correct_feedback` varchar(500) DEFAULT NULL,
  `incorrect_feedback` varchar(500) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `fill_blanks_tbl`
--

INSERT INTO `fill_blanks_tbl` (`fib_id`, `la_id`, `content`, `correct_answer`, `correct_feedback`, `incorrect_feedback`) VALUES
(1, 3, 'Sino ____ tama', 'Ang', 'Okay edi wow', 'La na mali ka'),
(2, 4, 'Okokokkok ----------------------', 'Ok', 'Okokok', 'Kokoko');

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
(2, 7, 'Hello what', 'Hello world', 'Nice', 'Wrong');

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
  `answered_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(7, 'ACC00005', 2, 'completed', 2, '2026-09-16 21:38:11'),
(8, 'ACC00005', 3, 'completed', 0, '2026-09-16 21:38:18');

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

--
-- Dumping data for table `learner_exercise_progress_tbl`
--

INSERT INTO `learner_exercise_progress_tbl` (`progress_id`, `acc_id`, `exercise_id`, `status`, `completed_at`) VALUES
(1, 'ACC00005', 2, 'completed', '2026-09-16 21:41:10');

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
(1, 'ACC00005', 3, 'completed', '2026-09-08 18:50:15.00000', NULL, NULL, '2026-09-08 18:53:33'),
(2, 'ACC00001', 3, 'completed', '2026-09-08 21:11:01.00000', NULL, NULL, '2026-09-08 21:28:12'),
(4, 'ACC00005', 6, 'completed', '2026-09-08 21:49:21.00000', NULL, NULL, '2026-09-09 10:59:08'),
(6, 'ACC00001', 6, 'completed', '2026-09-08 21:58:49.00000', NULL, NULL, '2026-09-09 00:46:15'),
(7, 'ACC00001', 10, 'completed', '2026-09-08 21:59:03.00000', NULL, NULL, '2026-09-08 21:59:05'),
(8, 'ACC00001', 11, 'completed', '2026-09-08 21:59:10.00000', NULL, NULL, '2026-09-08 21:59:11'),
(9, 'ACC00001', 7, 'completed', '2026-09-08 21:59:22.00000', NULL, NULL, '2026-09-08 21:59:24'),
(10, 'ACC00001', 8, 'completed', '2026-09-08 21:59:31.00000', NULL, NULL, '2026-09-08 21:59:32'),
(11, 'ACC00001', 9, 'completed', '2026-09-08 21:59:39.00000', NULL, NULL, '2026-09-08 21:59:43'),
(13, 'ACC00005', 5, 'completed', '2026-09-16 21:37:28.00000', '2026-09-16 21:37:55', '2026-09-16 21:38:00', '2026-09-16 21:41:56'),
(14, 'ACC00003', 5, 'in_progress', '2026-09-18 13:29:12.00000', NULL, NULL, '0000-00-00 00:00:00');

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
(2, 'Published');

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
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learning_activities_tbl`
--

INSERT INTO `learning_activities_tbl` (`la_id`, `activity_title`, `cat_id`, `module_id`, `resource_id`, `activity_type_id`, `points`, `la_stats_id`, `uploaded_by`, `created_at`, `updated_at`) VALUES
(1, 'Hello world', 5, 5, 3, 1, 2, 2, 'ACC00001', '2026-08-28 14:47:53', '2026-09-09 00:28:01'),
(2, 'Act 1 l1m1c1', 2, 5, 5, 1, 2, 2, 'ACC00001', '2026-09-09 00:29:23', '2026-09-09 00:29:30'),
(3, 'Act 2 l1m1c1', 2, 5, 5, 2, 1, 2, 'ACC00001', '2026-09-09 00:30:33', '2026-09-09 00:30:40'),
(4, 'Act 1 l1m1c2', 4, 4, 7, 2, 1, 2, 'ACC00001', '2026-09-09 00:31:50', '2026-09-09 00:33:48'),
(5, 'Act 1 l2m1c2', 4, 4, 8, 3, 1, 2, 'ACC00001', '2026-09-09 00:32:52', '2026-09-09 00:33:46'),
(6, 'Act 1 l3m1c2', 4, 4, 9, 1, 1, 2, 'ACC00001', '2026-09-09 00:33:37', '2026-09-09 00:33:42'),
(7, 'Act 1 l1m1c3', 5, 6, 3, 3, 1, 2, 'ACC00001', '2026-09-09 00:34:48', '2026-09-09 00:34:54'),
(8, 'Act 1 l1m2c3', 5, 6, 4, 1, 1, 2, 'ACC00001', '2026-09-09 00:35:47', '2026-09-09 00:35:52');

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
(2, 'Published');

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
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `learning_resources_tbl`
--

INSERT INTO `learning_resources_tbl` (`resource_id`, `resource_title`, `resource_type_id`, `cat_id`, `module_id`, `uploaded_by`, `lr_stats_id`, `created_at`, `updated_at`) VALUES
(1, '12345', 1, 2, 1, 'ACC00001', 1, '2026-08-21 13:37:07', '2026-09-11 17:16:58'),
(2, 'Mod 2.2.1', 1, 3, 2, 'ACC00001', 1, '2026-08-21 13:49:20', '2026-08-28 13:35:44'),
(3, 'Run hello world.py.', 1, 5, 6, 'ACC00001', 1, '2026-08-28 13:52:46', '2026-09-08 21:32:11'),
(4, 'Lesson 2 sample', 1, 5, 6, 'ACC00001', 2, '2026-09-08 21:39:28', '2026-09-08 21:57:53'),
(5, 'Lesson 1 sample for ch1', 1, 2, 5, 'ACC00001', 2, '2026-09-08 21:44:18', '2026-09-08 21:57:49'),
(6, 'Lesson 2 saple for ch1', 1, 2, 5, 'ACC00001', 2, '2026-09-08 21:45:05', '2026-09-08 21:57:46'),
(7, 'Ch2 lesson ex1m1', 1, 4, 4, 'ACC00001', 2, '2026-09-08 21:46:09', '2026-09-08 21:57:42'),
(8, 'Cch2 l2 m1', 1, 4, 4, 'ACC00001', 1, '2026-09-08 21:46:37', '2026-09-11 17:16:37'),
(9, 'Ch2 l3', 1, 4, 4, 'ACC00001', 1, '2026-09-08 21:47:13', '2026-09-11 17:16:43'),
(10, 'Ch2 m2l1', 1, 4, 3, 'ACC00001', 1, '2026-09-08 21:47:37', '2026-09-11 17:16:47'),
(11, 'Ch2l2m2', 1, 4, 3, 'ACC00001', 1, '2026-09-08 21:48:10', '2026-09-11 17:16:53'),
(12, 'Adalovelace', 1, 4, 4, 'LR2607300001', 1, '2026-09-09 07:28:36', '2026-09-09 07:28:36');

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
(1, 1, '<div>wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww</div>'),
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
(12, 12, '<div>aandjkasnkdjasnkdjnakjdaksjnda</div>');

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
(211, 'ACC00005', '127.0.0.1', 'Success', '2026-09-18 05:30:40');

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
  `answered_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(1, 1, 'A', 'Hello', 1, 'Hello'),
(2, 1, 'B', 'Hello', 0, 'Hello'),
(3, 1, 'C', 'Hello', 0, 'Hello'),
(4, 1, 'D', 'Hello', 0, 'Hello'),
(5, 2, 'A', 'Hello', 1, 'Hello'),
(6, 2, 'B', 'Hello', 0, 'Hello'),
(7, 2, 'C', 'Hello', 0, 'Hello'),
(8, 2, 'D', 'Hello', 0, 'Hello'),
(13, 5, 'A', 'Aba ewan', 1, 'Wow tama'),
(14, 5, 'B', 'Idk', 0, 'Maliii ka po'),
(15, 6, 'A', 'Aba ewan', 0, 'Not nice'),
(16, 6, 'B', 'Idk', 1, 'Nice'),
(17, 7, 'A', 'A', 1, 'B'),
(18, 7, 'B', 'B', 0, 'A'),
(19, 8, 'A', 'Ba', 1, 'Is'),
(20, 8, 'B', 'Liw', 0, 'Si');

-- --------------------------------------------------------

--
-- Table structure for table `mcq_questions_tbl`
--

CREATE TABLE `mcq_questions_tbl` (
  `q_id` int(10) NOT NULL,
  `la_id` int(10) NOT NULL,
  `question_text` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `mcq_questions_tbl`
--

INSERT INTO `mcq_questions_tbl` (`q_id`, `la_id`, `question_text`) VALUES
(1, 1, 'Hiiiii'),
(2, 1, 'Hiiiii'),
(5, 2, 'Ano ang pangalan mo'),
(6, 2, 'Ano ang pangalan ko'),
(7, 6, 'Aasas'),
(8, 8, 'Ba is liw');

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
  `is_archived` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `modules_tbl`
--

INSERT INTO `modules_tbl` (`module_id`, `module_name`, `description`, `cat_id`, `module_stats_id`, `created_at`, `updated_at`, `is_archived`) VALUES
(1, 'Module 1', 'Mod1 desc', 2, 2, '2026-08-18 19:19:55', '2026-09-08 21:42:46', 1),
(2, 'Module 2.1', 'Desc', 3, 2, '2026-08-21 13:46:00', '2026-09-08 21:42:31', 0),
(3, 'Setting up your programming environment', 'This gets your workspace totally ready for action.', 4, 1, '2026-08-28 13:16:29', '2026-08-31 22:34:53', 0),
(4, 'Python on different operating systems', 'No matter what kind of computer you\'re using, this part walks you through the specific installation steps.', 4, 1, '2026-08-28 13:34:46', '2026-08-31 22:34:41', 0),
(5, 'What really happens when you run hello_world.Py', 'This pulls back the curtain to show you the behind-the-scenes magic.', 2, 1, '2026-08-28 13:38:00', '2026-08-31 22:27:33', 0),
(6, 'Variables', 'Think of these as labeled boxes for your data.', 5, 1, '2026-08-28 13:38:33', '2026-08-31 22:34:45', 0);

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
(1, 'Published');

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
(5, 'ACC00003', '2026-09-18 05:28:07');

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
  `snippet_id` int(10) NOT NULL,
  `code_content` longtext NOT NULL,
  `output` longtext NOT NULL,
  `status` varchar(20) NOT NULL,
  `run_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sandbox_runs_tbl`
--

INSERT INTO `sandbox_runs_tbl` (`run_id`, `acc_id`, `snippet_id`, `code_content`, `output`, `status`, `run_at`) VALUES
(1, 'ACC00005', 5, 'print(\"Hello Python World!\")\nprint(\"Hi Python!\")', 'Hello Python World!\nHi Python!', 'success', '2026-09-09 19:06:33'),
(2, 'ACC00005', 6, 'name = input(\"name: \")\nprint(\"hello, \" + name)', 'name: irish gregorio\nhello, irish gregorio', 'success', '2026-09-09 20:46:55');

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
(8, 'ACC00005', 'print(\"HI\")', 'print(\"HI\")', '2026-09-11 13:13:13', '0000-00-00 00:00:00');

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
(7, 1, 1, '123', 'qq'),
(8, 1, 2, 'aa', 'aa'),
(9, 2, 1, 'Alice', 'Hello, Alice!'),
(10, 2, 2, 'Bob', 'Hello, Bob!');

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
  `updated_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `video_tutorials_tbl`
--

INSERT INTO `video_tutorials_tbl` (`video_tutorial_id`, `resource_id`, `file_path`, `file_size`, `video_title`, `description`, `video_stats_id`, `uploaded_by`, `created_at`, `updated_at`) VALUES
(1, 5, 'uploads/videos/6.1.1-afc06022bd04.mp4', '57881122', 'Python', '<div style=\"text-align: left;\"><span style=\"font-family: inherit;\"><i style=\"\"><u style=\"\">adad</u></i></span></div>', 1, 'LR2607300001', '2026-09-09 07:12:20', '2026-09-09 07:12:20'),
(2, 7, 'uploads/videos/6.2.1-cbd39bd37a35.mp4', '61759694', 'Example', 'sample video', 2, 'LR2607300001', '2026-09-09 07:23:37', '2026-09-09 08:06:46'),
(3, 5, 'uploads/videos/6.2.4-68f084264c1e.mp4', '211235970', 'Sample video', '<b><i><u>sample video</u></i></b>', 2, 'LR2607300001', '2026-09-09 10:57:06', '2026-09-09 10:57:06'),
(4, 5, 'Sg4GMVMdOPo', NULL, 'Bro code sample', 'brobro', 2, 'ACC00001', '2026-09-09 22:37:42', '2026-09-09 22:37:42');

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
-- Indexes for table `activity_types_tbl`
--
ALTER TABLE `activity_types_tbl`
  ADD PRIMARY KEY (`activity_type_id`),
  ADD UNIQUE KEY `activity_type_name` (`activity_type_name`);

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
  ADD KEY `fk_fibans_recommendation_id` (`recommendation_id`);

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
-- Indexes for table `flashcard_learner_answers_tbl`
--
ALTER TABLE `flashcard_learner_answers_tbl`
  ADD PRIMARY KEY (`answer_id`),
  ADD KEY `fk_fcans_account_id` (`acc_id`),
  ADD KEY `fk_fcans_flashcard_id` (`flashcard_id`),
  ADD KEY `fk_fcans_recommendation_id` (`recommendation_id`);

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
-- Indexes for table `learner_exercise_progress_tbl`
--
ALTER TABLE `learner_exercise_progress_tbl`
  ADD PRIMARY KEY (`progress_id`),
  ADD KEY `fk_exercise_progress_account_id` (`acc_id`),
  ADD KEY `fk_exercise_progress_exercise_id` (`exercise_id`);

--
-- Indexes for table `learner_resource_progress_tbl`
--
ALTER TABLE `learner_resource_progress_tbl`
  ADD PRIMARY KEY (`progress_id`),
  ADD KEY `fk_resource_progress_account_id` (`acc_id`),
  ADD KEY `fk_resource_progress_resource_id` (`resource_id`);

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
-- Indexes for table `mcq_learner_answers_tbl`
--
ALTER TABLE `mcq_learner_answers_tbl`
  ADD PRIMARY KEY (`answer_id`),
  ADD KEY `fk_mcqans_account_id` (`acc_id`),
  ADD KEY `fk_mcqans_question_id` (`q_id`),
  ADD KEY `fk_mcqans_option_id` (`option_id`),
  ADD KEY `fk_mcqans_recommendation_id` (`recommendation_id`);

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
  ADD KEY `fk_runs_snippet_id` (`snippet_id`);

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
  MODIFY `session_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4815;

--
-- AUTO_INCREMENT for table `activity_types_tbl`
--
ALTER TABLE `activity_types_tbl`
  MODIFY `activity_type_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `category_tbl`
--
ALTER TABLE `category_tbl`
  MODIFY `cat_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `coding_exercises_tbl`
--
ALTER TABLE `coding_exercises_tbl`
  MODIFY `exercise_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `exercise_submissions_tbl`
--
ALTER TABLE `exercise_submissions_tbl`
  MODIFY `submission_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `fib_learner_answers_tbl`
--
ALTER TABLE `fib_learner_answers_tbl`
  MODIFY `answer_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fill_blanks_tbl`
--
ALTER TABLE `fill_blanks_tbl`
  MODIFY `fib_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `flashcards_tbl`
--
ALTER TABLE `flashcards_tbl`
  MODIFY `flashcard_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `flashcard_learner_answers_tbl`
--
ALTER TABLE `flashcard_learner_answers_tbl`
  MODIFY `answer_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `gender_tbl`
--
ALTER TABLE `gender_tbl`
  MODIFY `gender_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `learner_activity_progress_tbl`
--
ALTER TABLE `learner_activity_progress_tbl`
  MODIFY `progress_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `learner_exercise_progress_tbl`
--
ALTER TABLE `learner_exercise_progress_tbl`
  MODIFY `progress_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `learner_resource_progress_tbl`
--
ALTER TABLE `learner_resource_progress_tbl`
  MODIFY `progress_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

--
-- AUTO_INCREMENT for table `learning_activities_stats_tbl`
--
ALTER TABLE `learning_activities_stats_tbl`
  MODIFY `la_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `learning_activities_tbl`
--
ALTER TABLE `learning_activities_tbl`
  MODIFY `la_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `learning_resources_stats_tbl`
--
ALTER TABLE `learning_resources_stats_tbl`
  MODIFY `lr_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `learning_resources_tbl`
--
ALTER TABLE `learning_resources_tbl`
  MODIFY `resource_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `lesson_content_tbl`
--
ALTER TABLE `lesson_content_tbl`
  MODIFY `lesson_content_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT for table `lesson_recommendations_tbl`
--
ALTER TABLE `lesson_recommendations_tbl`
  MODIFY `recommendation_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lockout_logs_tbl`
--
ALTER TABLE `lockout_logs_tbl`
  MODIFY `lockout_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `login_logs_tbl`
--
ALTER TABLE `login_logs_tbl`
  MODIFY `log_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=212;

--
-- AUTO_INCREMENT for table `mcq_learner_answers_tbl`
--
ALTER TABLE `mcq_learner_answers_tbl`
  MODIFY `answer_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mcq_options_tbl`
--
ALTER TABLE `mcq_options_tbl`
  MODIFY `option_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT for table `mcq_questions_tbl`
--
ALTER TABLE `mcq_questions_tbl`
  MODIFY `q_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `modules_tbl`
--
ALTER TABLE `modules_tbl`
  MODIFY `module_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT for table `module_stats_tbl`
--
ALTER TABLE `module_stats_tbl`
  MODIFY `module_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `password_reset_logs_tbl`
--
ALTER TABLE `password_reset_logs_tbl`
  MODIFY `reset_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

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
  MODIFY `run_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `sandbox_snippets_tbl`
--
ALTER TABLE `sandbox_snippets_tbl`
  MODIFY `snippet_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `test_cases_tbl`
--
ALTER TABLE `test_cases_tbl`
  MODIFY `test_case_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `usertype_tbl`
--
ALTER TABLE `usertype_tbl`
  MODIFY `ut_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `video_tutorials_tbl`
--
ALTER TABLE `video_tutorials_tbl`
  MODIFY `video_tutorial_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `account_tbl`
--
ALTER TABLE `account_tbl`
  ADD CONSTRAINT `fk_account_usertype` FOREIGN KEY (`u_type`) REFERENCES `usertype_tbl` (`ut_id`);

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
-- Constraints for table `learner_exercise_progress_tbl`
--
ALTER TABLE `learner_exercise_progress_tbl`
  ADD CONSTRAINT `fk_exercise_progress_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_exercise_progress_exercise_id` FOREIGN KEY (`exercise_id`) REFERENCES `coding_exercises_tbl` (`exercise_id`);

--
-- Constraints for table `learner_resource_progress_tbl`
--
ALTER TABLE `learner_resource_progress_tbl`
  ADD CONSTRAINT `fk_resource_progress_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_resource_progress_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`);

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
-- Constraints for table `profile_tbl`
--
ALTER TABLE `profile_tbl`
  ADD CONSTRAINT `fk_profile_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

--
-- Constraints for table `sandbox_runs_tbl`
--
ALTER TABLE `sandbox_runs_tbl`
  ADD CONSTRAINT `fk_runs_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`),
  ADD CONSTRAINT `fk_runs_snippet_id` FOREIGN KEY (`snippet_id`) REFERENCES `sandbox_snippets_tbl` (`snippet_id`);

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
-- Constraints for table `video_tutorials_tbl`
--
ALTER TABLE `video_tutorials_tbl`
  ADD CONSTRAINT `fk_vt_resource_id` FOREIGN KEY (`resource_id`) REFERENCES `learning_resources_tbl` (`resource_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
