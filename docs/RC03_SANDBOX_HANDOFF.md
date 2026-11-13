# RC03 sandbox handoff

The sandbox is the same application and real CRUD/API/RBAC path, isolated to a local MySQL database. It contains no production credentials, patient data, SMS, email, or external AI provider.

```powershell
npm ci
npm run sandbox:init
docker compose -f compose.sandbox.yml up -d --wait
npm run sandbox:prepare
npm run sandbox:dev
```

Open `http://localhost:33318/sandbox`. The generated administrator credentials are stored only in the ignored `.env.sandbox`; enroll MFA through the normal staff flow. Keep the named volume for continuity. Use `docker compose -f compose.sandbox.yml down` to stop it; do not use `down -v` unless the sandbox data is intentionally disposable.

The sandbox landing page links to every existing back-office module and records the privacy test checklist. It does not create a second schema or replace the production application.

