# Supporting self-hosting schools: our side

The German [`README.md`](../README.md) is the guide for schools that run Wechselplan
on their own servers. It relies on a few things on **our** side. This file lists
them, plus the rules we have to keep because partner installs update unattended.

Status legend: ☐ open · ☑ done

---

## 1. Distribution

| | Status |
|---|---|
| Repository is public, so partners fetch `docker-compose.yaml`, `self-hosting/*` and `docker/pg-backup.sh` straight from `raw.githubusercontent.com` | ☑ |
| **GHCR package is public.** Package visibility is separate from repo visibility: GitHub → org → *Packages* → `wechselplan` → *Package settings* → *Change visibility* → Public. The org must allow public packages (*Org settings → Packages*). Until then `docker compose pull` fails for partners. | ☐ |
| `stable` channel: `.github/workflows/promote-stable.yaml` retags `sha-<commit>` as `stable` + `v<x.y.z>` when a release is published | ☑ |
| **Publish a first release after the workflow is on `main`.** `:stable` does not exist until then, and the update script would fetch the compose file of the last release (`v0.2.13`, Feb 2026), which predates the current stack. | ☐ |
| Update script keeps the partner's compose file in sync with the release they run, and refuses a compose file their `.env` cannot satisfy | ☑ |
| No licence server; `NOTENMANAGEMENT_BASE_URL` optional; release notes work without `GITHUB_TOKEN` | ☑ |

## 2. Release rules

- Only publish a release once that version has run on our own production for a
  few days. Publishing **is** the rollout to every partner school.
- Release notes must name any change to `docker-compose.yaml` and any new
  required env var, under a fixed heading (e.g. *„Hinweise für Betreiber“*). A new
  `${VAR:?…}` in compose makes the partner's update stop until they add the var.
- Never retag `stable` by hand; publish a release (or re-run *Promote stable*).

## 3. Migration discipline

Partners roll out unattended, and we never see their failures.

- Migrations must be forward-compatible with the previous image. The update
  script rolls the app back but not the DB, the same as our `deploy.yaml`. That
  means expand → deploy → contract across two releases, never a rename or drop in
  the same release that stops using the column.
- No data migration may assume HTL-Braunau-specific rows (room names, class
  names, subject codes) exist.
- ☐ Consider a CI check that fails a PR when a migration contains `DROP COLUMN`,
  `DROP TABLE` or `ALTER … RENAME` without a marker comment.

## 4. School-specific values still in the code

| Where | What | Action |
|---|---|---|
| `prisma/seed.ts` | Our holidays, rooms, subjects, times | ☑ Split: generic seed = roles; our data is the `htl-braunau` profile (`SEED_PROFILE`). Partners run no seed and use Admin → Daten. Remember to update the profile's holiday dates each school year. |
| `docs/DEPLOYMENT.md` | Our internal IPs, Proxmox node, LXC ID | ☑ Made generic; host details live in the internal IT docs. They remain in git history. |
| `sync-scheduler` in compose | Timezone `Europe/Vienna`, 02:00 | Fine for Austrian schools. |

## 5. Support

- Partners report through GitHub issues (README, *Kontakt*).
- ☐ Keep a list of partner installations: school, contact, channel followed.
- ☐ Decide what we promise: response times and how long a release is supported.
  Write it down before the first incident, not during it.
- ☑ Licensed under MIT (`LICENSE`).

## 6. Nothing changes for us

Our own deployment is untouched. `deploy.yaml` keeps deploying `sha-<commit>` on
every green `main`, and the self-hosted runner stays ours alone. Do **not**
register a runner at a partner school. It would execute our workflows inside their
network with access to our repo.
