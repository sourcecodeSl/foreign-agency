-- Main Admin System - database schema
-- Target: MySQL 5.7+ / MariaDB 10.2+ (XAMPP ships MariaDB)
--
-- Apply with:  npm run db:migrate
-- or paste into phpMyAdmin > agency > SQL.

CREATE TABLE IF NOT EXISTS users (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name              VARCHAR(120)  NOT NULL,
  email             VARCHAR(190)  NOT NULL,
  phone             VARCHAR(20)   NOT NULL,
  -- bcrypt hash, never the plain password
  password_hash     VARCHAR(255)  NOT NULL,
  role_slug         VARCHAR(50)   NOT NULL DEFAULT 'agent',
  agency_name       VARCHAR(150)      NULL DEFAULT NULL,
  status            ENUM('pending','active','deactivated') NOT NULL DEFAULT 'pending',
  email_verified_at DATETIME          NULL DEFAULT NULL,
  phone_verified_at DATETIME          NULL DEFAULT NULL,
  last_login_at     DATETIME          NULL DEFAULT NULL,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- One account per email and per phone; the register endpoint relies on
  -- these to reject duplicates even under concurrent submits.
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY idx_users_role   (role_slug),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
