CREATE TABLE `TotpStepUse` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(32) NOT NULL,
  `timeStep` INTEGER NOT NULL,
  `consumedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `TotpStepUse_userId_purpose_timeStep_key` (`userId`, `purpose`, `timeStep`),
  INDEX `TotpStepUse_consumedAt_idx` (`consumedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `TotpStepUse_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
