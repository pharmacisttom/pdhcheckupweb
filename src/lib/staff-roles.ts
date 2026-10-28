export const staffRoles = [
  "registration",
  "manager",
  "laboratory",
  "finance",
  "clinician",
  "dpo",
  "auditor",
  "coordinator",
  "superadmin",
] as const;
export function staffLanding(role: string) {
  const pages: Record<string, string> = {
    laboratory: "lab-pricing",
    clinician: "questionnaires",
    dpo: "privacy",
    auditor: "audit",
    coordinator: "change-password",
  };
  return "/admin/" + (pages[role] ?? "dashboard");
}
