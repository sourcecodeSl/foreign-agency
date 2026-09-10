-- ============================================================================
-- Foreign Agency Admin - MISSING TABLES ONLY (keeps your existing `users`)
-- phpMyAdmin > yourcpanel_foreign_agency > SQL tab > paste > Go
-- Creates: agencies, app_counters, email_verifications, migrations,
--          otp_challenges, roles  (does NOT touch the users table)
-- ============================================================================
SET FOREIGN_KEY_CHECKS=0;
SET SQL_MODE='NO_AUTO_VALUE_ON_ZERO';
SET NAMES utf8mb4;

DROP TABLE IF EXISTS `agencies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `agencies` (
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

LOCK TABLES `agencies` WRITE;
/*!40000 ALTER TABLE `agencies` DISABLE KEYS */;
INSERT INTO `agencies` VALUES ('AG-1041','Skyline Marketing','SKY-1041','221B Baker Street, Colombo 03','skyline.admin',NULL,'Nadia Perera','ops@skyline.lk',14,'active','2026-08-12',NULL,NULL,NULL),('AG-1042','BlueWave Media','BLW-1042','17 Marine Drive, Galle','bluewave.admin',NULL,'Rehan Silva','hello@bluewave.lk',8,'pending','2026-09-01',NULL,NULL,NULL),('AG-1043','Northstar Travels','NST-1043','5 Hill Street, Kandy','northstar.admin',NULL,'Ayesha Fernando','desk@northstar.lk',22,'active','2026-07-28',NULL,NULL,NULL),('AG-1044','Orchid Recruiters','ORC-1044','90 Union Place, Colombo 02','orchid.admin',NULL,'Dilan Jayasuriya','info@orchid.lk',3,'deactivated','2026-05-19',NULL,NULL,NULL);
/*!40000 ALTER TABLE `agencies` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `app_counters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `app_counters` (
  `name` varchar(40) NOT NULL,
  `value` int(10) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `app_counters` WRITE;
/*!40000 ALTER TABLE `app_counters` DISABLE KEYS */;
INSERT INTO `app_counters` VALUES ('agency',1047),('role',5),('verification',504);
/*!40000 ALTER TABLE `app_counters` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `email_verifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `email_verifications` (
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

LOCK TABLES `email_verifications` WRITE;
/*!40000 ALTER TABLE `email_verifications` DISABLE KEYS */;
INSERT INTO `email_verifications` VALUES ('EV-501','Rehan Silva','hello@bluewave.lk','BlueWave Media','unverified','2026-09-01 10:22',2,'seed-501',NULL,NULL),('EV-502','Nadia Perera','ops@skyline.lk','Skyline Marketing','verified','2026-08-12 09:04',1,'seed-502',NULL,NULL),('EV-503','Saman Weerasinghe','admin@lotus.lk','Lotus Consulting','unverified','2026-09-05 15:41',1,'seed-503',NULL,NULL),('EV-504','Meera Anand','book@coral.lk','Coral Tours','bounced','2026-04-22 12:10',4,'seed-504',NULL,NULL);
/*!40000 ALTER TABLE `email_verifications` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `migrations` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `migrations` WRITE;
/*!40000 ALTER TABLE `migrations` DISABLE KEYS */;
INSERT INTO `migrations` VALUES (1,'0001_01_01_000000_create_users_table',1),(2,'0001_01_01_000100_create_agencies_table',1),(3,'0001_01_01_000200_create_roles_table',1),(4,'0001_01_01_000300_create_email_verifications_table',1),(5,'0001_01_01_000400_create_otp_challenges_table',1),(6,'0001_01_01_000500_create_app_counters_table',1);
/*!40000 ALTER TABLE `migrations` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `otp_challenges`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `otp_challenges` (
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

LOCK TABLES `otp_challenges` WRITE;
/*!40000 ALTER TABLE `otp_challenges` DISABLE KEYS */;
/*!40000 ALTER TABLE `otp_challenges` ENABLE KEYS */;
UNLOCK TABLES;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
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

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES ('RL-01','Main Admin','main_admin','Full system control including agency creation and permissions.',1,'{\"agencies\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"users\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"roles\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"reports\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"billing\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true},\"settings\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":true}}'),('RL-02','Agency Owner','agency_owner','Manages a single agency, its staff and its data.',0,'{\"agencies\":{\"view\":true,\"create\":false,\"edit\":true,\"delete\":false},\"users\":{\"view\":true,\"create\":true,\"edit\":true,\"delete\":false},\"roles\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":true,\"create\":false,\"edit\":true,\"delete\":false},\"settings\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false}}'),('RL-03','Agency Manager','agency_manager','Day-to-day operations inside an agency, no billing access.',0,'{\"agencies\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"users\":{\"view\":true,\"create\":true,\"edit\":false,\"delete\":false},\"roles\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}'),('RL-04','Agent','agent','Handles assigned records only.',0,'{\"agencies\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"users\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"roles\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}'),('RL-05','Auditor','auditor','Read-only access across all agencies for compliance review.',0,'{\"agencies\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"users\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"roles\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"reports\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"billing\":{\"view\":true,\"create\":false,\"edit\":false,\"delete\":false},\"settings\":{\"view\":false,\"create\":false,\"edit\":false,\"delete\":false}}');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

SET FOREIGN_KEY_CHECKS=1;
