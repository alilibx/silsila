# وِردك · Wirdak

ختمة جماعية للقرآن الكريم مع العائلة والأصدقاء والزملاء، بسيطة بما يكفي لطفل في العاشرة ولجدٍّ في الثمانين.

ادعُ من تحب، وخذ جزءاً واحداً في كل مرة، وعندما تكتمل الأجزاء الثلاثون نختم معاً وتبدأ الختمة التالية.

---

A shared Quran khatma for family, friends, and colleagues, simple enough for a 10-year-old and an 80-year-old.

Invite the people you love, take one juz' at a time, and when all 30 are done the group completes the khatma together and the next round begins.

**Status:** the v1 core loop is built (create a khatma, verify through WhatsApp, invite, take, finish, undo, release, and celebrate). Not deployed yet; see [docs/deploy.md](docs/deploy.md).

## Development

Requirements: Node 22+ (`.nvmrc`), pnpm 11 (`corepack enable`).

```sh
pnpm install
CONVEX_AGENT_MODE=anonymous pnpm dev   # local Convex backend + web dev server
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm dev` runs `convex dev` against a local anonymous backend (`http://127.0.0.1:3210`, no Convex account or cloud project needed). On first run Convex writes the deployment settings to `.env.local`, which is git-ignored. `pnpm dev` also starts the web app (`apps/web`) on `http://localhost:5173`; copy `apps/web/.env.example` to `apps/web/.env.local` first.

The celebration duas (Quran 2:127 and 2:201) are copied verbatim from the Tanzil Quran Text (Uthmani, Version 1.1) of the [Tanzil Project](https://tanzil.net), used under its licence, which asks for the source and a link.

The cloud Convex project (region EU West, Ireland) is created at deploy time; no cloud deployment exists yet, so there is no dev deployment name to record here.

## Development / e2e

- `pnpm dev` starts the local anonymous Convex backend and the Vite dev server on `http://localhost:5173`. In dev (`WIRDAK_ENV=dev`) a WhatsApp message can be simulated with `pnpm exec convex run dev:simulateIncoming '{"from":"971500000001","text":"<the ready-made message>"}'`.
- `pnpm e2e` runs the Playwright smoke test (Chromium, 390×844) against a local backend and Vite server that it starts and stops itself, with no cloud project and no real WhatsApp. It plays two people through verifying, creating a khatma, taking, finishing, and joining by invite. Stop `pnpm dev` first (the ports must be free), and run `pnpm exec playwright install chromium` once. State lives in `.convex/local`, shared with `pnpm dev`.

Deployment (Convex production, Vercel, WhatsApp) is described in [docs/deploy.md](docs/deploy.md).

Sessions: after WhatsApp verification the backend issues a random session token, and the web app keeps it in `localStorage` (key `wirdak.session`), falling back to memory when storage is blocked. Spec 5.2 asks for this choice to be documented: an HttpOnly cookie is impractical because the site (Vercel) and the backend (Convex) are on different domains. Only the token's SHA-256 hash is stored on the server, and every device can be signed out from the settings page or from the WhatsApp sign-in alert.

Tests run with Vitest: `convex/**` in the `edge-runtime` environment (required by `convex-test`), `apps/web/**` in `jsdom`. CI (`.github/workflows/ci.yml`) runs install, typecheck, lint, test, and the web build on Node 22 for every pull request and push to `main`. It deploys nothing: Vercel's build runs `convex deploy` and then the web build, so both ship together (see [docs/deploy.md](docs/deploy.md)).
