# Conservative approved-evidence assistant
Local retrieval requires exact normalized question or two distinct approved keywords. Conflicting answers, absence, >500 eligible versions, personal health/medication, emergency, complaints and unbound price text hand off. Only published, public, active department, started and unexpired versions are eligible. Answers are exact approved extracts, not generated clinical prose.

Provider disabled default. Optional OpenAI Responses or HTTPS compatible endpoint can select only allowlisted evidence ID from already-public candidates. Raw user message/history is never accepted by provider function. 6000-byte candidate payload, 8-second timeout, 32768-byte response cap, 128 output tokens, one attempt/no retries. Failure uses same locally validated extract. Completion transaction rechecks publication, expiry, policy, kill switches and human generation before delivery.

Monthly request/token/USD reservation under configuration lock. 8192 tokens reserved per attempt and configured maximum call USD; reservations remain after failure. Usage numbers are provider-reported or null; actual cost is unknown, never estimated from invented rates. No live provider calls have been made. Provider configuration, legal approval and model-compatible contract test required before enabling.

Official protocol reference: https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses . Semantic/vector ranking and current catalogue price binding are not implemented; prices conservatively hand off. No confidence percentage is presented.
