CREATE TABLE IF NOT EXISTS admin_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  admin_id    INT UNSIGNED NOT NULL,
  action      VARCHAR(64)  NOT NULL,            -- e.g. USER_DEACTIVATED, MESSAGE_REMOVED
  target_type VARCHAR(32)  NULL,                -- 'user' | 'room' | 'message'
  target_id   VARCHAR(64)  NULL,
  details     VARCHAR(512) NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_admin FOREIGN KEY (admin_id)
    REFERENCES admins(id) ON DELETE CASCADE,
  INDEX idx_logs_time (created_at)
) ENGINE=InnoDB;
