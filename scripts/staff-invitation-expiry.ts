import { expireInvitations } from "../src/server/services/staff-users";
import { db } from "../src/lib/db";
expireInvitations()
  .then((result) =>
    console.log("Expired invitation batch processed: " + result.processed),
  )
  .catch(() => {
    console.error("Invitation expiry batch failed; values withheld");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
