-- Relay — combined schema (see migrations/ for the numbered files)
CREATE DATABASE IF NOT EXISTS relay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE relay;

CREATE TABLE IF NOT EXISTS users (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(100)  NOT NULL,
  email                 VARCHAR(255)  NOT NULL UNIQUE,
  password_hash         VARCHAR(255)  NOT NULL,
  is_active             TINYINT(1)    NOT NULL DEFAULT 1,
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME      NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS admins (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(100)  NOT NULL,
  email                 VARCHAR(255)  NOT NULL UNIQUE,
  password_hash         VARCHAR(255)  NOT NULL,
  is_active             TINYINT(1)    NOT NULL DEFAULT 1,
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until          DATETIME      NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
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
CREATE TABLE IF NOT EXISTS room_members (
  room_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  role       ENUM('owner','member') NOT NULL DEFAULT 'member',
  joined_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  CONSTRAINT fk_members_room FOREIGN KEY (room_id)
    REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_members_user (user_id)
) ENGINE=InnoDB;
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
