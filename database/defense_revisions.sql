-- CobraByte defense revisions - database changes (Tasks 1-10)
-- Safe to run more than once. Nothing is deleted.
-- Run it on cobra_db (select cobra_db on the left in HeidiSQL first).
-- The app also creates all of this by itself the first time it runs.

USE cobra_db;

-- Task 1-6: every play and its 5 drawn questions
CREATE TABLE IF NOT EXISTS activity_plays_tbl (
    play_id INT(10) NOT NULL AUTO_INCREMENT,
    acc_id VARCHAR(15) NOT NULL,
    la_id INT(10) NOT NULL,
    play_kind VARCHAR(10) NOT NULL DEFAULT 'first',
    retake_id INT(10) DEFAULT NULL,
    status VARCHAR(20) NOT NULL,
    score INT(5) NOT NULL DEFAULT 0,
    leave_count TINYINT(3) NOT NULL DEFAULT 0,
    away_since DATETIME DEFAULT NULL,
    started_at DATETIME NOT NULL,
    paused_at DATETIME DEFAULT NULL,
    resumed_at DATETIME DEFAULT NULL,
    completed_at DATETIME DEFAULT NULL,
    PRIMARY KEY (play_id),
    KEY idx_play_acc_la (acc_id, la_id),
    KEY fk_play_la_id (la_id),
    CONSTRAINT fk_play_account_id FOREIGN KEY (acc_id) REFERENCES account_tbl (acc_id),
    CONSTRAINT fk_play_la_id FOREIGN KEY (la_id) REFERENCES learning_activities_tbl (la_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS activity_play_items_tbl (
    play_item_id INT(10) NOT NULL AUTO_INCREMENT,
    play_id INT(10) NOT NULL,
    item_id INT(10) NOT NULL,
    position INT(5) NOT NULL,
    shown_at DATETIME DEFAULT NULL,
    timer_started_at DATETIME DEFAULT NULL,
    time_used_seconds INT(10) NOT NULL DEFAULT 0,
    outcome VARCHAR(20) DEFAULT NULL,
    answered_at DATETIME DEFAULT NULL,
    PRIMARY KEY (play_item_id),
    KEY idx_play_items_play (play_id, position),
    KEY idx_play_items_item (item_id),
    CONSTRAINT fk_play_items_play FOREIGN KEY (play_id) REFERENCES activity_plays_tbl (play_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Task 6 + 10: every time a learner left a game or exercise page
CREATE TABLE IF NOT EXISTS activity_leave_logs_tbl (
    leave_id INT(10) NOT NULL AUTO_INCREMENT,
    acc_id VARCHAR(15) NOT NULL,
    context VARCHAR(20) NOT NULL DEFAULT 'game',
    la_id INT(10) DEFAULT NULL,
    exercise_id INT(10) DEFAULT NULL,
    play_id INT(10) DEFAULT NULL,
    leave_no TINYINT(3) NOT NULL DEFAULT 1,
    action VARCHAR(20) NOT NULL,
    reason VARCHAR(30) DEFAULT NULL,
    away_seconds INT(10) NOT NULL DEFAULT 0,
    left_at DATETIME NOT NULL,
    returned_at DATETIME DEFAULT NULL,
    PRIMARY KEY (leave_id),
    KEY idx_leave_acc (acc_id),
    KEY idx_leave_la (la_id),
    KEY idx_leave_exercise (exercise_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Task 5: timer durations and the leave threshold (edit these rows to change the game)
CREATE TABLE IF NOT EXISTS game_settings_tbl (
    setting_key VARCHAR(64) NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    updated_at DATETIME DEFAULT NULL,
    PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO game_settings_tbl (setting_key, setting_value, description, updated_at) VALUES
    ('timer_seconds_mcq', '60', 'Seconds per Multiple Choice question', NOW()),
    ('timer_seconds_fib', '90', 'Seconds per Fill in the Blanks item', NOW()),
    ('timer_seconds_flashcards', '60', 'Seconds per Flashcard', NOW()),
    ('timer_grace_seconds', '3', 'Extra seconds allowed for network delay on a late answer', NOW()),
    ('leave_min_seconds', '2', 'Absences shorter than this are ignored', NOW());

-- Task 2/3: link each answer row to its play (retake_id may already exist)
ALTER TABLE mcq_learner_answers_tbl ADD COLUMN IF NOT EXISTS retake_id INT(10) DEFAULT NULL;
ALTER TABLE mcq_learner_answers_tbl ADD COLUMN IF NOT EXISTS play_id INT(10) DEFAULT NULL;
ALTER TABLE mcq_learner_answers_tbl ADD INDEX IF NOT EXISTS idx_play_id (play_id);
ALTER TABLE fib_learner_answers_tbl ADD COLUMN IF NOT EXISTS retake_id INT(10) DEFAULT NULL;
ALTER TABLE fib_learner_answers_tbl ADD COLUMN IF NOT EXISTS play_id INT(10) DEFAULT NULL;
ALTER TABLE fib_learner_answers_tbl ADD INDEX IF NOT EXISTS idx_play_id (play_id);
ALTER TABLE flashcard_learner_answers_tbl ADD COLUMN IF NOT EXISTS retake_id INT(10) DEFAULT NULL;
ALTER TABLE flashcard_learner_answers_tbl ADD COLUMN IF NOT EXISTS play_id INT(10) DEFAULT NULL;
ALTER TABLE flashcard_learner_answers_tbl ADD INDEX IF NOT EXISTS idx_play_id (play_id);

-- Task 8: Fill in the Blanks console fields
ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS instruction TEXT DEFAULT NULL;
ALTER TABLE fill_blanks_tbl MODIFY instruction TEXT DEFAULT NULL;
ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS code_text TEXT DEFAULT NULL;
ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS expected_output TEXT DEFAULT NULL;
ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS hint VARCHAR(500) DEFAULT NULL;
ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS must_contain VARCHAR(255) DEFAULT NULL;

-- Task 9: Flashcards hint, Multiple Choice feedback per question
ALTER TABLE flashcards_tbl ADD COLUMN IF NOT EXISTS hint VARCHAR(500) DEFAULT NULL;
ALTER TABLE mcq_questions_tbl ADD COLUMN IF NOT EXISTS correct_feedback VARCHAR(500) DEFAULT NULL;
ALTER TABLE mcq_questions_tbl ADD COLUMN IF NOT EXISTS incorrect_feedback VARCHAR(500) DEFAULT NULL;

-- Task 10: which exercise of the lesson's pool each learner got
CREATE TABLE IF NOT EXISTS learner_exercise_draws_tbl (
    draw_id INT(10) NOT NULL AUTO_INCREMENT,
    acc_id VARCHAR(15) NOT NULL,
    resource_id INT(10) NOT NULL,
    exercise_id INT(10) NOT NULL,
    draw_kind VARCHAR(10) NOT NULL DEFAULT 'first',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    leave_count TINYINT(3) NOT NULL DEFAULT 0,
    away_since DATETIME DEFAULT NULL,
    drawn_at DATETIME NOT NULL,
    ended_at DATETIME DEFAULT NULL,
    PRIMARY KEY (draw_id),
    KEY idx_exdraw_acc_res (acc_id, resource_id),
    KEY idx_exdraw_exercise (exercise_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Removing an item learners already answered (or saw) hides it instead of
-- deleting it, so their answers, scores and analytics stay.
ALTER TABLE mcq_questions_tbl ADD COLUMN IF NOT EXISTS is_removed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE mcq_options_tbl ADD COLUMN IF NOT EXISTS is_removed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE fill_blanks_tbl ADD COLUMN IF NOT EXISTS is_removed TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE flashcards_tbl ADD COLUMN IF NOT EXISTS is_removed TINYINT(1) NOT NULL DEFAULT 0;
