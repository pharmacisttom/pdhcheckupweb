CREATE TABLE `SecurityEvent` (
  `id` VARCHAR(191) NOT NULL,
  `dedupKey` CHAR(64) NOT NULL,
  `eventType` VARCHAR(40) NOT NULL,
  `subjectHash` CHAR(64) NOT NULL,
  `routeGroup` VARCHAR(80) NOT NULL,
  `windowStartedAt` DATETIME(3) NOT NULL,
  `lastSeenAt` DATETIME(3) NOT NULL,
  `occurrenceCount` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SecurityEvent_dedupKey_key` (`dedupKey`),
  INDEX `SecurityEvent_createdAt_idx` (`createdAt`),
  INDEX `SecurityEvent_eventType_createdAt_idx` (`eventType`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
