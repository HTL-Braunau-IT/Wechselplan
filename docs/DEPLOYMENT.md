# Deployment

Wechselplan runs as a Docker Compose stack on a single Proxmox LXC. This
document describes the pipeline, the host layout and the runbook. It replaces
the previous Coolify deployment.

## Topology

| | |
|---|---|
| Proxmox node | `prox4` (10.10.10.223) |
| Container | LXC **143** — `htlsrv-wechselplan-01` |
| Address | **10.10.10.148/24**, gw 10.10.10.254, DNS 10.10.10.1 |
| Resources | 6 cores, 8 GB RAM, 2 GB swap, 64 GB on `MSA2040-1-C` |
| Type | unprivileged, `nesting=1,keyctl=1` (required for Docker) |

Two independent stacks share the host:

| Environment | Directory | Port | Branch | Image tag |
|---|---|---|---|---|
| production | `/srv/wechselplan` | 3000 | `main` | `latest` |
| staging | `/srv/wechselplan-staging` | 3001 | `develop` | `develop` |

They share nothing but the Docker daemon: separate Postgres containers,
separate networks, separate credentials, separate data directories.

## Pipeline

Two workflows, both in `.github/workflows/`:

**`ci.yaml`** runs on every push and PR to `main`/`develop`.
1. `verify` — `npm ci`, `prisma generate`, typecheck, vitest, lint.
2. `image` — needs `verify`; builds the production image with Buildx and pushes
   it to `ghcr.io/htl-braunau-it/wechselplan`. Pull requests build but do not
   push, so the Dockerfile is validated without publishing.

This replaced the old `build-alpine` job, which compiled the app in a throwaway
`node:22-alpine` container and discarded the result. The image build gives the
same Alpine coverage and keeps the artifact.

**`deploy.yaml`** runs on the **self-hosted runner inside the LXC** once CI
succeeds on `main` or `develop`. Deploys are therefore *pull-based*: GitHub
never needs a route into the school network, and no SSH key or host credential
is stored as a repository secret.

1. Resolve environment and image tag from the triggering branch.
2. Copy `docker-compose.yaml` from the commit onto the host.
3. Record the currently running image **digest** (not tag — `latest` will have
   moved by the time a rollback is needed).
4. `pg_dump` the database to `backups/pre-deploy-<stamp>.dump`.
5. `docker compose pull && up -d`. The `migrate` service runs first and `web` is
   gated on it exiting 0, so a failed migration aborts the rollout instead of
   leaving the app crash-looping against a half-applied schema.
6. Poll `/api/health` for up to 150 s.
7. On failure, restart the previous image digest.

### Manual deploy and rollback

Actions → **Deploy** → *Run workflow*. Choose the environment; leave
`image_tag` empty for the current branch tag, or set it to roll back:

```
image_tag: sha-<full 40-char commit sha>
```

Every commit built on `main`/`develop` is retained under that tag, so any past
commit can be redeployed without rebuilding.

## Image

`Dockerfile` is a three-stage build producing a ~500 MB image (previously
~1.5 GB):

- **deps** — `npm ci` against the lockfile alone, so source edits do not
  invalidate the dependency layer.
- **builder** — `prisma generate`, `next build`, and an esbuild pass that
  bundles `prisma/seed.ts` to plain ESM so `tsx` never ships to production.
- **runner** — Next's `output: 'standalone'` bundle plus the Prisma CLI and
  engines. No compiler, no source, no dev dependencies. Runs as uid 1001.

The image serves two roles via `docker/entrypoint.sh`: `migrate` (one-shot) and
`serve` (default). One image for both means the schema being applied is always
the schema the running code was built against.

## Host layout

```
/srv/wechselplan/                 # and /srv/wechselplan-staging/
├── .env                          # secrets, 0600 runner:runner, NOT in git
├── docker-compose.yaml           # copied from the repo by the deploy job
├── postgres/                     # Postgres data directory (bind mount)
├── data/                         # student/teacher photos, uid 1001
└── backups/                      # pre-deploy + nightly dumps
/opt/actions-runner/              # GitHub Actions runner (systemd service)
```

Bind mounts rather than named volumes: the data sits inside the container
filesystem that Proxmox Backup Server already snapshots, and it can be found
without `docker volume inspect`.

## Configuration

`.env` on the host is the only place secrets live. `docker-compose.yaml`
enumerates every variable explicitly, so a missing one fails at `up` rather
than at runtime; `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `POSTGRES_PASSWORD` and
`DATA_ROOT` are hard-required via `${VAR:?...}`.

`POSTGRES_PASSWORD`, `NEXTAUTH_SECRET` and `SYNC_TRIGGER_SECRET` were generated
per environment at provisioning time. The values that must come from Entra,
Graph, Notenmanagement and the license server are listed in `.env.example` and
left blank in the host `.env`; `src/env.js` refuses to boot without the
`ENTRA_*` trio and `NOTENMANAGEMENT_BASE_URL`.

After editing `.env`:

```bash
cd /srv/wechselplan && docker compose up -d
```

### Database collation

Postgres is initialised with `--locale-provider=icu --icu-locale=de-AT` so
German names sort correctly. The image ships no generated `de_AT.UTF-8` glibc
locale — `initdb` rejects it — hence ICU, which carries its own locale data.

This applies **only when the data directory is empty**. Changing it later
requires a dump, re-init and restore.

## Backups

Three independent layers:

1. **Pre-deploy dump** — taken by the deploy job before migrations run,
   `backups/pre-deploy-*.dump`, kept 14 days.
2. **Nightly dump** — `wechselplan-backup@.timer`, 01:30 Europe/Vienna (before
   the 02:00 directory sync, so a bad sync is recoverable),
   `backups/nightly-*.dump`, kept 30 days. Script: `docker/pg-backup.sh`.
3. **Proxmox Backup Server** — whole-container snapshots to `PBS1`.

Layers 1 and 2 are logical (`pg_dump --format=custom`); layer 3 is a
crash-consistent image of a running Postgres, which restores but is not
guaranteed clean. Prefer a logical dump when restoring a single environment.

### Restore

```bash
cd /srv/wechselplan
docker compose stop web
docker compose exec -T db psql -U wechselplan -d postgres \
  -c 'DROP DATABASE wechselplan;' -c 'CREATE DATABASE wechselplan;'
docker compose exec -T db pg_restore -U wechselplan -d wechselplan --no-owner \
  < backups/nightly-<stamp>.dump
docker compose up -d
```

If a *migration* is what needs reverting, restore the pre-deploy dump from that
rollout and then redeploy the previous image tag. The deploy job's automatic
rollback deliberately does **not** touch the database: a forward-only migration
is usually compatible with the previous code, and an automatic restore would
silently discard every write since the dump.

## Runbook

```bash
ssh root@10.10.10.148

cd /srv/wechselplan                     # or /srv/wechselplan-staging
docker compose ps                       # what is running
docker compose logs -f web              # tail the app
docker compose logs migrate             # why a rollout failed
curl -s localhost:3000/api/health       # liveness + database reachability

systemctl status 'actions.runner.*'     # deploy runner
journalctl -u wechselplan-backup@wechselplan.service   # backup history
```

Run the directory sync by hand:

```bash
cd /srv/wechselplan
curl -fsS -X POST http://localhost:3000/api/sync/run \
  -H "x-sync-secret: $(grep ^SYNC_TRIGGER_SECRET= .env | cut -d= -f2)"
```

Container-level operations from the Proxmox node:

```bash
ssh root@10.10.10.223
pct status 143 ; pct reboot 143 ; pct console 143
```

## Seeding

`RUN_DB_SEED` controls whether the `migrate` job runs `prisma/seed.mjs` (roles
and school holidays). It is set to `true` for the first rollout of an empty
database and should be set back to `false` afterwards, so routine deploys do
not write rows unasked. The seed itself is idempotent (upserts).
