-- =====================================================================
-- Live database update - 2026-09-18
--
-- Brings a database that is at migration 0001_01_01_001500 up to
-- 0001_01_01_002100:
--   001600  foreign companies, job roles, skill tests, candidate pool status
--   001700  agency type / country (already present from 001500)
--   001800  candidate job category and test index number
--   001900  candidate source, pass and submission columns
--   002000  candidate nic_key (one key per person, either NIC format)
--   002100  candidate_job_roles (several trades per candidate)
--
-- Take a backup first. ALTER TABLE commits on its own in MySQL, so this
-- cannot be rolled back as one transaction.
--
-- Deliberately left out: the part of 001600 that moved agencies of type
-- 'foreign' into foreign_companies, deleted them and dropped
-- agencies.type/country (001700 then added the columns back empty).
-- Agencies keep their type and country here.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Check where the database is. The last row must be
--    0001_01_01_001500_add_type_and_country_to_agencies; if 001600 or later
--    is already listed, STOP - this file is not for that database.
-- ---------------------------------------------------------------------
SELECT migration, batch FROM migrations ORDER BY id DESC LIMIT 3;


-- ---------------------------------------------------------------------
-- 001600  Foreign companies, job roles, skill tests
-- ---------------------------------------------------------------------
CREATE TABLE `foreign_companies` (
  `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `code` varchar(20) NOT NULL,
  `name` varchar(150) NOT NULL,
  `country` varchar(80) NOT NULL,
  `city` varchar(80) NULL,
  `contact_name` varchar(120) NULL,
  `contact_email` varchar(190) NULL,
  `contact_phone` varchar(20) NULL,
  `coordinator_id` int unsigned NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  `notes` varchar(255) NULL,
  `created_at` timestamp NULL,
  `updated_at` timestamp NULL,
  UNIQUE KEY `foreign_companies_code_unique` (`code`),
  KEY `foreign_companies_coordinator_id_status_index` (`coordinator_id`, `status`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `job_roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(120) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL,
  `updated_at` timestamp NULL,
  UNIQUE KEY `job_roles_slug_unique` (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `job_roles` (`name`, `slug`, `active`, `created_at`, `updated_at`) VALUES
  ('Tiler', 'tiler', 1, NOW(), NOW()),
  ('Shuttering Carpenter', 'shuttering_carpenter', 1, NOW(), NOW()),
  ('Mason', 'mason', 1, NOW(), NOW()),
  ('Steel Fixer', 'steel_fixer', 1, NOW(), NOW()),
  ('Welder', 'welder', 1, NOW(), NOW()),
  ('Electrician', 'electrician', 1, NOW(), NOW()),
  ('Plumber', 'plumber', 1, NOW(), NOW()),
  ('Painter', 'painter', 1, NOW(), NOW()),
  ('Heavy Vehicle Driver', 'heavy_vehicle_driver', 1, NOW(), NOW()),
  ('Caregiver', 'caregiver', 1, NOW(), NOW()),
  ('Agriculture Worker', 'agriculture_worker', 1, NOW(), NOW()),
  ('General Labourer', 'general_labourer', 1, NOW(), NOW());

-- FC-1001 ... and TST-1001 ... start after these.
INSERT IGNORE INTO `app_counters` (`name`, `value`) VALUES ('company', 1000), ('test', 1000);

CREATE TABLE `skill_tests` (
  `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `test_no` varchar(20) NOT NULL,
  `candidate_id` int unsigned NOT NULL,
  `agency_id` varchar(20) NOT NULL,
  `company_id` int unsigned NOT NULL,
  `job_role_id` int unsigned NOT NULL,
  `scheduled_for` date NOT NULL,
  `status` enum('scheduled','passed','failed','closed') NOT NULL DEFAULT 'scheduled',
  `result_note` varchar(255) NULL,
  `decided_at` datetime NULL,
  `decided_by` int unsigned NULL,
  `created_by` int unsigned NULL,
  `created_at` timestamp NULL,
  `updated_at` timestamp NULL,
  UNIQUE KEY `skill_tests_test_no_unique` (`test_no`),
  KEY `skill_tests_candidate_id_status_index` (`candidate_id`, `status`),
  KEY `skill_tests_company_id_status_index` (`company_id`, `status`),
  KEY `skill_tests_agency_id_status_index` (`agency_id`, `status`),
  CONSTRAINT `skill_tests_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `skill_tests_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `foreign_companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `skill_tests_job_role_id_foreign` FOREIGN KEY (`job_role_id`) REFERENCES `job_roles` (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `candidates`
  ADD `pool_status` enum('pool','testing','passed') NOT NULL DEFAULT 'pool' AFTER `status`,
  ADD `locked_company_id` int unsigned NULL AFTER `pool_status`,
  ADD `locked_at` datetime NULL AFTER `locked_company_id`,
  ADD INDEX `candidates_pool_status_index` (`pool_status`),
  ADD INDEX `candidates_locked_company_id_index` (`locked_company_id`);


-- ---------------------------------------------------------------------
-- 001700  Agency type / country - the columns are already there from
--         001500; only the country of local agencies is filled in.
-- ---------------------------------------------------------------------
UPDATE `agencies` SET `country` = 'Sri Lanka' WHERE `type` = 'local' AND `country` IS NULL;


-- ---------------------------------------------------------------------
-- 001800  Job category and test index number
-- ---------------------------------------------------------------------
ALTER TABLE `candidates`
  ADD `job_role_id` int unsigned NULL AFTER `email`,
  ADD `test_index_no` varchar(40) NULL AFTER `job_role_id`,
  ADD INDEX `candidates_job_role_id_index` (`job_role_id`),
  ADD INDEX `candidates_test_index_no_index` (`test_index_no`);


-- ---------------------------------------------------------------------
-- 001900  Who registered the candidate, the pass, the submission
-- ---------------------------------------------------------------------
ALTER TABLE `candidates`
  ADD `source` varchar(20) NOT NULL DEFAULT 'agency' AFTER `created_by`,
  ADD `passed_at` datetime NULL AFTER `locked_at`,
  ADD `passed_by` int unsigned NULL AFTER `passed_at`,
  ADD `submitted_at` datetime NULL AFTER `status`,
  ADD `submitted_by` int unsigned NULL AFTER `submitted_at`,
  ADD INDEX `candidates_passport_no_index` (`passport_no`),
  ADD INDEX `candidates_nic_no_index` (`nic_no`);

UPDATE `candidates` SET `source` = 'coordinator'
  WHERE `created_by` IN (SELECT `id` FROM `users` WHERE `role_slug` = 'coordinator');
UPDATE `candidates` SET `source` = 'main_admin'
  WHERE `created_by` IN (SELECT `id` FROM `users` WHERE `role_slug` = 'main_admin');
UPDATE `candidates` SET `passed_at` = `locked_at`
  WHERE `pool_status` = 'passed' AND `passed_at` IS NULL;


-- ---------------------------------------------------------------------
-- 002000  nic_key: 901234567V and 199012304567 are the same person.
--         Same rule as App\Support\Nic::key(). Removed files included.
-- ---------------------------------------------------------------------
ALTER TABLE `candidates`
  ADD `nic_key` varchar(12) NULL AFTER `nic_no`,
  ADD INDEX `candidates_nic_key_index` (`nic_key`);

UPDATE `candidates`
SET `nic_key` = CASE
    WHEN `nic_no` IS NULL OR REPLACE(`nic_no`, ' ', '') = '' THEN NULL
    WHEN UPPER(REPLACE(`nic_no`, ' ', '')) REGEXP '^[0-9]{9}[VX]$' THEN CONCAT(
        '19',
        SUBSTRING(UPPER(REPLACE(`nic_no`, ' ', '')), 1, 5),
        '0',
        SUBSTRING(UPPER(REPLACE(`nic_no`, ' ', '')), 6, 4)
    )
    ELSE UPPER(REPLACE(`nic_no`, ' ', ''))
END
WHERE `nic_no` IS NOT NULL;


-- ---------------------------------------------------------------------
-- 002100  Several trades per candidate
-- ---------------------------------------------------------------------
CREATE TABLE `candidate_job_roles` (
  `id` int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `candidate_id` int unsigned NOT NULL,
  `job_role_id` int unsigned NOT NULL,
  `created_at` timestamp NULL,
  `updated_at` timestamp NULL,
  UNIQUE KEY `candidate_job_roles_candidate_id_job_role_id_unique` (`candidate_id`, `job_role_id`),
  CONSTRAINT `candidate_job_roles_candidate_id_foreign` FOREIGN KEY (`candidate_id`) REFERENCES `candidates` (`id`) ON DELETE CASCADE,
  CONSTRAINT `candidate_job_roles_job_role_id_foreign` FOREIGN KEY (`job_role_id`) REFERENCES `job_roles` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `candidate_job_roles` (`candidate_id`, `job_role_id`, `created_at`, `updated_at`)
SELECT `id`, `job_role_id`, NOW(), NOW() FROM `candidates` WHERE `job_role_id` IS NOT NULL
UNION
SELECT `candidate_id`, `job_role_id`, NOW(), NOW() FROM `skill_tests`;


-- ---------------------------------------------------------------------
-- Tell Laravel these migrations have run, so `php artisan migrate`
-- does not try them again.
-- ---------------------------------------------------------------------
SET @batch = (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`);
INSERT INTO `migrations` (`migration`, `batch`) VALUES
  ('0001_01_01_001600_create_foreign_companies_and_skill_tests', @batch),
  ('0001_01_01_001700_restore_agency_type', @batch),
  ('0001_01_01_001800_add_job_category_to_candidates', @batch),
  ('0001_01_01_001900_add_pass_and_source_to_candidates', @batch),
  ('0001_01_01_002000_add_nic_key_to_candidates', @batch),
  ('0001_01_01_002100_create_candidate_job_roles_table', @batch);
