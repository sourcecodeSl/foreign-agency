-- =============================================================================
--  Agency & Candidate Management - live database update
-- =============================================================================
--
--  Safe to run more than once: every CREATE uses IF NOT EXISTS and every
--  INSERT uses INSERT IGNORE, so re-running changes nothing.
--
--  If you have SSH on the live server, prefer:
--      php artisan migrate --force && php artisan db:seed --force
--  This file is for phpMyAdmin / cPanel, where artisan is not available.
--
--  ORDER MATTERS. Run the sections top to bottom.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;


-- -----------------------------------------------------------------------------
-- SECTION 1 - Tables
-- -----------------------------------------------------------------------------
-- Creates anything missing. Existing tables are left exactly as they are,
-- which is why Section 2 exists for the older `users` table.

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `agencies` (
  `id` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `code` varchar(30) NOT NULL,
  `address` varchar(255) NOT NULL,
  `username` varchar(60) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `contact` varchar(120) NOT NULL DEFAULT '-',
  `email` varchar(190) NOT NULL DEFAULT '-',
  `users` int(10) unsigned NOT NULL DEFAULT 0,
  `status` enum('pending','active','deactivated') NOT NULL DEFAULT 'pending',
  `created_at` varchar(30) DEFAULT NULL,
  `created_by` varchar(30) DEFAULT NULL,
  `status_changed_at` varchar(40) DEFAULT NULL,
  `status_changed_by` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agencies_username_unique` (`username`),
  KEY `agencies_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `app_counters` (
  `name` varchar(40) NOT NULL,
  `value` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `email_verifications` (
  `id` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL DEFAULT '-',
  `email` varchar(190) NOT NULL,
  `agency` varchar(150) NOT NULL DEFAULT '-',
  `status` enum('unverified','verified','bounced') NOT NULL DEFAULT 'unverified',
  `requested_at` varchar(40) DEFAULT NULL,
  `attempts` int(10) unsigned NOT NULL DEFAULT 1,
  `token` varchar(100) DEFAULT NULL,
  `verified_at` varchar(40) DEFAULT NULL,
  `verified_by` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `email_verifications_status_index` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `otp_challenges` (
  `id` varchar(40) NOT NULL,
  `admin_id` int(10) unsigned NOT NULL,
  `destination` varchar(190) NOT NULL,
  `channel` enum('sms','email') NOT NULL,
  `meta` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`meta`)),
  `code` varchar(6) NOT NULL,
  `expires_at` bigint(20) unsigned NOT NULL,
  `last_sent_at` bigint(20) unsigned NOT NULL,
  `attempts` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `roles` (
  `id` varchar(10) NOT NULL,
  `name` varchar(120) NOT NULL,
  `slug` varchar(60) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `permissions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`permissions`)),
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `username` varchar(60) DEFAULT NULL,
  `email` varchar(190) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role_slug` varchar(50) NOT NULL DEFAULT 'agent',
  `agency_name` varchar(150) DEFAULT NULL,
  `agency_id` varchar(20) DEFAULT NULL,
  `status` enum('pending','active','deactivated') NOT NULL DEFAULT 'pending',
  `email_verified_at` datetime DEFAULT NULL,
  `phone_verified_at` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  UNIQUE KEY `users_username_unique` (`username`),
  KEY `idx_users_role` (`role_slug`),
  KEY `idx_users_status` (`status`),
  KEY `users_agency_id_index` (`agency_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

-- -----------------------------------------------------------------------------
-- SECTION 2 - Columns added to an existing `users` table
-- -----------------------------------------------------------------------------
-- *** UPGRADE ONLY - leave this commented on a fresh database. ***
--
-- Run these four lines only when `users` already existed from the earlier
-- version and is missing `username` / `agency_id`. On a fresh database
-- Section 1 already created the table with both, and these would fail with
-- "Duplicate column name" / "Duplicate key name".
--
-- Check first:   SHOW COLUMNS FROM `users` LIKE 'username';
-- Nothing back means you need this section: uncomment and run it.

-- ALTER TABLE `users` ADD COLUMN `agency_id` varchar(20) DEFAULT NULL AFTER `agency_name`;
-- ALTER TABLE `users` ADD COLUMN `username`  varchar(60) DEFAULT NULL AFTER `name`;
-- ALTER TABLE `users` ADD INDEX  `users_agency_id_index` (`agency_id`);
-- ALTER TABLE `users` ADD UNIQUE `users_username_unique` (`username`);


-- -----------------------------------------------------------------------------
-- SECTION 3 - Document history
-- -----------------------------------------------------------------------------
-- *** UPGRADE ONLY - leave this commented on a fresh database. ***
--
-- Older builds allowed one file per document type. Attaching the same type
-- again must now keep both, so the unique key becomes a plain index.
--
-- Skip this on a fresh install - Section 1 already built it correctly.
-- The replacement index is added FIRST because MySQL will not drop the unique
-- key while it is the only index backing the candidate_id foreign key.

-- ALTER TABLE `candidate_documents` ADD INDEX `candidate_documents_latest_index` (`candidate_id`,`type`,`id`);
-- ALTER TABLE `candidate_documents` DROP INDEX `candidate_documents_candidate_id_type_unique`;

-- NIC is optional on the candidate registration form.
-- ALTER TABLE `candidates` MODIFY `nic_no` varchar(20) DEFAULT NULL;


-- -----------------------------------------------------------------------------
-- SECTION 4 - Reference data
-- -----------------------------------------------------------------------------
-- Roles carry the permission matrix, so sign-in and every guarded route
-- depend on these rows. app_counters feeds the AG-#### agency numbering.
-- The `migrations` rows tell Laravel these changes are already applied, so a
-- later `php artisan migrate` does not try to repeat them.

INSERT IGNORE INTO `roles` (`id`, `name`, `slug`, `description`, `is_system`, `permissions`) VALUES ('RL-01','Main Admin','main_admin','Full system control including agency creation and permissions.',1,'{\"agencies\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"candidates\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"users\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"roles\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"reports\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"billing\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"settings\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true}}');
INSERT IGNORE INTO `roles` (`id`, `name`, `slug`, `description`, `is_system`, `permissions`) VALUES ('RL-02','Agency Owner','agency_owner','Manages a single agency, its staff and its data.',0,'{\"agencies\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"candidates\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":false},\"users\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"roles\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}');
INSERT IGNORE INTO `roles` (`id`, `name`, `slug`, `description`, `is_system`, `permissions`) VALUES ('RL-03','Agency Manager','agency_manager','Day-to-day operations inside an agency, no billing access.',0,'{\"agencies\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"candidates\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":false},\"users\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"roles\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}');
INSERT IGNORE INTO `roles` (`id`, `name`, `slug`, `description`, `is_system`, `permissions`) VALUES ('RL-04','Agent','agent','Handles assigned records only.',0,'{\"agencies\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"candidates\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":false},\"users\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"roles\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}');
INSERT IGNORE INTO `roles` (`id`, `name`, `slug`, `description`, `is_system`, `permissions`) VALUES ('RL-05','Auditor','auditor','Read-only access across all agencies for compliance review.',0,'{\"agencies\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"candidates\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"users\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"roles\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}');
INSERT IGNORE INTO `app_counters` (`name`, `value`) VALUES ('agency',1047);
INSERT IGNORE INTO `app_counters` (`name`, `value`) VALUES ('role',5);
INSERT IGNORE INTO `app_counters` (`name`, `value`) VALUES ('verification',504);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (1,'0001_01_01_000000_create_users_table',1);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (2,'0001_01_01_000100_create_agencies_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (3,'0001_01_01_000200_create_roles_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (4,'0001_01_01_000300_create_email_verifications_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (5,'0001_01_01_000400_create_otp_challenges_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (6,'0001_01_01_000500_create_app_counters_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (7,'0001_01_01_000600_add_agency_id_to_users_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (8,'0001_01_01_000700_create_candidates_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (9,'0001_01_01_000800_create_candidate_documents_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (10,'0001_01_01_000900_add_username_to_users_table',2);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (11,'0001_01_01_001000_allow_document_history_on_candidate_documents',3);
INSERT IGNORE INTO `migrations` (`id`, `migration`, `batch`) VALUES (12,'0001_01_01_001100_make_nic_optional_on_candidates',3);

-- -----------------------------------------------------------------------------
-- SECTION 5 - Main Admin account
-- -----------------------------------------------------------------------------
-- The only account not created from the admin panel. The hash below is for
-- the password Admin@1234 - sign in and change it immediately.
--
-- Edit the email and phone to your own before running.

INSERT IGNORE INTO `users`
  (`name`, `username`, `email`, `phone`, `password_hash`, `role_slug`, `status`,
   `email_verified_at`, `phone_verified_at`, `created_at`, `updated_at`)
VALUES
  ('Main Admin', 'mainadmin', 'visaltheekshana555@gmail.com', '0781311850',
   '$2y$10$YEuvnZtKuY0YfYzU5qgk1.5Z8krZScV5Iiz17j5pI7kdoxl3Q21X.', 'main_admin', 'active',
   NOW(), NOW(), NOW(), NOW());


SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
--  Done. After running this, set these in the live .env:
--
--    APP_ENV=production
--    APP_DEBUG=false
--    APP_KEY=            (php artisan key:generate, or copy from local)
--    JWT_SECRET=         (64 random characters - NOT the local one)
--    DB_DATABASE / DB_USERNAME / DB_PASSWORD
--    CACHE_STORE=file
--    SESSION_DRIVER=file
--    QUEUE_CONNECTION=sync
--
--  storage/ and bootstrap/cache/ must be writable by the web server.
-- =============================================================================
