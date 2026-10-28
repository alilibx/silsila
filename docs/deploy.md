# Deploying Wirdak

Wirdak runs in two environments. Each has its own Convex backend and its own address, and both are served by one Vercel project.

| Environment | Site                     | Convex deployment (EU West, Ireland)                        | Ships                                             |
| ----------- | ------------------------ | ----------------------------------------------------------- | ------------------------------------------------- |
| Staging     | https://stg.wirdak.app   | `manzilo:wirdak:staging` (`basic-mockingbird-167`)          | every push to `main`                              |
| Production  | https://wirdak.app       | `manzilo:wirdak:production` (`healthy-rabbit-33`, default)  | a release tag `vX.Y.Z`, cut by release-please    |

`www.wirdak.app` redirects to `wirdak.app`. Staging answers with `X-Robots-Tag: noindex, nofollow` and is public (Vercel Authentication is off for the project, so links in WhatsApp messages open without a Vercel login).

Both Convex deployments are of type `prod`, so they keep production durability and limits. The personal dev deployment (`dev/ali-alhashimi`) is unused: development runs on the local anonymous backend (see the README).

## How a change ships

GitHub Actions does every deploy. Vercel's Git integration is off (`"git": {"deploymentEnabled": false}` in `apps/web/vercel.json`), so there are no automatic Vercel builds and no pull-request previews.

1. **Pull request.** `ci.yml` runs install, typecheck, lint, test, and the web build. Nothing is deployed.
2. **Merge to `main`.** `main.yml` runs the same checks, then `deploy.yml` ships the commit to **staging**. Then release-please opens or updates the release pull request (`chore(main): release X.Y.Z`), which bumps `package.json` and `CHANGELOG.md` from the Conventional Commit messages since the last release.
3. **Merge the release pull request.** release-please tags `vX.Y.Z` and publishes a GitHub release. The same `main.yml` run then ships that tag to **production**.

The first release is `0.1.0` (`initial-version`). Before 1.0 a `feat:` bumps the minor version and a `fix:` the patch (`bump-minor-pre-major`). A `feat!:` or a `BREAKING CHANGE:` footer bumps the minor version too, until 1.0.

release-please runs only after the staging deploy succeeds, so production only gets code that reached staging first. If staging itself is broken (an expired key, a Convex outage) and production needs a fix, push the tag by hand (`git tag vX.Y.Z && git push origin vX.Y.Z`) and run the Deploy workflow for production with that tag. Then fix staging.

Pull requests opened by release-please use the workflow's `GITHUB_TOKEN`, so GitHub does not run `ci.yml` on them. They only touch `package.json`, `CHANGELOG.md` and `.release-please-manifest.json`, and the code they release already passed the checks on `main`.

### Redeploy or roll back

Run the **Deploy** workflow by hand (Actions, Deploy, Run workflow, from `main`):

- **Production:** `environment: production`, `ref: v1.2.3`. Production refuses anything that is not a release tag. This also rolls back: deploying an older tag ships its web app and its Convex functions together. Convex does not roll back data, so a release whose schema change is not backwards compatible cannot simply be redeployed over.
- **Staging:** `environment: staging`, `ref`: any branch, tag, or commit. Use it to try a branch on staging before merging.

For an instant web-only rollback, `vercel rollback` (or "Instant Rollback" in the dashboard) points `wirdak.app` back at an earlier deployment without rebuilding. It does not touch Convex.

### What `deploy.yml` does

```sh
vercel pull --environment=<staging|production>
vercel build --target=<staging|production>
vercel deploy --prebuilt --target=<staging|production>
```

`VERCEL_TOKEN` reaches only these three steps and `CONVEX_DEPLOY_KEY` only the build, never `pnpm install`. Production checks out `refs/tags/<ref>`, so a branch named like a tag cannot be deployed.

Every push to `main` gets its own run. Deploys to one environment queue one at a time (`concurrency: deploy-<environment>`); when several pile up, GitHub keeps only the newest waiting one, so staging always ends on the latest commit.

`vercel build` runs the build command from `apps/web/vercel.json`:

```sh
cd ../.. && pnpm exec convex deploy --check-build-environment "${CONVEX_CHECK_BUILD_ENVIRONMENT:-enable}" --cmd 'pnpm --filter web build' --cmd-url-env-var-name VITE_CONVEX_URL
```

The project's root directory is `apps/web`, so the command first moves to the repository root (where `convex/` and the `convex` CLI live). `convex deploy` pushes the functions to the deployment that `CONVEX_DEPLOY_KEY` belongs to, then runs `pnpm --filter web build` with `VITE_CONVEX_URL` set to that deployment's URL. If the push fails, the web build never runs, so a site cannot ship without its backend. The web app derives the HTTP actions URL (`https://<name>.eu-west-1.convex.site`) from `VITE_CONVEX_URL` when `VITE_CONVEX_SITE_URL` is unset (`apps/web/src/lib/env.ts`).

`convex deploy` normally refuses a `prod` deploy key in a non-production Vercel build, to stop a preview from writing to production. Staging is exactly that case (a `prod`-type Convex deployment behind Vercel's `staging` environment), so `deploy.yml` sets `CONVEX_CHECK_BUILD_ENVIRONMENT=disable` for staging only. Production keeps the check.

## Environment variables

Names only. Values never go in the repo.

### Convex deployments

Set per deployment in the Convex dashboard (Settings, Environment Variables) or with `pnpm exec convex env set --deployment manzilo:wirdak:<staging|production> NAME <value>`. Staging and production need the same names. `WIRDAK_ENV` is `staging` and `SITE_URL` is `https://stg.wirdak.app` on staging.

| Name                       | What it is for                                                                                                          | How to rotate                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WIRDAK_ENV`              | `prod` in production, `staging` in staging. Only the exact value `dev` relaxes anything (dev message logging, `dev:simulateIncoming`).         | Not a secret. Never set it to `dev` on staging or production.                                                                                                             |
| `SITE_URL`                 | The public site origin, no trailing slash. Used for links in WhatsApp messages and as the allowed CORS origin of `/api/verification/start`. | Change it when the domain changes. It is read at runtime, so no redeploy is needed.                                                                               |
| `WHATSAPP_PUBLIC_NUMBER`   | The business number, digits only, that the `wa.me` link opens.                                                          | Not a secret. Change if the business number changes.                                                                                                            |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta's ID of that number, used to send replies and to ignore messages meant for other numbers.                          | Not a secret. Change only if the number is replaced in Meta.                                                                                                    |
| `WHATSAPP_ACCESS_TOKEN`    | Long-lived system-user token that sends replies through the Graph API.                                                  | Create a new token in Meta Business Settings (system user), set it in Convex, confirm a real verification still gets a reply, then revoke the old token.        |
| `WHATSAPP_APP_SECRET`      | Meta app secret. Verifies the `X-Hub-Signature-256` signature on every webhook call.                                    | Reset it in the Meta app (Settings, Basic), then set the new value in Convex straight away. Webhook calls fail the signature check in between, and Meta retries. |
| `WHATSAPP_VERIFY_TOKEN`    | A string we choose. Meta sends it back during the webhook subscription handshake.                                       | Pick a new random string, set it in Convex, then save the webhook again in Meta with the same string (Meta repeats the handshake).                              |
| `WHATSAPP_GRAPH_VERSION`   | The Graph API version used in send URLs.                                                                                | Not a secret. Move to a newer supported version before the current one is retired, and check that sending still works.                                           |
| `PREVIEW_SECRET`           | Shared secret the Vercel link-preview function sends in `X-Preview-Secret`. `GET /api/preview` answers 401 without it. Secret. Must equal the Vercel value. | Generate a new random string, set it in that environment's Convex deployment and in Vercel (same environment) to the same value, then redeploy Vercel. Previews fall back to the generic card in between. |
| `VAPID_PUBLIC_KEY`         | Web Push (VAPID) public key. The browser subscribes with it (`api.push.publicKey` serves it to the web app) and the push services check it. Public. | Rotate the pair together, see "Web Push keys" below.                                                                                                              |
| `VAPID_PRIVATE_KEY`        | The matching VAPID private key. Signs every push from `convex/pushNode.ts`. Secret.                                      | Rotate the pair together, see "Web Push keys" below.                                                                                                              |
| `VAPID_SUBJECT`            | A contact for the push services, `mailto:you@example.com` or an `https://` URL. Sent with every push.                    | Not a secret. Change it if the contact changes.                                                                                                                   |

Each deployment answers `whatsapp_not_configured` from `/api/verification/start` until all seven `WHATSAPP_*` / `SITE_URL` values are set. The site then shows "التحقق عبر واتساب غير متاح الآن. نعمل على إصلاحه." and nobody can sign in. That is the expected state before ARQ-246 is finished.

### GitHub (repository `alilibx/wirdak`)

| Name                | Kind                         | What it is for                                                                                       | How to rotate                                                                                                                                                                                      |
| ------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONVEX_DEPLOY_KEY` | Secret, environment `staging`    | Deploy key for `manzilo:wirdak:staging`. Lets the staging build push functions.                       | `pnpm exec convex deployment token create <name> --deployment manzilo:wirdak:staging \| gh secret set CONVEX_DEPLOY_KEY --env staging`, run the Deploy workflow for staging, then delete the old key in the Convex dashboard. |
| `CONVEX_DEPLOY_KEY` | Secret, environment `production` | Deploy key for `manzilo:wirdak:production`.                                                       | The same with `--deployment manzilo:wirdak:production` and `--env production`. Redeploy the current tag to confirm.                                                                                |
| `VERCEL_TOKEN`      | Secret, repository           | Vercel token scoped to the team `arqqin` ("wirdak github actions (team)"). The Vercel CLI cannot use project-scoped tokens: `vercel pull` also reads the user and the team, which such tokens are refused. | Create a new token scoped to the `arqqin` team (Vercel, Account Settings, Tokens), `gh secret set VERCEL_TOKEN`, run a deploy, then delete the old token. |
| `VERCEL_ORG_ID`     | Variable                     | The Vercel team (`arqqin`, Manzilo Global).                                                           | Not a secret.                                                                                                                                                                                      |
| `VERCEL_PROJECT_ID` | Variable                     | The Vercel project `wirdak-web`.                                                                      | Not a secret.                                                                                                                                                                                      |

The `staging` environment only accepts runs from `main`. The `production` environment only accepts runs from `main` and `v*` tags. "Allow GitHub Actions to create and approve pull requests" is on, so release-please can open its pull request.

### Web Push keys

Until all three `VAPID_*` values are set, nothing is pushed: `pushNode.deliver` logs `push skipped (no VAPID)` and returns, and `api.push.publicKey` returns `null`. In-app notes still appear.

Generate a key pair once per deployment (dev and production get different pairs):

```sh
npx web-push generate-vapid-keys
pnpm exec convex env set --deployment manzilo:wirdak:<staging|production> VAPID_PUBLIC_KEY <public key>
pnpm exec convex env set --deployment manzilo:wirdak:<staging|production> VAPID_PRIVATE_KEY <private key>
pnpm exec convex env set --deployment manzilo:wirdak:<staging|production> VAPID_SUBJECT mailto:<contact address>
```

Staging and production each get their own pair. Never commit the private key.

Rotating: generate a new pair and set both values. A subscription is bound to the public key it was created with, so rotating invalidates every stored subscription: the push services reject pushes to them (usually with 403). Browsers subscribe again with the new key on their next visit to the app (the web app re-syncs its subscription on load), and the stored row for the same endpoint is replaced, so nobody gets pushes until they have opened Wirdak once. Only rotate if the private key leaked.

### Vercel project `wirdak-web`

Two variables, both read at request time by the link-preview function (so not `VITE_`). Set each for both the `staging` and `production` environments, each pointing at that environment's own Convex deployment:

| Name                     | What it is for                                                                                                         | How to rotate                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `WIRDAK_CONVEX_SITE_URL` | Base URL of that environment's Convex HTTP actions (the `.convex.site` URL), which `/api/invite` calls for link previews. Not a secret. | Change it and redeploy.                             |
| `PREVIEW_SECRET`         | Same value as `PREVIEW_SECRET` in that environment's Convex deployment. `/api/invite` sends it as `X-Preview-Secret`. Secret. | Rotate together with the Convex value (see above). |

Nothing else is set by hand. The Convex deploy keys live in GitHub, and `VITE_CONVEX_URL` comes from `convex deploy --cmd-url-env-var-name VITE_CONVEX_URL`. Set `VITE_CONVEX_SITE_URL` only if the HTTP actions URL stops being the `.convex.site` twin of the client URL (for example a custom Convex domain). Anything starting with `VITE_` ends up in the browser bundle, so only public values may use that prefix.

Settings: root directory `apps/web`, "Include source files outside of the Root Directory" on (the web app imports from `convex/` through the `@convex` alias, and the link-preview function imports `convex/lib/digits.ts`), framework Vite, Node 22, custom environment `staging` with the domain `stg.wirdak.app`, production domains `wirdak.app` and `www.wirdak.app` (redirect). The domain is registered at Vercel and uses Vercel DNS, so there are no records to manage.

Link previews: `/j/:code` is rewritten to the Vercel function `apps/web/api/invite.ts`, which fetches `${WIRDAK_CONVEX_SITE_URL}/api/preview` and injects Open Graph tags into `index.html` so WhatsApp shows the khatma name, progress and inviter. If either variable is missing, or Convex is slow or rate-limiting, the page still loads with generic tags and is not cached. The function fetches its own `/index.html`, so `/j/*` links fail (502) if Vercel Authentication or Deployment Protection is ever turned on for an environment. `apps/web/public/og.png` is rendered from `scripts/images/og.html` with `pnpm exec tsx scripts/render-images.ts` (needs `pnpm exec playwright install chromium` once); commit the PNG after changing the HTML.

### Local only

`CONVEX_DEPLOYMENT`, `CONVEX_URL` and `CONVEX_SITE_URL` in `.env.local` point at the local anonymous backend (git-ignored). `pnpm e2e` sets `WIRDAK_ENV=dev`, `SITE_URL` and `WHATSAPP_PUBLIC_NUMBER` on that local backend itself and refuses to run if a WhatsApp token is set there. The VAPID keys are left unset locally, so dev logs `push skipped (no VAPID)` instead of pushing. With `WIRDAK_ENV=dev`, `dev:forceGraceEnd` ends a juz' grace at once (see the README); it refuses on any other value.

## Checklist (Ali)

Done: the Convex deployments, their `WIRDAK_ENV` and `SITE_URL`, the deploy keys and Vercel token in GitHub, the Vercel project, its staging environment, and the domains (ARQ-254, ARQ-249). Staging has been deployed once by hand to prove the pipeline.

Left:

1. **First production release.** Merge the release pull request that release-please opens after the next push to `main`. That tags `v0.1.0` and deploys `wirdak.app`.
2. **WhatsApp setup (ARQ-246).** In the Meta app, set the webhook callback URL to `https://healthy-rabbit-33.eu-west-1.convex.site/whatsapp/webhook` and the verify token to the value of `WHATSAPP_VERIFY_TOKEN`, then subscribe to `messages`. Set the six `WHATSAPP_*` variables on the production deployment. Staging needs its own number (a Meta test number works) and webhook (`https://basic-mockingbird-167.eu-west-1.convex.site/whatsapp/webhook`) before anyone can sign in there.
3. **Real-phone test.** On a real phone open the production site, start a khatma, press the WhatsApp button, send the ready-made message, confirm "نعم، هذا رقمي", then create a khatma, take a juz', and finish it. Repeat with a second phone using the invite link.

The admin panel (plan 3) will live at `admin.wirdak.app` as its own Vercel project.

Plan 2 (grace, notes, push, hand-off, previews) adds the steps below. No agent could run the device checks (5, 6, 8, 10), so they are yours. Try each on staging (`stg.wirdak.app`) first, then production.

4. **Generate the VAPID keys and set them on both Convex deployments.** One pair per deployment, set with `pnpm exec convex env set --deployment manzilo:wirdak:<staging|production> …` (see "Web Push keys"). Without them nothing is pushed; in-app notes still work.
5. **Desktop Chrome push round trip.** Open the site in desktop Chrome, take a juz', press "فعّل الإشعارات" in the prompt, and allow notifications. Then end that juz' grace and check that the push arrives and that tapping it opens the khatma. `dev:forceGraceEnd` refuses outside dev, so create the khatma with the minimum grace of 30 minutes (the create page's grace field) and wait; pushes are held between 22:00 and 07:00 in your time zone, so run this in the daytime.
6. **Real iPhone hand-off (iOS 16.4 or later).** In Safari open the site, sign in, take a juz', and follow the install steps ("أضف وِردك إلى الشاشة الرئيسية"). Open Wirdak from the home screen and confirm that it is signed in without a WhatsApp verification and that the push prompt appears. Two fallbacks, in order: if iOS opens the home-screen app signed out, change the manifest URL in `installHandoffManifest` from `blob:` to a `data:` URL (one line) and try again; if iOS ignores `start_url` entirely, do not put the token in the page address (it would land in history and referrers): stop and decide how else to carry the sign-in across.
7. **Set the preview secret on both sides, per environment.** For staging and for production, generate a random string and set it as `PREVIEW_SECRET` on that Convex deployment and in Vercel for the matching environment, plus `WIRDAK_CONVEX_SITE_URL` in Vercel (`https://basic-mockingbird-167.eu-west-1.convex.site` for staging, `https://healthy-rabbit-33.eu-west-1.convex.site` for production). Redeploy with the Deploy workflow. Leave "Include source files outside of the Root Directory" enabled: `apps/web/api/invite.ts` imports `convex/lib/digits.ts`.
8. **Check a WhatsApp link preview.** Paste a real invite link (`https://stg.wirdak.app/j/<code>`, then `https://wirdak.app/j/<code>`) into a WhatsApp chat and confirm the card shows the khatma name, its progress, and the inviter, with the Wirdak image. If it shows the generic card, check the two preview variables and the Vercel function log.
9. **Open an invite link in a browser on staging.** Open `https://stg.wirdak.app/j/<code>` and confirm the khatma page loads. The function fetches its own `/index.html`, so if Vercel Authentication or Deployment Protection is ever turned on, every `/j/*` link answers 502.
10. **Real-iPhone push.** From the home-screen app, enable push and repeat the round trip from step 5 on the iPhone (a pushed note arrives, tapping it opens the khatma).

## First cloud deploy: check the client IP

The per-IP limit on `/api/verification/start` relies on `ctx.meta.getRequestMetadata()` returning the real client IP (falling back to the first `X-Forwarded-For` entry). The local backend takes it from a client-supplied header, so it proves nothing about the cloud. After the first cloud deploy, send start requests from two different networks and look at the `rateLimits` table in the dashboard: keys named `verifyStart:ip:<address>` must show two different, real client addresses. If there is only one address (a proxy) or none, the per-IP limit does nothing and only the global limit protects the endpoint. Decide then whether to read another header or add a stricter global cap.

## Data retention

Client IP addresses exist only inside the `verifyStart:ip:<address>` rate-limit keys. Each key lives only for its 10-minute window, and an hourly cron (`convex/crons.ts`, `maintenance:purge`) deletes expired windows, so an address is kept for at most about 70 minutes after its last request. The same job deletes phone numbers from verifications after 24 hours, WhatsApp message IDs after 7 days, in-app notes 30 days after they are cleared or dismissed (uncleared ones after 180 days), and hand-off tokens after 1 day. Signing a device out also deletes that session's push subscriptions.

## Follow-ups

- **Content-Security-Policy.** `vercel.json` has no CSP on purpose: it must allow the Convex origins (`https://*.convex.cloud` for the client, including `wss:`) and the Google Fonts origins, and a wrong CSP breaks the site silently. Add one deliberately, in report-only mode first.
- **End-to-end test in CI.** `pnpm e2e` runs only on a developer machine. CI would need the Playwright Chromium install and the Convex local backend binary download.
- **Self-host the fonts (M9).** `apps/web/index.html` loads Readex Pro, Aref Ruqaa and Amiri Quran from Google Fonts, which tells Google about every visit and fails offline. Serve them from `apps/web/public` (with their licences) and drop the Google origins from the future CSP.
