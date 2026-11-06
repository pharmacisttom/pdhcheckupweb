-- CreateTable
CREATE TABLE `ChatDepartment` (
    `id` VARCHAR(40) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAgent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(40) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `availableUntil` DATETIME(3) NULL,

    INDEX `ChatAgent_departmentId_active_idx`(`departmentId`, `active`),
    UNIQUE INDEX `ChatAgent_userId_departmentId_key`(`userId`, `departmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatConfiguration` (
    `id` VARCHAR(40) NOT NULL DEFAULT 'default',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `aiEnabled` BOOLEAN NOT NULL DEFAULT false,
    `handoffEnabled` BOOLEAN NOT NULL DEFAULT true,
    `noticeVersion` VARCHAR(80) NULL,
    `noticeText` TEXT NULL,
    `retentionDays` INTEGER NULL,
    `policyApprovedBy` VARCHAR(191) NULL,
    `policyApprovedAt` DATETIME(3) NULL,
    `monthlyTokenLimit` INTEGER NOT NULL DEFAULT 0,
    `monthlyRequestLimit` INTEGER NOT NULL DEFAULT 0,
    `monthlyBudgetUsd` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `slaMinutes` INTEGER NOT NULL DEFAULT 30,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatConversation` (
    `id` VARCHAR(191) NOT NULL,
    `ownerSessionId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(40) NOT NULL,
    `assignedAgentId` VARCHAR(191) NULL,
    `status` VARCHAR(24) NOT NULL DEFAULT 'bot',
    `noticeVersion` VARCHAR(80) NOT NULL,
    `lastSequence` INTEGER NOT NULL DEFAULT 0,
    `userMessageCount` INTEGER NOT NULL DEFAULT 0,
    `aiPending` BOOLEAN NOT NULL DEFAULT false,
    `generation` INTEGER NOT NULL DEFAULT 0,
    `pendingSince` DATETIME(3) NULL,
    `handoffReason` VARCHAR(40) NULL,
    `queuedAt` DATETIME(3) NULL,
    `acceptedAt` DATETIME(3) NULL,
    `firstReplyAt` DATETIME(3) NULL,
    `resolvedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatConversation_ownerSessionId_createdAt_idx`(`ownerSessionId`, `createdAt`),
    INDEX `ChatConversation_departmentId_status_createdAt_idx`(`departmentId`, `status`, `createdAt`),
    INDEX `ChatConversation_expiresAt_deletedAt_idx`(`expiresAt`, `deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatMessage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `clientId` VARCHAR(80) NOT NULL,
    `authorType` VARCHAR(20) NOT NULL,
    `authorId` VARCHAR(191) NULL,
    `bodyEncrypted` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatMessage_conversationId_clientId_key`(`conversationId`, `clientId`),
    UNIQUE INDEX `ChatMessage_conversationId_sequence_key`(`conversationId`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAssignment` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `targetAgentId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(40) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatAssignment_conversationId_createdAt_idx`(`conversationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatFeedback` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `commentEncrypted` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatFeedback_conversationId_key`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatKnowledge` (
    `id` VARCHAR(191) NOT NULL,
    `topicKey` VARCHAR(100) NOT NULL,
    `departmentId` VARCHAR(40) NOT NULL,
    `category` VARCHAR(80) NOT NULL,
    `clinical` BOOLEAN NOT NULL DEFAULT false,
    `visibility` VARCHAR(20) NOT NULL DEFAULT 'public',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ChatKnowledge_departmentId_topicKey_key`(`departmentId`, `topicKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatKnowledgeVersion` (
    `id` VARCHAR(191) NOT NULL,
    `knowledgeId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `question` VARCHAR(500) NOT NULL,
    `answer` TEXT NOT NULL,
    `keywords` JSON NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
    `authorId` VARCHAR(191) NOT NULL,
    `reviewerId` VARCHAR(191) NULL,
    `publisherId` VARCHAR(191) NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `documentName` VARCHAR(191) NULL,
    `documentHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatKnowledgeVersion_status_startsAt_expiresAt_idx`(`status`, `startsAt`, `expiresAt`),
    UNIQUE INDEX `ChatKnowledgeVersion_knowledgeId_version_key`(`knowledgeId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatKnowledgeChunk` (
    `id` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `text` TEXT NOT NULL,

    UNIQUE INDEX `ChatKnowledgeChunk_versionId_position_key`(`versionId`, `position`),
    FULLTEXT INDEX `ChatKnowledgeChunk_text_idx`(`text`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatKnowledgeCitation` (
    `id` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `versionId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `ChatKnowledgeCitation_messageId_versionId_key`(`messageId`, `versionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChatAIUsage` (
    `id` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(30) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'reserved',
    `reservedTokens` INTEGER NOT NULL,
    `reservedUsd` DECIMAL(12, 4) NOT NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `estimatedCostUsd` DECIMAL(12, 6) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ChatAIUsage_createdAt_status_idx`(`createdAt`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ChatAgent` ADD CONSTRAINT `ChatAgent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAgent` ADD CONSTRAINT `ChatAgent_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `ChatDepartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatConversation` ADD CONSTRAINT `ChatConversation_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `ChatDepartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatConversation` ADD CONSTRAINT `ChatConversation_assignedAgentId_fkey` FOREIGN KEY (`assignedAgentId`) REFERENCES `ChatAgent`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatMessage` ADD CONSTRAINT `ChatMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAssignment` ADD CONSTRAINT `ChatAssignment_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatFeedback` ADD CONSTRAINT `ChatFeedback_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatKnowledge` ADD CONSTRAINT `ChatKnowledge_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `ChatDepartment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatKnowledgeVersion` ADD CONSTRAINT `ChatKnowledgeVersion_knowledgeId_fkey` FOREIGN KEY (`knowledgeId`) REFERENCES `ChatKnowledge`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatKnowledgeChunk` ADD CONSTRAINT `ChatKnowledgeChunk_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ChatKnowledgeVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatKnowledgeCitation` ADD CONSTRAINT `ChatKnowledgeCitation_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `ChatMessage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatKnowledgeCitation` ADD CONSTRAINT `ChatKnowledgeCitation_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `ChatKnowledgeVersion`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ChatAIUsage` ADD CONSTRAINT `ChatAIUsage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `ChatConversation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO ChatDepartment (id,name,active,createdAt) VALUES ('health_check','Health Check',true,CURRENT_TIMESTAMP(3)),('general_info','General Information',true,CURRENT_TIMESTAMP(3));
INSERT INTO ChatConfiguration (id,updatedAt) VALUES ('default',CURRENT_TIMESTAMP(3));
