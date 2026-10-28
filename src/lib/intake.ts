export const PRIVACY_VERSION = "2026-10-28-v1";
export const requestTransitions: Record<string, string[]> = {
  pending: ["contacted", "under_review", "awaiting_information", "closed"],
  contacted: [
    "under_review",
    "awaiting_information",
    "ready_to_schedule",
    "closed",
  ],
  submitted: ["under_review", "awaiting_information", "closed"],
  under_review: ["awaiting_information", "ready_to_schedule", "closed"],
  awaiting_information: ["under_review", "closed"],
  ready_to_schedule: ["under_review", "awaiting_information", "closed"],
  scheduled: ["closed"],
  closed: [],
};
export const canReviewTransition = (from: string, to: string) =>
  from === to || !!requestTransitions[from]?.includes(to);
