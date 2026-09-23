-- ---------------------------------------------------------------------------
-- Database changes to apply on live, 23 September 2026.
--
-- The same thing `php artisan migrate --force` does, written out for a live
-- database that is updated by hand (phpMyAdmin, or the mysql client).
--
-- Run it once, on the live database, AFTER taking a backup. Every statement
-- is safe to run on a database that already holds real rows: nothing here
-- deletes or rewrites existing data.
--
-- If you run `php artisan migrate --force` on live instead, do NOT run this
-- file as well - it would try to add the same columns twice.
-- ---------------------------------------------------------------------------

-- 1. A foreign company's saved agreement PDF -------------------------------
--    The PDF it uses every time, kept uploaded so a new agreement can start
--    from it without uploading it again.
ALTER TABLE `agreement_templates`
  ADD COLUMN `saved` TINYINT(1) NOT NULL DEFAULT 0 AFTER `size_bytes`;

-- 2. An agency that registers itself from the sign-in page -----------------
--    It applies before it has a login: the phone number it gives is kept on
--    the record, and the username stays empty until the admin approves it and
--    issues the credentials.
ALTER TABLE `agencies`
  ADD COLUMN `phone` VARCHAR(20) NULL DEFAULT NULL AFTER `email`,
  MODIFY COLUMN `username` VARCHAR(60) NULL DEFAULT NULL;

-- 3. The countries a foreign company may be registered in ------------------
--    Offered on the registration and create-agency screens; the Main Admin
--    and coordinators keep the list.
CREATE TABLE `countries` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(80) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NULL DEFAULT NULL,
  `updated_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `countries_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `countries` (`name`, `slug`, `active`, `created_at`, `updated_at`) VALUES
  ('Israel', 'israel', 1, NOW(), NOW()),
  ('United Arab Emirates', 'united_arab_emirates', 1, NOW(), NOW()),
  ('Qatar', 'qatar', 1, NOW(), NOW()),
  ('Kuwait', 'kuwait', 1, NOW(), NOW()),
  ('Saudi Arabia', 'saudi_arabia', 1, NOW(), NOW()),
  ('Oman', 'oman', 1, NOW(), NOW()),
  ('Bahrain', 'bahrain', 1, NOW(), NOW()),
  ('Jordan', 'jordan', 1, NOW(), NOW()),
  ('Cyprus', 'cyprus', 1, NOW(), NOW()),
  ('Malaysia', 'malaysia', 1, NOW(), NOW()),
  ('Singapore', 'singapore', 1, NOW(), NOW()),
  ('South Korea', 'south_korea', 1, NOW(), NOW()),
  ('Japan', 'japan', 1, NOW(), NOW()),
  ('Sri Lanka', 'sri_lanka', 1, NOW(), NOW());

-- 4. The company a candidate is registered for, and their result -----------
--    The company is an agency of type foreign - the one that signs in and
--    reads its own candidates. The result is recorded by that company or by
--    the admin side; a pass names the trade, which becomes the profession.
ALTER TABLE `candidates`
  ADD COLUMN `company_agency_id` VARCHAR(20) NULL DEFAULT NULL AFTER `agency_id`,
  ADD COLUMN `test_result` ENUM('pass','fail') NULL DEFAULT NULL AFTER `pool_status`,
  ADD COLUMN `test_result_role_id` INT UNSIGNED NULL DEFAULT NULL AFTER `test_result`,
  ADD COLUMN `test_result_note` VARCHAR(255) NULL DEFAULT NULL AFTER `test_result_role_id`,
  ADD COLUMN `test_result_at` TIMESTAMP NULL DEFAULT NULL AFTER `test_result_note`,
  ADD COLUMN `test_result_by` INT UNSIGNED NULL DEFAULT NULL AFTER `test_result_at`,
  ADD INDEX `candidates_company_agency_id_index` (`company_agency_id`);

-- 5. Tell Laravel these have been applied ----------------------------------
--    Without this, `php artisan migrate` on live would try to run them again.
--    `batch` is one higher than the largest already there.
INSERT INTO `migrations` (`migration`, `batch`) VALUES
  ('0001_01_01_003300_add_saved_to_agreement_templates', (SELECT * FROM (SELECT COALESCE(MAX(`batch`), 0) + 1 FROM `migrations`) AS b)),
  ('0001_01_01_003400_add_self_registration_to_agencies', (SELECT * FROM (SELECT MAX(`batch`) FROM `migrations`) AS b)),
  ('0001_01_01_003500_create_countries_table', (SELECT * FROM (SELECT MAX(`batch`) FROM `migrations`) AS b)),
  ('0001_01_01_003600_add_company_to_candidates', (SELECT * FROM (SELECT MAX(`batch`) FROM `migrations`) AS b)),
  ('0001_01_01_003700_register_candidates_for_a_foreign_agency', (SELECT * FROM (SELECT MAX(`batch`) FROM `migrations`) AS b));
