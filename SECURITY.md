# Security

## Reporting a vulnerability

Don't open a public issue. Report it privately through
[GitHub's private vulnerability reporting](https://github.com/alilibx/wirdak/security/advisories/new), with what's
affected and how to reproduce it. You'll get an answer within a week.

## What's in scope

- The website at [wirdak.app](https://wirdak.app/) and the admin app at admin.wirdak.app.
- The Convex backend in `convex/`, including sessions, WhatsApp verification, and the HTTP endpoints.
- Anything that exposes one person's phone number, sessions, or reading history to someone else.
- The GitHub workflows in `.github/workflows/`.
- Any API key or other secret committed to the repo. If you find one, report it; don't use it.

Only the latest release on [wirdak.app](https://wirdak.app/) and the latest commit on `main` are supported.

## Out of scope

- Reports that need a rooted or compromised device, or physical access to an unlocked phone.
- Missing security headers or rate limits without a concrete way to abuse them.

## Testing

Test against a local backend (`bun run dev`, see the [README](README.md#quick-start)), not against wirdak.app. Don't
send WhatsApp messages to numbers that aren't yours, and don't read or change other people's khatmas.
