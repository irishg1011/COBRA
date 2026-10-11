-- ============================================================================
-- feat/admin-extras: Activity Log (audit trail) + server error log.
-- MariaDB (XAMPP / HeidiSQL). Safe to run more than once. Optional - the app
-- creates both tables by itself when it starts, and copies the old
-- account_actions_log_tbl rows into activity_log_tbl once (that table is
-- left untouched).
-- ============================================================================

-- 1) ONE activity log: who did what, when
CREATE TABLE IF NOT EXISTS `activity_log_tbl` (
  `log_id`        BIGINT       NOT NULL AUTO_INCREMENT,
  `created_at`    DATETIME     NOT NULL,
  `actor_acc_id`  VARCHAR(15)  NULL,              -- who (NULL = the system)
  `actor_role`    VARCHAR(20)  NULL,              -- their role at that moment
  `action`        VARCHAR(40)  NOT NULL,          -- publish, archive, password_reset, ...
  `category`      VARCHAR(20)  NOT NULL,          -- content / accounts / security / settings
  `target_type`   VARCHAR(20)  NULL,              -- lesson, module, account, badge, ...
  `target_id`     VARCHAR(30)  NULL,
  `target_name`   VARCHAR(255) NULL,              -- the name AT THAT MOMENT
  `details`       VARCHAR(500) NULL,
  `ip_address`    VARCHAR(45)  NULL,
  `endpoint`      VARCHAR(80)  NULL,              -- the route that did it
  PRIMARY KEY (`log_id`),
  KEY `idx_activity_time` (`created_at`),
  KEY `idx_activity_actor` (`actor_acc_id`, `created_at`),
  KEY `idx_activity_category` (`category`, `created_at`),
  KEY `idx_activity_action` (`action`),
  KEY `idx_activity_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2) Server errors (System Health -> "errors today"). Kept 90 days.
CREATE TABLE IF NOT EXISTS `error_log_tbl` (
  `error_id`    BIGINT       NOT NULL AUTO_INCREMENT,
  `created_at`  DATETIME     NOT NULL,
  `status`      INT          NOT NULL DEFAULT 500,
  `method`      VARCHAR(10)  NULL,
  `path`        VARCHAR(255) NULL,
  `endpoint`    VARCHAR(80)  NULL,
  `acc_id`      VARCHAR(15)  NULL,
  `error_type`  VARCHAR(100) NULL,
  `message`     VARCHAR(500) NULL,
  PRIMARY KEY (`error_id`),
  KEY `idx_error_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
