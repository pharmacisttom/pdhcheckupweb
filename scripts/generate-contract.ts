import fs from "node:fs";
const read = [
  "health",
  "auth/me",
  "packages",
  "services",
  "questionnaire",
  "registrations/draft",
  "slots",
  "booking-policy",
  "contact-requests",
  "admin/booking-policy",
  "admin/contact-requests",
  "bookings",
  "admin/dashboard",
  "admin/bookings",
  "admin/packages",
  "admin/imports",
  "admin/organizations",
  "admin/quotations",
  "admin/reports",
  "admin/audit",
  "admin/privacy",
];
const write = [
  "auth/guest",
  "auth/login",
  "auth/logout",
  "auth/change-password",
  "otp/request",
  "otp/verify",
  "registrations",
  "quotes",
  "holds",
  "contact-requests",
  "admin/booking-policy",
  "admin/contact-requests/status",
  "bookings",
  "bookings/{id}/cancel",
  "privacy/requests",
  "admin/bookings/status",
  "admin/checkin",
  "admin/packages",
  "admin/packages/status",
  "admin/slots",
  "admin/imports",
  "admin/imports/approve",
  "admin/organizations",
  "admin/reports/export",
];
const schemas = {
  Person: {
    type: "object",
    required: ["firstName", "lastName", "birthdate", "phone"],
    properties: {
      firstName: { type: "string", maxLength: 100 },
      lastName: { type: "string", maxLength: 100 },
      birthdate: { type: "string", format: "date" },
      phone: { type: "string" },
      documentType: { type: "string", enum: ["none", "thai_id", "passport"] },
      identifier: { type: "string", maxLength: 50 },
    },
  },
  QuoteRequest: {
    type: "object",
    required: ["packageId", "addonIds"],
    properties: {
      packageId: { type: "string" },
      addonIds: { type: "array", maxItems: 50, items: { type: "string" } },
    },
  },
  ConfirmRequest: {
    type: "object",
    required: [
      "registrationId",
      "holdId",
      "quoteId",
      "fingerprint",
      "idempotencyKey",
      "privacyAcknowledged",
    ],
    properties: {
      registrationId: { type: "string" },
      holdId: { type: "string" },
      quoteId: { type: "string" },
      fingerprint: { type: "string", minLength: 64, maxLength: 64 },
      idempotencyKey: { type: "string", format: "uuid" },
      privacyAcknowledged: { type: "boolean", const: true },
    },
  },
};
const paths: Record<string, Record<string, unknown>> = {};
for (const [method, list] of [
  ["get", read],
  ["post", write],
] as const)
  for (const path of list) {
    const entry = (paths["/api/v1/" + path] ??= {});
    entry[method] = {
      operationId: method + "_" + path.replace(/[^a-z0-9]/gi, "_"),
      summary: path,
      security:
        path.startsWith("admin/") ||
        ["bookings", "auth/me", "registrations/draft"].includes(path)
          ? [{ sessionCookie: [] }]
          : [],
      ...(path.includes("{id}")
        ? {
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
          }
        : {}),
      ...(method === "post"
        ? {
            parameters: [
              {
                name: "Origin",
                in: "header",
                required: true,
                schema: { type: "string" },
              },
            ],
            requestBody: {
              required: true,
              content: {
                [path === "admin/imports"
                  ? "multipart/form-data"
                  : "application/json"]: {
                  schema:
                    path === "quotes"
                      ? { $ref: "#/components/schemas/QuoteRequest" }
                      : path === "bookings"
                        ? { $ref: "#/components/schemas/ConfirmRequest" }
                        : {
                            type: "object",
                            description:
                              "See Zod request schema in src/server/api.ts for full validation",
                          },
                },
              },
            },
          }
        : {}),
      responses: {
        "200": { description: "Envelope: data and correlationId" },
        "401": { description: "Authentication required" },
        "403": { description: "Permission or origin denied" },
        "409": {
          description: "Capacity, state, price or idempotency conflict",
        },
        "422": { description: "Validation failed" },
        "429": { description: "Rate limited" },
        "503": { description: "Dependency unconfigured or unavailable" },
      },
    };
  }
fs.writeFileSync(
  "docs/openapi.json",
  JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: "PDH Smart Health Check API",
        version: "1.0.0-development",
        description:
          "Core schemas included; remaining request details are authoritative in Zod source. Not a complete enterprise API contract.",
      },
      servers: [{ url: "http://localhost:3000" }],
      paths,
      components: {
        securitySchemes: {
          sessionCookie: { type: "apiKey", in: "cookie", name: "pdh_session" },
        },
        schemas,
      },
    },
    null,
    2,
  ) + "\n",
);
