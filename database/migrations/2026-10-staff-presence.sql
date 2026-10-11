-- ============================================================================
-- feat/publishing-presence: "Who's here / who's editing" for staff.
-- MariaDB (XAMPP / HeidiSQL). Safe to run more than once. Optional - the app
-- creates this table by itself on the first heartbeat.
-- One row per open staff browser TAB; rows expire on their own.
-- ============================================================================
CREATE TABLE IF NOT EXISTS `staff_presence_tbl` (
  `tab_id`      VARCHAR(32)  NOT NULL,                 -- random id made by the browser tab
  `acc_id`      VARCHAR(15)  NOT NULL,                 -- who
  `endpoint`    VARCHAR(80)  NOT NULL,                 -- page, e.g. admin_bp.publishing
  `items`       VARCHAR(255) NOT NULL DEFAULT '',      -- open in an editor, e.g. "res-12,ex-3"
  `active_at`   DATETIME     NOT NULL,                 -- last real click / key / scroll
  `expires_at`  DATETIME     NOT NULL,                 -- +35 s (visible tab) / +90 s (background tab)
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tab_id`),
  KEY `idx_presence_expires` (`expires_at`),
  KEY `idx_presence_acc` (`acc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
