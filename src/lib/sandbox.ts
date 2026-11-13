export function sandboxEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (env.PDH_SANDBOX_MODE !== "true") return false;
  const url = new URL(env.DATABASE_URL ?? "mysql://invalid/invalid");
  if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/pdh_healthcheck_sandbox" ||
      env.OTP_PROVIDER !== "disabled" || env.EMAIL_PROVIDER !== "disabled" ||
      env.CHAT_AI_ENABLED === "true") {
    throw new Error("Sandbox requires its isolated localhost database and disabled external providers");
  }
  return true;
}
