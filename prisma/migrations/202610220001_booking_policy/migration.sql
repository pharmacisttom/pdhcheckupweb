CREATE TABLE `BookingPolicy` (
  `id` VARCHAR(30) NOT NULL,
  `onlineEnabled` BOOLEAN NOT NULL DEFAULT true,
  `message` VARCHAR(1000) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `BookingPolicy` (`id`, `onlineEnabled`, `message`, `updatedAt`)
VALUES ('default', true, 'ขณะนี้ปิดรับนัดออนไลน์ชั่วคราว กรุณาส่งข้อมูลให้เจ้าหน้าที่ติดต่อเพื่อนัดรับบริการ', CURRENT_TIMESTAMP(3));

CREATE TABLE `ContactRequest` (
  `id` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(40) NOT NULL,
  `registrationId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `payloadEncrypted` LONGTEXT NOT NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `noteEncrypted` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ContactRequest_reference_key` (`reference`),
  UNIQUE INDEX `ContactRequest_registrationId_key` (`registrationId`),
  INDEX `ContactRequest_sessionId_idx` (`sessionId`),
  INDEX `ContactRequest_status_createdAt_idx` (`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
