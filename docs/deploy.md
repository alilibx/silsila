# Deploying Silsila

Two things are deployed, and they are independent:

| Part                                | Where                           | How it ships                                               |
| ----------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Backend (`convex/`)                 | Convex production, EU West (Ireland) | `pnpm exec convex deploy` from CI on every push to `main` |
| Web app (`apps/web`, Vite + React)  | Vercel project `silsila-web`    | Vercel's Git integration, root directory `apps/web`        |

Nothing here is created yet. Until it is, development and the end-to-end test run entirely on the local anonymous Convex backend (see the README).

## Environment variables

Names only. Values never go in the repo.

### Convex production deployment

Set in the Convex dashboard (Settings, Environment Variables) or with `pnpm exec convex env set --prod NAME`.

| Name                       | What it is for                                                                                                          | How to rotate                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SILSILA_ENV`              | `prod` in production. Only the exact value `dev` relaxes anything (dev message logging, `dev:simulateIncoming`).         | Not a secret. Never set it to `dev` on production.                                                                                                             |
| `SITE_URL`                 | The public site origin, no trailing slash. Used for links in WhatsApp messages and as the allowed CORS origin of `/api/verification/start`. | Change it when the domain changes. It is read at runtime, so no redeploy is needed.                                                                               |
| `WHATSAPP_PUBLIC_NUMBER`   | The business number, digits only, that the `wa.me` link opens.                                                          | Not a secret. Change if the business number changes.                                                                                                            |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta's ID of that number, used to send replies and to ignore messages meant for other numbers.                          | Not a secret. Change only if the number is replaced in Meta.                                                                                                    |
| `WHATSAPP_ACCESS_TOKEN`    | Long-lived system-user token that sends replies through the Graph API.                                                  | Create a new token in Meta Business Settings (system user), set it in Convex, confirm a real verification still gets a reply, then revoke the old token.        |
| `WHATSAPP_APP_SECRET`      | Meta app secret. Verifies the `X-Hub-Signature-256` signature on every webhook call.                                    | Reset it in the Meta app (Settings, Basic), then set the new value in Convex straight away. Webhook calls fail the signature check in between, and Meta retries. |
| `WHATSAPP_VERIFY_TOKEN`    | A string we choose. Meta sends it back during the webhook subscription handshake.                                       | Pick a new random string, set it in Convex, then save the webhook again in Meta with the same string (Meta repeats the handshake).                              |
| `WHATSAPP_GRAPH_VERSION`   | The Graph API version used in send URLs.                                                                                | Not a secret. Move to a newer supported version before the current one is retired, and check that sending still works.                                           |

Production answers `whatsapp_not_configured` from `/api/verification/start` until all seven `WHATSAPP_*` / `SITE_URL` values are set. The site then shows "التحقق عبر واتساب غير متاح الآن. نعمل على إصلاحه." and nobody can sign in. That is the expected state before ARQ-246 is finished.

### Vercel project `silsila-web`

Build-time and public (they end up in the browser bundle). Changing one needs a redeploy.

| Name                   | What it is for                                         | How to rotate                                                |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| `VITE_CONVEX_URL`      | Production Convex client URL, `https://<prod>.convex.cloud`. | Not a secret. Update only if the deployment is replaced.     |
| `VITE_CONVEX_SITE_URL` | Production HTTP actions URL, `https://<prod>.convex.site`.   | Not a secret. Update only if the deployment is replaced.     |

### GitHub repository secret

| Name                | What it is for                                                                                           | How to rotate                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY` | Lets the `deploy` job in `.github/workflows/ci.yml` push functions to the production deployment. Secret. | Generate a new production deploy key in the Convex dashboard (Settings, URL and Deploy Key), replace the secret, delete the old key. |

While the secret is absent, the `deploy` job logs a notice and skips every other step, so merging to `main` stays green.

### Local only

`CONVEX_DEPLOYMENT`, `CONVEX_URL` and `CONVEX_SITE_URL` in `.env.local` point at the local anonymous backend (git-ignored). `pnpm e2e` sets `SILSILA_ENV=dev`, `SITE_URL` and `WHATSAPP_PUBLIC_NUMBER` on that local backend itself and refuses to run if a WhatsApp token is set there.

## Checklist (Ali)

These need accounts and real systems, so they are not automated.

1. **Create the production Convex deployment.** New project in the Convex dashboard, production deployment in **EU West (Ireland)**. Note the two URLs: `https://<prod>.convex.cloud` and `https://<prod>.convex.site`.
2. **Deploy key to GitHub.** In the deployment settings generate a production deploy key. In the GitHub repository add it as the secret `CONVEX_DEPLOY_KEY`. Merge to `main` (or re-run the `deploy` job) and confirm the functions arrive.
3. **Set the Convex production environment.** `SILSILA_ENV=prod` and `SITE_URL=https://<domain>` now. The `WHATSAPP_*` values wait for step 6.
4. **Create the Vercel project `silsila-web`.** Import the GitHub repository, set **Root Directory** to `apps/web`, and keep "Include source files outside of the Root Directory" enabled: the web app imports types and helpers from `convex/` through the `@convex` alias. Framework preset Vite. Set `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` for Production. `apps/web/vercel.json` already rewrites every path to `/index.html` and sets the security headers.
5. **Point the domain** at Vercel (ARQ-249), then make sure `SITE_URL` in Convex matches the final origin exactly.
6. **WhatsApp setup (ARQ-246).** In the Meta app, set the webhook callback URL to `https://<prod>.convex.site/whatsapp/webhook` and the verify token to the value of `WHATSAPP_VERIFY_TOKEN`, then subscribe to `messages`. Set the six `WHATSAPP_*` variables in Convex production.
7. **Real-phone test.** On a real phone open the production site, start a khatma, press the WhatsApp button, send the ready-made message, confirm "نعم، هذا رقمي", then create a khatma, take a juz', and finish it. Repeat with a second phone using the invite link.

## First cloud deploy: check the client IP

The per-IP limit on `/api/verification/start` relies on `ctx.meta.getRequestMetadata()` returning the real client IP (falling back to the first `X-Forwarded-For` entry). The local backend takes it from a client-supplied header, so it proves nothing about the cloud. After the first cloud deploy, send start requests from two different networks and look at the `rateLimits` table in the dashboard: keys named `verifyStart:ip:<address>` must show two different, real client addresses. If there is only one address (a proxy) or none, the per-IP limit does nothing and only the global limit protects the endpoint. Decide then whether to read another header or add a stricter global cap.

## Data retention

Client IP addresses exist only inside rate-limit keys. They are kept for at most 24 hours (the length of their window) and are purged by an hourly cron (`convex/crons.ts`, `maintenance:purge`). The same job deletes phone numbers from verifications after 24 hours and WhatsApp message IDs after 7 days.

## Follow-ups

- **Content-Security-Policy.** `vercel.json` has no CSP on purpose: it must allow the Convex origins (`https://*.convex.cloud` for the client, including `wss:`) and the Google Fonts origins, and a wrong CSP breaks the site silently. Add one deliberately, in report-only mode first.
- **End-to-end test in CI.** `pnpm e2e` runs only on a developer machine. CI would need the Playwright Chromium install and the Convex local backend binary download.
- **Manifest icons.** `apps/web/public/manifest.webmanifest` has no icons yet, so "add to home screen" gets a generic icon.
