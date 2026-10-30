# Operations
Health Chat has independent env+database kill switches. Monitor queue metadata, SLA target (not automatic escalation), unmatched/conflict counts, expiring knowledge, provider failures, reservation and actual token fields. Staff should keep inbox open during staffed hours; widget does not promise staff availability. Reports <=366days/20000 conversations or explicit error. Null wait/cost means unknown, not zero. CSV/XLSX exports are aggregate snapshots only.

Run npm run chat:retention with existing protected environment; command processes100 expired conversations and prints count only. Repeat/schedule after policy approval; no task auto-installed. Backups may still contain ciphertext; encryption key lifecycle and backup expiry must match hospital policy. No log-body debug mode.

Open issues: catalogue price binding currently conservative handoff; semantic retrieval extension; staff presence/push/SLA notifications; broader multilingual chat wording; standalone runtime parser packaging verification; budget stress and real-provider contract; full staff browser UAT and physical devices. Keep service disabled until required acceptance completed.
