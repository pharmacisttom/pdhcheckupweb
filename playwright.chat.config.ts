import base from "./playwright.interest.config";
process.env.CHAT_ENABLED = "true";
process.env.CHAT_AI_ENABLED = "false";
process.env.EMAIL_PROVIDER = "disabled";
const config = { ...base, testMatch: "chat.spec.ts" };
export default config;
