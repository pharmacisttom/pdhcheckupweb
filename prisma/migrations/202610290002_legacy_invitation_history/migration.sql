-- Immediately follows the additive migration, before new application activation.
-- Old consumedAt cannot distinguish activation from superseded invitations.
UPDATE UserInvitation SET status='legacy_consumed' WHERE status='accepted' AND consumedAt IS NOT NULL;
