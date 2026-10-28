-- Additive: legacy users/sessions retain their state. Never reset existing MFA.
ALTER TABLE `User`
  ADD COLUMN `activationRequired` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `mustChangePassword` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `Session`
  ADD COLUMN `stage` VARCHAR(20) NOT NULL DEFAULT 'full',
  ADD COLUMN `pendingMfaSecret` TEXT NULL;
CREATE TABLE `UserInvitation` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` CHAR(64) NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdBy` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UserInvitation_tokenHash_key` (`tokenHash`),
  INDEX `UserInvitation_userId_expiresAt_idx` (`userId`, `expiresAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UserInvitation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
