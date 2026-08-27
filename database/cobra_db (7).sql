-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Aug 19, 2026 at 06:50 AM
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
('ACC00001', 'gregorioirish1111@gmail.com', 'aydatkam', 'scrypt:32768:8:1$q3mR6E8pnyRGMU5K$67e6b333b12078dd07fb530dcf3415bf783d73fa67c08e8e902d766c32287b5e51cf2b41b9f4ac118d5c559729e98c9bc1a30676341a63d84133c15a97d8ba2c', 1, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-18 18:01:18'),
('ACC00002', 'mijoynicole.cdsga@gmail.com', 'nikol', 'scrypt:32768:8:1$mwyd9c3Y67xLIEGm$8469035001056f301321122ed4873b5dcee4daba7e3d313e8503479fcc0983b0f421a27b52e3b92105d8d37988b3506efdfd9d0e96e164a93a508e18a3cfaf17', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00003', 'espchristiangold@gmail.com', 'golfd123', 'scrypt:32768:8:1$IsEtD5n42e53y41W$b389c3d54171ff36e399645912c01927c47253cf7901b50fa58c1df0f01918f46c61cd9650e99b3fb32afb090a87f322152481bbfe7161734789739a065a2093', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00004', 'danzenaquino@gmail.com', 'danzen123', 'scrypt:32768:8:1$rt1ybreR60SN0xiy$71bf5e05d4bfe44995bf97febaea36c1c55c018bcc01896c5182c51d07d94a56483ba1a7f0445c8e7c055022b6fe3432f2c43d61ade861830cd639f031a156e0', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-02 20:43:06'),
('ACC00005', 'gregorioirish1971@gmail.com', 'aydatkam8', 'scrypt:32768:8:1$sWvu1gFZHUo9tXZy$cd5e213093e8608b12a285c7618536d0434221e3a499839edc6264622697ada5975978e7f1889fdb379d3199ee1a20502b0900b4c6c1ae0f5c9ac60bbc86a4cf', 2, 'Active', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-08-07 17:03:23'),
('ACC00006', 'mijoynicole@gmail.com', 'taleng', 'scrypt:32768:8:1$mJfMSpNbOm3nmNuQ$6a4ffbcac742f69fa860986a60b65ceecdd70a100870f49a69bdcf3c8dc6c7cd200bf2eca3a1147efb565b0ece407fc66bbb969b43da368f40de06df0fa50e98', 2, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 06:10:13', '2026-07-30 17:09:11'),
('LR2607300001', 'emmanuelspicer123@gmail.com', 'spicer', 'scrypt:32768:8:1$jZJZqv2Vp709B1ih$10fc3def14498aa07ad23e71ada0bf1b598bf78600a0b8d1efffb4321152fe0a254cfac3079de3464840680d2987696cf0f45f0bc9d14c97007069d422769dca', 1, 'Inactive', 0, 0, NULL, NULL, '2026-07-30 08:48:22', '2026-08-06 15:30:12'),
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

-- --------------------------------------------------------

--
-- Table structure for table `activity_types_tbl`
--

CREATE TABLE `activity_types_tbl` (
  `activity_type_id` int(10) NOT NULL,
  `activity_type_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `category_tbl`
--

CREATE TABLE `category_tbl` (
  `cat_id` int(10) NOT NULL,
  `category_name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `category_tbl`
--

INSERT INTO `category_tbl` (`cat_id`, `category_name`) VALUES
(2, 'chapter 1');

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
  `updated_at` datetime DEFAULT NULL
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
-- Table structure for table `learning_activities_stats_tbl`
--

CREATE TABLE `learning_activities_stats_tbl` (
  `la_stats_id` int(10) NOT NULL,
  `la_stats_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

-- --------------------------------------------------------

--
-- Table structure for table `learning_resources_stats_tbl`
--

CREATE TABLE `learning_resources_stats_tbl` (
  `lr_stats_id` int(10) NOT NULL,
  `lr_stats_name` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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

-- --------------------------------------------------------

--
-- Table structure for table `lesson_content_tbl`
--

CREATE TABLE `lesson_content_tbl` (
  `lesson_content_id` int(10) NOT NULL,
  `resource_id` int(10) NOT NULL,
  `content_body` longtext DEFAULT NULL
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
(134, 'ACC00001', '127.0.0.1', 'Success', '2026-08-18 10:01:18');

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

-- --------------------------------------------------------

--
-- Table structure for table `mcq_questions_tbl`
--

CREATE TABLE `mcq_questions_tbl` (
  `q_id` int(10) NOT NULL,
  `la_id` int(10) NOT NULL,
  `question_text` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
(1, 'module 1', 'mod1 desc', 2, 2, '2026-08-18 19:19:55', '2026-08-19 01:51:39', 0);

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
(3, 'ACC00001', '2026-08-16 14:40:49');

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
  `file_size` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
-- Indexes for table `gender_tbl`
--
ALTER TABLE `gender_tbl`
  ADD PRIMARY KEY (`gender_id`);

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
  MODIFY `session_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2231;

--
-- AUTO_INCREMENT for table `activity_types_tbl`
--
ALTER TABLE `activity_types_tbl`
  MODIFY `activity_type_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `category_tbl`
--
ALTER TABLE `category_tbl`
  MODIFY `cat_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `coding_exercises_tbl`
--
ALTER TABLE `coding_exercises_tbl`
  MODIFY `exercise_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fill_blanks_tbl`
--
ALTER TABLE `fill_blanks_tbl`
  MODIFY `fib_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `flashcards_tbl`
--
ALTER TABLE `flashcards_tbl`
  MODIFY `flashcard_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `gender_tbl`
--
ALTER TABLE `gender_tbl`
  MODIFY `gender_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `learning_activities_stats_tbl`
--
ALTER TABLE `learning_activities_stats_tbl`
  MODIFY `la_stats_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `learning_activities_tbl`
--
ALTER TABLE `learning_activities_tbl`
  MODIFY `la_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `learning_resources_stats_tbl`
--
ALTER TABLE `learning_resources_stats_tbl`
  MODIFY `lr_stats_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `learning_resources_tbl`
--
ALTER TABLE `learning_resources_tbl`
  MODIFY `resource_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lesson_content_tbl`
--
ALTER TABLE `lesson_content_tbl`
  MODIFY `lesson_content_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `lockout_logs_tbl`
--
ALTER TABLE `lockout_logs_tbl`
  MODIFY `lockout_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `login_logs_tbl`
--
ALTER TABLE `login_logs_tbl`
  MODIFY `log_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=135;

--
-- AUTO_INCREMENT for table `mcq_options_tbl`
--
ALTER TABLE `mcq_options_tbl`
  MODIFY `option_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mcq_questions_tbl`
--
ALTER TABLE `mcq_questions_tbl`
  MODIFY `q_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `modules_tbl`
--
ALTER TABLE `modules_tbl`
  MODIFY `module_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `module_stats_tbl`
--
ALTER TABLE `module_stats_tbl`
  MODIFY `module_stats_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `password_reset_logs_tbl`
--
ALTER TABLE `password_reset_logs_tbl`
  MODIFY `reset_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `profile_tbl`
--
ALTER TABLE `profile_tbl`
  MODIFY `prof_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT for table `resource_types_tbl`
--
ALTER TABLE `resource_types_tbl`
  MODIFY `resource_type_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `test_cases_tbl`
--
ALTER TABLE `test_cases_tbl`
  MODIFY `test_case_id` int(10) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `usertype_tbl`
--
ALTER TABLE `usertype_tbl`
  MODIFY `ut_id` int(10) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `video_tutorials_tbl`
--
ALTER TABLE `video_tutorials_tbl`
  MODIFY `video_tutorial_id` int(10) NOT NULL AUTO_INCREMENT;

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
-- Constraints for table `login_logs_tbl`
--
ALTER TABLE `login_logs_tbl`
  ADD CONSTRAINT `fk_login_logs_account_id` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`);

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
