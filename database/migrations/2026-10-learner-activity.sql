-- ============================================================================
-- feat/learner-activity: "Doing now" for learners (Who's online + Learner
-- Progress). MariaDB (XAMPP / HeidiSQL). Safe to run more than once. Optional -
-- the app creates this table by itself on the first report.
-- One row per learner (their latest place). Never code or answers.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `learner_where_tbl` (
  `acc_id`      VARCHAR(15) NOT NULL,                  -- the learner
  `page`        VARCHAR(20) NOT NULL,                  -- dashboard / learning_map / lessons / lesson / sandbox ...
  `resource_id` INT(10)     DEFAULT NULL,              -- the lesson (lesson pages only)
  `step`        VARCHAR(12) DEFAULT NULL,              -- video / content / activities / exercise / summary
  `game`        TINYINT(1)  DEFAULT NULL,              -- 1 Multiple Choice, 2 Fill in the Blanks, 3 Flashcards
  `game_state`  VARCHAR(12) DEFAULT NULL,              -- playing / paused / out_of_lives
  `q_num`       SMALLINT    DEFAULT NULL,              -- question N ...
  `q_total`     SMALLINT    DEFAULT NULL,              -- ... of M
  `lives`       SMALLINT    DEFAULT NULL,              -- lives left (regular + bonus)
  `tries`       SMALLINT    DEFAULT NULL,              -- coding exercise tries
  `since_at`    DATETIME    NOT NULL,                  -- got to this place (page / step / game / state)
  `updated_at`  DATETIME    NOT NULL,                  -- last report (rows older than a day are deleted)
  PRIMARY KEY (`acc_id`),
  KEY `idx_where_updated` (`updated_at`),
  CONSTRAINT `fk_where_acc` FOREIGN KEY (`acc_id`) REFERENCES `account_tbl` (`acc_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
