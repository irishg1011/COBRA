-- ============================================================================
-- feat/admin-online - Who's online, status dots, "Unlock now" audit log
-- MariaDB (XAMPP / HeidiSQL). Safe to run more than once.
-- The app also creates these by itself on first use, so running this file
-- is optional - it is here so every database can be brought up to date by hand.
-- ============================================================================

-- 1) Unlock audit log: one row per "Unlock now" click (Admin Dashboard)
CREATE TABLE IF NOT EXISTS `unlock_logs_tbl` (
  `unlock_id`              INT NOT NULL AUTO_INCREMENT,
  `acc_id`                 VARCHAR(15) NOT NULL,          -- the account that was unlocked
  `unlocked_by`            VARCHAR(15) NOT NULL,          -- the admin who clicked Unlock now
  `failed_attempts_before` INT NULL,                      -- failed_attempts at the moment of unlock
  `lockout_until_before`   DATETIME NULL,                 -- when the lock would have ended on its own
  `ip_address`             VARCHAR(45) NULL,              -- admin's IP (IPv6-safe length)
  `unlocked_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`unlock_id`),
  KEY `idx_unlock_acc` (`acc_id`),
  KEY `idx_unlock_by` (`unlocked_by`),
  KEY `idx_unlock_at` (`unlocked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2) Who's online: real activity time + device/browser on each session
ALTER TABLE `active_sessions_tbl`
  ADD COLUMN IF NOT EXISTS `last_activity_at` TIMESTAMP NULL DEFAULT NULL,  -- real clicks/page loads only (drives the green/yellow/grey dots)
  ADD COLUMN IF NOT EXISTS `user_agent`       VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `ip_address`       VARCHAR(45) NULL;

-- Faster lookups for the dots / Who's online page
CREATE INDEX IF NOT EXISTS `idx_sessions_acc`      ON `active_sessions_tbl` (`acc_id`);
CREATE INDEX IF NOT EXISTS `idx_sessions_activity` ON `active_sessions_tbl` (`last_activity_at`);
