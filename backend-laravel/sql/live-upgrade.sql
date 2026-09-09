-- =============================================================================
--  LIVE UPGRADE  -  foreign-agency.solidrow.lk
-- =============================================================================
--  Run this whole file in phpMyAdmin on the LIVE database.
--  Nothing is commented out - paste it all and press Go.
--  Safe to run twice: existing rows and tables are left alone.
--
--  It does four things:
--    1. adds username + agency_id to users        (mainadmin login)
--    2. creates candidates + candidate_documents  (candidate module)
--    3. adds the candidates permission to roles   (agency access)
--    4. records the migrations so artisan does not repeat them
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. users: the columns the new login needs
-- -----------------------------------------------------------------------------
-- Sign-in now accepts a username, an email or a phone number. Without the
-- username column, "mainadmin" matches nothing and you get
-- "Invalid username or password."

-- Each change is guarded by an information_schema check, so running this file
-- a second time is harmless. (Plain ALTER ... ADD COLUMN would abort with
-- "Duplicate column name", and phpMyAdmin stops at the first error - which
-- would silently skip everything below.) This form works on both MySQL and
-- MariaDB, unlike ADD COLUMN IF NOT EXISTS.

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'agency_id') > 0,
  'SELECT "agency_id already exists"',
  'ALTER TABLE `users` ADD COLUMN `agency_id` varchar(20) DEFAULT NULL AFTER `agency_name`');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username') > 0,
  'SELECT "username already exists"',
  'ALTER TABLE `users` ADD COLUMN `username` varchar(60) DEFAULT NULL AFTER `name`');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_agency_id_index') > 0,
  'SELECT "agency_id index already exists"',
  'ALTER TABLE `users` ADD INDEX `users_agency_id_index` (`agency_id`)');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_username_unique') > 0,
  'SELECT "username index already exists"',
  'ALTER TABLE `users` ADD UNIQUE `users_username_unique` (`username`)');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- Give the existing admin its username.
UPDATE `users` SET `username` = 'mainadmin' WHERE `role_slug` = 'main_admin' AND `username` IS NULL;


-- -----------------------------------------------------------------------------
-- 2. Candidate tables
-- -----------------------------------------------------------------------------
-- candidate_documents has no unique key on (candidate_id, type) on purpose:
-- uploads are append-only, so the same type can be attached many times and
-- the newest row is the current file.

CREATE TABLE IF NOT EXISTS `candidates` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `agency_id` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `passport_no` varchar(30) NOT NULL,
  `nic_no` varchar(20) DEFAULT NULL,
  `address` varchar(255) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `email` varchar(190) DEFAULT NULL,
  `status` enum('draft','submitted','approved','rejected') NOT NULL DEFAULT 'draft',
  `notes` text DEFAULT NULL,
  `created_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `candidates_agency_id_passport_no_unique` (`agency_id`,`passport_no`),
  UNIQUE KEY `candidates_agency_id_nic_no_unique` (`agency_id`,`nic_no`),
  KEY `candidates_agency_id_status_index` (`agency_id`,`status`),
  CONSTRAINT `candidates_agency_id_foreign` FOREIGN KEY (`agency_id`) REFERENCES `agencies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `candidate_documents` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `candidate_id` int(10) unsigned NOT NULL,
  `type` enum('passport_copy','online_police_report','medical','affidavit_english','affidavit_sinhala','family_affidavit_english','family_affidavit_sinhala','agreement') NOT NULL,
  `disk` varchar(30) NOT NULL DEFAULT 'local',
  `path` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime_type` varchar(120) NOT NULL,
  `size_bytes` bigint(20) unsigned NOT NULL,
  `uploaded_by` int(10) unsigned DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `candidate_documents_latest_index` (`candidate_id`,`type`,`id`),
  CONSTRAINT `candidate_documents_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- -----------------------------------------------------------------------------
-- 3. Permissions: add the candidates module
-- -----------------------------------------------------------------------------
-- The live roles have no candidates entry, so every candidate route would
-- answer 403 for an agency. Agency roles are limited to candidates only.

UPDATE `roles` SET `permissions` = '{"agencies":{"view":true,"create":true,"edit":true,"delete":true},"candidates":{"view":true,"create":true,"edit":true,"delete":true},"users":{"view":true,"create":true,"edit":true,"delete":true},"roles":{"view":true,"create":true,"edit":true,"delete":true},"reports":{"view":true,"create":true,"edit":true,"delete":true},"billing":{"view":true,"create":true,"edit":true,"delete":true},"settings":{"view":true,"create":true,"edit":true,"delete":true}}' WHERE `slug` = 'main_admin';
UPDATE `roles` SET `permissions` = '{"agencies":{"view":false,"create":false,"edit":false,"delete":false},"candidates":{"view":true,"create":true,"edit":true,"delete":false},"users":{"view":false,"create":false,"edit":false,"delete":false},"roles":{"view":false,"create":false,"edit":false,"delete":false},"reports":{"view":false,"create":false,"edit":false,"delete":false},"billing":{"view":false,"create":false,"edit":false,"delete":false},"settings":{"view":false,"create":false,"edit":false,"delete":false}}' WHERE `slug` = 'agency_owner';
UPDATE `roles` SET `permissions` = '{"agencies":{"view":false,"create":false,"edit":false,"delete":false},"candidates":{"view":true,"create":true,"edit":true,"delete":false},"users":{"view":false,"create":false,"edit":false,"delete":false},"roles":{"view":false,"create":false,"edit":false,"delete":false},"reports":{"view":false,"create":false,"edit":false,"delete":false},"billing":{"view":false,"create":false,"edit":false,"delete":false},"settings":{"view":false,"create":false,"edit":false,"delete":false}}' WHERE `slug` = 'agency_manager';
UPDATE `roles` SET `permissions` = '{"agencies":{"view":false,"create":false,"edit":false,"delete":false},"candidates":{"view":true,"create":true,"edit":true,"delete":false},"users":{"view":false,"create":false,"edit":false,"delete":false},"roles":{"view":false,"create":false,"edit":false,"delete":false},"reports":{"view":false,"create":false,"edit":false,"delete":false},"billing":{"view":false,"create":false,"edit":false,"delete":false},"settings":{"view":false,"create":false,"edit":false,"delete":false}}' WHERE `slug` = 'agent';
UPDATE `roles` SET `permissions` = '{"agencies":{"view":true,"create":false,"edit":false,"delete":false},"candidates":{"view":true,"create":false,"edit":false,"delete":false},"users":{"view":true,"create":false,"edit":false,"delete":false},"roles":{"view":true,"create":false,"edit":false,"delete":false},"reports":{"view":true,"create":false,"edit":false,"delete":false},"billing":{"view":true,"create":false,"edit":false,"delete":false},"settings":{"view":false,"create":false,"edit":false,"delete":false}}' WHERE `slug` = 'auditor';


-- -----------------------------------------------------------------------------
-- 4. Migration bookkeeping
-- -----------------------------------------------------------------------------
-- Tells Laravel these are already applied.

INSERT IGNORE INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000600_add_agency_id_to_users_table', 9);
INSERT IGNORE INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000700_create_candidates_table', 9);
INSERT IGNORE INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000800_create_candidate_documents_table', 9);
INSERT IGNORE INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_000900_add_username_to_users_table', 9);
INSERT IGNORE INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_001000_allow_document_history_on_candidate_documents', 9);
INSERT IGNORE INTO `migrations` (`migration`, `batch`) VALUES ('0001_01_01_001100_make_nic_optional_on_candidates', 9);


-- =============================================================================
--  Done. Sign in with:  mainadmin  /  your admin password
--  (the email address still works as the username too)
-- =============================================================================
