import {redactExpiredChat} from "../src/server/services/chat/router";
import {db} from "../src/lib/db";
redactExpiredChat().then(r=>console.log("Chat retention batch processed: "+r.processed)).catch(()=>{console.error("Chat retention failed; values withheld");process.exitCode=1;}).finally(()=>db.$disconnect());
