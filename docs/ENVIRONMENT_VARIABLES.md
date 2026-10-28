# Environment variables

Never commit environment values. .env.example contains names/placeholders only. Local Windows: npm ci; npm run db:generate; copy .env.example to .env; configure a local MySQL 8 development database and independently generated secrets; run npm run dev. Use PowerShell and protect .env with Windows ACLs. scripts/setup-local-db.ps1 and compose.yaml describe existing local database setup. Read them before provisioning. Do not seed production. Synthetic local demos require explicit SEED_DEMO=true outside production.

| Name | Production | Staging |
| --- | --- | --- |
| DATABASE_URL | mysql URL, pdhcheckup_prod, pdh_healthcheck | separate pdhcheckup_stg, pdh_healthcheck_staging |
| NODE_ENV | production | production |
| HOSTNAME | 127.0.0.1 | 127.0.0.1 |
| PORT | 3036 | 3037 |
| APP_URL | https://pdhcheckup.pluakdaenghospital.cloud | distinct approved HTTPS origin |
| DATA_ENCRYPTION_KEY | independent 64 hex characters | independent 64 hex characters |
| OTP_PEPPER | independent random secret, >=32 characters | independent random secret, >=32 characters |
| OTP_PROVIDER | unconfigured until a real adapter is implemented | unconfigured |
| SEED_DEMO | false | false |

Use only simple dotenv assignments, with quoted values where needed, compatible with Node --env-file, Next.js and systemd EnvironmentFile. Avoid variable interpolation. Deployment removes inherited application variables before loading the protected file. PORT/HOSTNAME must reach the standalone process environment. Keep database URL passwords URL-encoded. Database grants must be restricted to the selected schema; migrate deploy needs reviewed DDL privileges. Backup credentials belong in a separate mode-600 MySQL client option file.

Operator-only: OPERATOR_EMAIL, OPERATOR_PASSWORD, OPERATOR_ROLE, OPERATOR_NAME, MFA_ENROLLMENT_FILE; explicit OPERATOR_ROTATE_EXISTING=true authorizes replacing an existing account. MFA_QR_FILE selects private local PNG output. Do not store these in a shared runtime environment. Never print environment files, put passwords in command arguments or log enrollment URIs.
