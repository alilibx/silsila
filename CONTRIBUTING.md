# Contributing to Wirdak

Thanks for helping. Wirdak is used by families who may include a 10-year-old and an 80-year-old, so every change keeps
the app simple, fast, and Arabic first. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Before you start

- **Bugs and small fixes:** open a pull request, or [report the bug](https://github.com/alilibx/wirdak/issues/new?template=report-a-bug.yml)
  first if you're not sure it is one.
- **New features or behaviour changes:** [suggest the idea](https://github.com/alilibx/wirdak/issues/new?template=suggest-an-idea.yml)
  before writing code, so we can agree on it first. Larger changes start as a design spec in
  [`docs/superpowers/specs/`](docs/superpowers/specs/).
- **Security issues:** don't open an issue. Follow [SECURITY.md](SECURITY.md).

## Set up

Follow the [quick start](README.md#quick-start). You need Node 22+ and Bun 1.4+. Everything runs against a local
anonymous Convex backend, with no cloud account and no real WhatsApp.

## Make the change

1. Branch from `main` with a prefix: `feat/`, `fix/`, `docs/`, or `chore/`.
2. Keep the change small and focused on one thing.
3. Add or update tests next to the code: `*.test.ts` for `convex/`, and tests under `apps/web/src` for the website.
   Behaviour that crosses the website and backend belongs in the Playwright smoke test in `e2e/`.
4. Put user-facing text in `apps/web/src/i18n/ar.ts`, in Arabic, and check the layout right to left.
5. Run the checks:

   ```sh
   bun run typecheck
   bun run lint
   bun run test
   bun run e2e
   ```

## Commit and open a pull request

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages and the pull request title
  (`feat: …`, `fix(web): …`, `docs: …`). release-please builds the changelog and the version number from them, so a
  `feat:` bumps the minor version and a `fix:` the patch.
- Fill in the [PR template](.github/pull_request_template.md). CI runs install, typecheck, lint, test, and the web
  build on every pull request; it must pass before review.
- The maintainer reviews every change. Pull requests are squash-merged.

## What we won't merge

- Anything that adds a password, an app store install, or a step between an invite link and taking a juz'.
- Tracking that names a reader, or shows other people how long someone held a juz'.
- Changes to Quran text. The duas come verbatim from the [Tanzil Project](https://tanzil.net) and stay that way.
