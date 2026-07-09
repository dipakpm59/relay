CREATE TABLE IF NOT EXISTS messages (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_id     INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  body        TEXT          NOT NULL,          -- xss-sanitized in the service layer
  is_deleted  TINYINT(1)    NOT NULL DEFAULT 0, -- soft delete (moderation)
  deleted_at  DATETIME      NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_room FOREIGN KEY (room_id)
    REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_messages_room_id (room_id, id),     -- history pagination
  INDEX idx_messages_time (created_at),         -- analytics
  INDEX idx_messages_user_time (user_id, created_at) -- daily limit
) ENGINE=InnoDB;
