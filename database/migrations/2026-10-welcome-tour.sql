-- ============================================================================
-- feat/welcome-tour: the first-time user tour. MariaDB (XAMPP / HeidiSQL).
-- Safe to run more than once. Optional - the app creates this table by itself
-- when it starts (server/learner_tour.py).
-- One row per learner per tour part they finished or skipped, so each part
-- shows only once (on any device). Parts: welcome, lesson, game, sandbox.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `learner_tour_tbl` (
  `tour_id`    INT(10)     NOT NULL AUTO_INCREMENT,
  `acc_id`     VARCHAR(15) NOT NULL,                   -- the learner
  `tour_key`   VARCHAR(20) NOT NULL,                   -- welcome / lesson / game / sandbox
  `status`     VARCHAR(10) NOT NULL,                   -- finished / skipped
  `updated_at` DATETIME    NOT NULL,
  PRIMARY KEY (`tour_id`),
  UNIQUE KEY `uq_learner_tour` (`acc_id`, `tour_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- To show the tour again to everyone (e.g. before a new testing session):
-- DELETE FROM `learner_tour_tbl`;
