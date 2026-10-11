-- ============================================================================
-- feat/account-tools: progress reset, help requests, forced password change,
-- delete-my-account (30-day restore). MariaDB (XAMPP / HeidiSQL).
-- Safe to run more than once. The app also creates all of this by itself on
-- start-up, so running this file is optional.
-- ============================================================================

-- 1) Admin settings (ON/OFF switches). Starts with progress reset ON.
CREATE TABLE IF NOT EXISTS `system_settings_tbl` (
  `setting_key`   VARCHAR(64)  NOT NULL,
  `setting_value` VARCHAR(255) NOT NULL,
  `updated_by`    VARCHAR(15)  NULL,               -- admin who last changed it
  `updated_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `system_settings_tbl` (`setting_key`, `setting_value`)
VALUES ('allow_progress_reset', '1');                -- 1 = ON, 0 = OFF

-- 2) Activity log: every reset / password reset / unlock / delete / restore
CREATE TABLE IF NOT EXISTS `account_actions_log_tbl` (
  `action_id`   INT          NOT NULL AUTO_INCREMENT,
  `action`      VARCHAR(40)  NOT NULL,               -- progress_reset, password_reset, password_changed, unlock, help_request, help_done, self_delete, self_restore, admin_restore_pending, auto_archive, setting_changed
  `acc_id`      VARCHAR(15)  NULL,                   -- the account it happened to
  `done_by`     VARCHAR(15)  NULL,                   -- who did it (NULL = the system, e.g. the 30-day move)
  `details`     VARCHAR(500) NULL,
  `ip_address`  VARCHAR(45)  NULL,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`action_id`),
  KEY `idx_actions_acc` (`acc_id`, `created_at`),
  KEY `idx_actions_by` (`done_by`),
  KEY `idx_actions_action` (`action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3) "Can't get in? Ask an admin" requests (staff login page)
CREATE TABLE IF NOT EXISTS `help_requests_tbl` (
  `request_id`   INT          NOT NULL AUTO_INCREMENT,
  `typed_name`   VARCHAR(100) NOT NULL,              -- what they typed (username or ID)
  `acc_id`       VARCHAR(15)  NULL,                  -- matched STAFF account (NULL = no match)
  `message`      VARCHAR(500) NOT NULL,
  `ip_address`   VARCHAR(45)  NULL,
  `status`       VARCHAR(10)  NOT NULL DEFAULT 'open',  -- open / done
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `handled_by`   VARCHAR(15)  NULL,
  `handled_at`   DATETIME     NULL,
  `resolution`   VARCHAR(30)  NULL,                  -- password_reset / unlocked / other
  PRIMARY KEY (`request_id`),
  KEY `idx_help_status` (`status`, `created_at`),
  KEY `idx_help_acc` (`acc_id`),
  KEY `idx_help_ip` (`ip_address`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4) New columns on accounts
ALTER TABLE `account_tbl`
  ADD COLUMN IF NOT EXISTS `must_change_password`  TINYINT(1) NOT NULL DEFAULT 0,  -- 1 = forced "set a new password" at next login
  ADD COLUMN IF NOT EXISTS `deletion_requested_at` DATETIME NULL,                  -- when they clicked "Delete my account"
  ADD COLUMN IF NOT EXISTS `deletion_due_at`       DATETIME NULL;                  -- requested + 30 days -> becomes Archived

CREATE INDEX IF NOT EXISTS `idx_account_deletion_due` ON `account_tbl` (`deletion_due_at`);
