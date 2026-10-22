-- CreateTable
CREATE TABLE `Waitlist` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `dayId` VARCHAR(10) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'waiting',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Waitlist_dayId_status_createdAt_idx`(`dayId`, `status`, `createdAt`),
    UNIQUE INDEX `Waitlist_sessionId_dayId_key`(`sessionId`, `dayId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingChange` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(100) NOT NULL,
    `requestHash` CHAR(64) NOT NULL,
    `previousSlotId` VARCHAR(191) NOT NULL,
    `newSlotId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BookingChange_idempotencyKey_key`(`idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
