# Rollback
Immediate disable: manager aiEnabled=false or service enabled=false; operator CHAT_AI_ENABLED=false / CHAT_ENABLED=false and restart existing service. Current completion transaction checks kill switch configuration; human takeover also invalidates generation. Confirm disabled public config.

Rollback application to previous reviewed release using existing deployment procedure; preserve additive Chat tables and migration history. Do not drop schema or restore full DB over newer bookings. New tables are independent of core registration/booking. Preserve encryption keys for retained chat, approved audit/backup policy. Verify old public booking and staff login smoke tests. Never fabricate migration rollback SQL for already-created production data.
