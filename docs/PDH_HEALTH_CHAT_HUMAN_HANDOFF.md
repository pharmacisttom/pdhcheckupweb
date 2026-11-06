# Human handoff
States: bot -> queued -> active -> resolved/closed; authorized reopen queues again; transfer returns queue and cancels AI. Handoff reasons are stable codes. Emergency always displays hospital-provided 1669/do-not-wait instruction. When handoff disabled, no false queue success: mark resolved and direct official contact.

Explicit ChatAgent membership separate from User.department text. Accept/assign validates target active user with MFA in same department; prevent stealing assignment unless chat:assign. Reply/note only assigned agent. Transfer invalidates prior department access under row lock. Bot output generation is invalidated by takeover. Notes are encrypted and excluded publicly. Typing expires after5 seconds, emitted only by assigned active agent.

Queue position counts current waiting conversations; it is not a promised wait duration or clinical triage. Staff polling4 seconds/inbox10 seconds and queue count role=status. Desktop push notifications, presence availability and automatic SLA escalation remain future work.
