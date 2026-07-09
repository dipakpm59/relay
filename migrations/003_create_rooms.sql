CREATE TABLE IF NOT EXISTS rooms (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  owner_id     INT UNSIGNED NOT NULL,
  name         VARCHAR(50)   NOT NULL,
  invite_code  VARCHAR(16)   NOT NULL UNIQUE,   -- nanoid; shareable link + QR
  is_archived  TINYINT(1)    NOT NULL DEFAULT 0, -- soft delete for rooms
  archived_at  DATETIME      NULL,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rooms_owner FOREIGN KEY (owner_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_rooms_owner (owner_id)
) ENGINE=InnoDB;
