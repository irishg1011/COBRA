-- ============================================================================
-- feat/skippable-chapter: Skippable chapters. MariaDB (XAMPP / HeidiSQL).
-- Safe to run more than once. Optional - the app adds these by itself when
-- it starts (server/chapter_skips.py).
--
--   category_tbl.is_skippable  - the "Skippable" switch in Edit Chapter (0 = off)
--   category_tbl.skip_question - the question learners see (NULL = the default
--                                "Do you already have Python installed on your computer?")
--   learner_chapter_skips_tbl  - one row per learner per chapter they skipped.
--                                A skipped chapter opens the next chapter but is
--                                never counted as completed.
-- ============================================================================
ALTER TABLE `category_tbl`
  ADD COLUMN IF NOT EXISTS `is_skippable`  TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `skip_question` VARCHAR(255) DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `learner_chapter_skips_tbl` (
  `skip_id`    INT(10)     NOT NULL AUTO_INCREMENT,
  `acc_id`     VARCHAR(15) NOT NULL,                   -- the learner
  `cat_id`     INT(10)     NOT NULL,                   -- the chapter they skipped
  `skipped_at` DATETIME    NOT NULL,
  PRIMARY KEY (`skip_id`),
  UNIQUE KEY `uq_chapter_skip` (`acc_id`, `cat_id`),
  KEY `idx_chapter_skip_cat` (`cat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- To make "Getting started" skippable right away (instead of using the switch
-- in Manage Course / Publishing > Edit Chapter), uncomment:
-- UPDATE `category_tbl` SET `is_skippable` = 1 WHERE `category_name` = 'Getting started' AND `is_archived` = 0;
