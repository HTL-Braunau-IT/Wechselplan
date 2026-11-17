# Development

Wechselplan is a Next.js 15 (App Router) + Prisma/PostgreSQL app. Architecture,
conventions and the full command list live in [`CLAUDE.md`](../CLAUDE.md); this
page is the short version to get a local instance running.

## Local setup

```bash
git clone https://github.com/HTL-Braunau-IT/Wechselplan.git
cd Wechselplan
npm ci --legacy-peer-deps
cp .env.example .env          # fill in DATABASE_URL, NEXTAUTH_*, ENTRA_*
npx prisma migrate deploy
npm run db:seed               # reference data (holidays, times, rooms, subjects)
npm run db:seed:local         # LOCAL ONLY: teachers, classes, students to click on
npm run dev
```

`.env.example` documents every variable. `NOTENMANAGEMENT_BASE_URL` is optional;
leave it empty unless you work on the Notenmanagement integration.

## Before committing

```bash
npm run check                 # eslint + tsc, the primary gate
SKIP_ENV_VALIDATION=true npx vitest run
```

CI (`.github/workflows/ci.yaml`) runs typecheck, vitest and lint, then builds the
Docker image and pushes it to `ghcr.io/htl-braunau-it/wechselplan`.

## Releases and image tags

| Tag | Produced by | When |
|---|---|---|
| `sha-<commit>` | `ci.yaml` | every green push to `main` / `develop` |
| `latest` | `ci.yaml` | every green push to `main` |
| `develop` | `ci.yaml` | every green push to `develop` |
| `stable`, `v<x.y.z>` | `promote-stable.yaml` | when a GitHub release is published |

Release Drafter keeps a draft release up to date. Publishing it retags the
already-built `sha-<commit>` image as `stable` and `v<x.y.z>`, with no rebuild.
Schools that host Wechselplan themselves follow `stable` (see the
[README](../README.md)). Only publish a release once that version has run on our
own production. Name any change to `docker-compose.yaml` or any new required env
var in the release notes: partner installs pull the compose file of the release
they run.

## More

- Our own deployment: [`docs/DEPLOYMENT.md`](DEPLOYMENT.md)
- What we owe self-hosting schools: [`docs/SELF_HOSTING_UPSTREAM.md`](SELF_HOSTING_UPSTREAM.md)
- Architecture: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
- API reference: [`docs/API/`](API/)
