ALTER TABLE ContactRequest
 ADD COLUMN assignedTo VARCHAR(191) NULL,
 ADD COLUMN entitlementStatus VARCHAR(30) NOT NULL DEFAULT 'unverified',
 ADD COLUMN reviewEncrypted LONGTEXT NULL,
 ADD COLUMN quoteId VARCHAR(191) NULL,
 ADD COLUMN bookingId VARCHAR(191) NULL,
 ADD COLUMN acceptedSlotId VARCHAR(191) NULL,
 ADD COLUMN acceptedFingerprint CHAR(64) NULL,
 ADD COLUMN acceptedAt DATETIME(3) NULL,
 ADD UNIQUE INDEX ContactRequest_bookingId_key (bookingId);
