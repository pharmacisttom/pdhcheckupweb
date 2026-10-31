-- AlterTable
ALTER TABLE `Service` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Questionnaire` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Slot` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Organization` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Invoice` ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `PrivacyRequest` ADD COLUMN `assigneeId` VARCHAR(191) NULL,
    ADD COLUMN `identityVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `identityVerifiedBy` VARCHAR(191) NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Waitlist` ADD COLUMN `assigneeId` VARCHAR(191) NULL,
    ADD COLUMN `bookingId` VARCHAR(191) NULL,
    ADD COLUMN `noteEncrypted` TEXT NULL,
    ADD COLUMN `revision` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `FinanceEntry` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `idempotencyKey` VARCHAR(100) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `previous` JSON NOT NULL,
    `result` JSON NOT NULL,
    `reasonEncrypted` TEXT NOT NULL,
    `referenceEncrypted` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `FinanceEntry_idempotencyKey_key`(`idempotencyKey`),
    INDEX `FinanceEntry_invoiceId_createdAt_idx`(`invoiceId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrivacyCaseEvent` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(40) NOT NULL,
    `previousStatus` VARCHAR(40) NOT NULL,
    `nextStatus` VARCHAR(40) NOT NULL,
    `noteEncrypted` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PrivacyCaseEvent_requestId_createdAt_idx`(`requestId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FinanceEntry` ADD CONSTRAINT `FinanceEntry_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PrivacyCaseEvent` ADD CONSTRAINT `PrivacyCaseEvent_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `PrivacyRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

