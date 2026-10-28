# Deploying Wirdak

Two things are deployed, and they ship together from one Vercel build (Convex's documented Vercel integration):

| Part                               | Where                                | How it ships                                                        |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| Backend (`convex/`)                | Convex production, EU West (Ireland) | `convex deploy`, run first by the Vercel build command              |
| Web app (`apps/web`, Vite + React) | Vercel project `wirdak-web`         | Vercel's Git integration, root directory `apps/web`, same build     |

The build command lives in `apps/web/vercel.json`:

```sh
cd ../.. && pnpm exec convex deploy --cmd 'pnpm --filter web build' --cmd-url-env-var-name VITE_CONVEX_URL
```

Vercel runs it from the root directory `apps/web`, so it first moves to the repository root (where `convex/` and the `convex` CLI live). `convex deploy` pushes the functions to the deployment that `CONVEX_DEPLOY_KEY` belongs to, then runs `pnpm --filter web build` with `VITE_CONVEX_URL` set to that deployment's URL, and Vercel serves `apps/web/dist`. If the push fails, the web build never runs, so the site and its backend cannot drift apart. The web app derives the HTTP actions URL (`https://<name>.convex.site`) from `VITE_CONVEX_URL` (`https://<name>.convex.cloud`) when `VITE_CONVEX_SITE_URL` is unset (`apps/web/src/lib/env.ts`).

GitHub Actions (`.github/workflows/ci.yml`) only checks: install, typecheck, lint, test, and `pnpm --filter web build`. It deploys nothing and needs no secrets.

Nothing here is created yet. Until it is, development and the end-to-end test run entirely on the local anonymous Convex backend (see the README).

## Environment variables

Names only. Values never go in the repo.

### Convex production deployment

Set in the Convex dashboard (Settings, Environment Variables) or with `pnpm exec convex env set --prod NAME <value>` (the value is required).

| Name                       | What it is for                                                                                                          | How to rotate                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIRDAK_ENV`              | `prod` in production. Only the exact value `dev` relaxes anything (dev message logging, `dev:simulateIncoming`).         | Not a secret. Never set it to `dev` on production.                                                                                                             |
| `SITE_URL`                 | The public site origin, no trailing slash. Used for links in WhatsApp messages and as the allowed CORS origin of `/api/verification/start`. | Change it when the domain changes. It is read at runtime, so no redeploy is needed.                                                                               |
| `WHATSAPP_PUBLIC_NUMBER`   | The business number, digits only, that the `wa.me` link opens.                                                          | Not a secret. Change if the business number changes.                                                                                                            |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta's ID of that number, used to send replies and to ignore messages meant for other numbers.                          | Not a secret. Change only if the number is replaced in Meta.                                                                                                    |
| `WHATSAPP_ACCESS_TOKEN`    | Long-lived system-user token that sends replies through the Graph API.                                                  | Create a new token in Meta Business Settings (system user), set it in Convex, confirm a real verification still gets a reply, then revoke the old token.        |
| `WHATSAPP_APP_SECRET`      | Meta app secret. Verifies the `X-Hub-Signature-256` signature on every webhook call.                                    | Reset it in the Meta app (Settings, Basic), then set the new value in Convex straight away. Webhook calls fail the signature check in between, and Meta retries. |
| `WHATSAPP_VERIFY_TOKEN`    | A string we choose. Meta sends it back during the webhook subscription handshake.                                       | Pick a new random string, set it in Convex, then save the webhook again in Meta with the same string (Meta repeats the handshake).                              |
| `WHATSAPP_GRAPH_VERSION`   | The Graph API version used in send URLs.                                                                                | Not a secret. Move to a newer supported version before the current one is retired, and check that sending still works.                                           |

Production answers `whatsapp_not_configured` from `/api/verification/start` until all seven `WHATSAPP_*` / `SITE_URL` values are set. The site then shows "التحقق عبر واتساب غير متاح الآن. نعمل على إصلاحه." and nobody can sign in. That is the expected state before ARQ-246 is finished.

### Vercel project `wirdak-web`

| Name                   | Environment | What it is for                                                                                                                         | How to rotate                                                                                                                                  |
| ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY`    | Production  | Lets the build command push functions to the production deployment and tells `convex deploy` which deployment that is. Secret.          | Generate a new production deploy key in the Convex dashboard (Settings, URL and Deploy Key), replace the Vercel variable, redeploy, then delete the old key. |
| `VITE_CONVEX_SITE_URL` | optional    | Only needed if the HTTP actions URL is not the `.convex.site` twin of the client URL (for example a custom domain). Public.              | Not a secret. Change it and redeploy.                                                                                                           |

`VITE_CONVEX_URL` is not set by hand: `convex deploy --cmd-url-env-var-name VITE_CONVEX_URL` provides it to the build. Anything starting with `VITE_` ends up in the browser bundle, so only public values may use that prefix.

Preview deployments (pull requests) also run the build command. Without a key for the Preview environment `convex deploy` fails and the preview build fails with it. Either add a Convex **preview** deploy key as `CONVEX_DEPLOY_KEY` for Preview (each branch then gets its own preview backend), or turn off preview deployments in Vercel. Never give Preview the production key.

There is no GitHub secret: CI deploys nothing.

### Local only

`CONVEX_DEPLOYMENT`, `CONVEX_URL` and `CONVEX_SITE_URL` in `.env.local` point at the local anonymous backend (git-ignored). `pnpm e2e` sets `WIRDAK_ENV=dev`, `SITE_URL` and `WHATSAPP_PUBLIC_NUMBER` on that local backend itself and refuses to run if a WhatsApp token is set there.

## Checklist (Ali)

These need accounts and real systems, so they are not automated.

1. **Create the production Convex deployment.** New project in the Convex dashboard, production deployment in **EU West (Ireland)**. Note the two URLs: `https://<prod>.convex.cloud` and `https://<prod>.convex.site`.
2. **Set the Convex production environment.** `pnpm exec convex env set --prod WIRDAK_ENV prod` and `pnpm exec convex env set --prod SITE_URL https://wirdak.app` (or the same in the dashboard). The `WHATSAPP_*` values wait for step 6.
3. **Generate a production deploy key** in the deployment settings (Settings, URL and Deploy Key).
4. **Create the Vercel project `wirdak-web`.** Import the GitHub repository, set **Root Directory** to `apps/web`, and keep "Include source files outside of the Root Directory" enabled: the web app imports types and helpers from `convex/` through the `@convex` alias, and the build command runs from the repository root. Framework preset Vite. `apps/web/vercel.json` sets the build command and output directory, rewrites every path to `/index.html`, and sets the security headers; leave the build and output settings in the dashboard on their defaults so the file wins. Add `CONVEX_DEPLOY_KEY` (from step 3) for the **Production** environment only, and decide about previews (see above). Deploy, and confirm in the build log that `convex deploy` pushed the functions before the Vite build ran.
5. **Point the domain** `wirdak.app` at Vercel (ARQ-249), then make sure `SITE_URL` in Convex is exactly `https://wirdak.app`. The admin panel (plan 2) will live at `admin.wirdak.app` as its own Vercel project.
6. **WhatsApp setup (ARQ-246).** In the Meta app, set the webhook callback URL to `https://<prod>.convex.site/whatsapp/webhook` and the verify token to the value of `WHATSAPP_VERIFY_TOKEN`, then subscribe to `messages`. Set the six `WHATSAPP_*` variables in Convex production.
7. **Real-phone test.** On a real phone open the production site, start a khatma, press the WhatsApp button, send the ready-made message, confirm "نعم، هذا رقمي", then create a khatma, take a juz', and finish it. Repeat with a second phone using the invite link.

## First cloud deploy: check the client IP

The per-IP limit on `/api/verification/start` relies on `ctx.meta.getRequestMetadata()` returning the real client IP (falling back to the first `X-Forwarded-For` entry). The local backend takes it from a client-supplied header, so it proves nothing about the cloud. After the first cloud deploy, send start requests from two different networks and look at the `rateLimits` table in the dashboard: keys named `verifyStart:ip:<address>` must show two different, real client addresses. If there is only one address (a proxy) or none, the per-IP limit does nothing and only the global limit protects the endpoint. Decide then whether to read another header or add a stricter global cap.

## Data retention

Client IP addresses exist only inside the `verifyStart:ip:<address>` rate-limit keys. Each key lives only for its 10-minute window, and an hourly cron (`convex/crons.ts`, `maintenance:purge`) deletes expired windows, so an address is kept for at most about 70 minutes after its last request. The same job deletes phone numbers from verifications after 24 hours and WhatsApp message IDs after 7 days.

## Follow-ups

- **Content-Security-Policy.** `vercel.json` has no CSP on purpose: it must allow the Convex origins (`https://*.convex.cloud` for the client, including `wss:`) and the Google Fonts origins, and a wrong CSP breaks the site silently. Add one deliberately, in report-only mode first.
- **End-to-end test in CI.** `pnpm e2e` runs only on a developer machine. CI would need the Playwright Chromium install and the Convex local backend binary download.
- **Self-host the fonts (M9).** `apps/web/index.html` loads Readex Pro, Aref Ruqaa and Amiri Quran from Google Fonts, which tells Google about every visit and fails offline. Serve them from `apps/web/public` (with their licences) and drop the Google origins from the future CSP.
- **Refresh `lastUsedAt` on views (M8).** `sessionQuery` never writes, so a session's "last used" date (settings, the devices step) moves only when the person takes, finishes, or otherwise changes something. Someone who only looks at the khatma appears idle. Add a cheap, rate-limited "touch" mutation the app calls on open.
- **Manifest icons.** `apps/web/public/manifest.webmanifest` has no icons yet, so "add to home screen" gets a generic icon.
