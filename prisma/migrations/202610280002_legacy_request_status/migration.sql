ALTER TABLE ContactRequest ADD COLUMN legacyStatus VARCHAR(30) NULL;
-- Preserve the previous manual label without representing it as a confirmed Booking.
UPDATE ContactRequest SET legacyStatus = status, status = 'under_review'
WHERE status = 'scheduled' AND bookingId IS NULL;
