import { pruneSecurityEvents } from "../src/server/services/security-events";

const result = await pruneSecurityEvents(90);
console.log(JSON.stringify({ deletedSecurityEvents: result.events.count, deletedTotpSteps: result.totpSteps.count, securityEventRetentionDays: 90, totpReplayRetentionDays: 7 }));
