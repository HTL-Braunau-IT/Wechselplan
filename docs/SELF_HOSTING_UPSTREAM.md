# Supporting external installations: what we have to set up

`docs/SELF_HOSTING.md` (German) is the guide we hand to another school. It assumes a
few things exist on **our** side that do not exist yet. This file lists them, in the
order they block the other school.

Status legend: ☐ open · ☑ done

---

## 1. Public image (blocker)

Decision: the image is **public**, so partners pull without credentials.

- ☐ GitHub → org → *Packages* → `wechselplan` → *Package settings* → *Change
  visibility* → Public. The org must allow public packages: *Org settings →
  Packages*.
- The image contains the built app and no secrets: the build runs with
  `SKIP_ENV_VALIDATION` and no `.env`. The standalone bundle is readable by anyone.
- Our own `deploy.yaml` keeps working unchanged (it still logs in; harmless).

## 2. A `stable` image channel (strongly recommended)

Today every green push to `main` becomes `:latest`. A partner following `:latest`
gets every merge unattended, overnight. `SELF_HOSTING.md` tells them to follow
`:stable`, which **does not exist yet**.

- ☐ Add `.github/workflows/promote-stable.yaml`. It retags the image CI already
  built and tested for the release commit, so there is no rebuild and the bits are
  identical to what ran on our production:

  ```yaml
  name: Promote stable
  on:
    release:
      types: [published]
  permissions:
    contents: read
    packages: write
  jobs:
    promote:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with: { fetch-depth: 0 }
        - uses: docker/login-action@v3
          with:
            registry: ghcr.io
            username: ${{ github.actor }}
            password: ${{ secrets.GITHUB_TOKEN }}
        - name: Retag sha-<commit> as stable and <version>
          run: |
            set -euo pipefail
            SHA=$(git rev-list -n1 "${{ github.event.release.tag_name }}")
            IMG=ghcr.io/htl-braunau-it/wechselplan
            docker buildx imagetools create \
              -t "$IMG:stable" \
              -t "$IMG:${{ github.event.release.tag_name }}" \
              "$IMG:sha-$SHA"
  ```

  This fails loudly if the release tag points at a commit CI never built, which is
  the behaviour we want.
- ☐ Release process: release-drafter already keeps a draft. Publish it only after the
  version has run on **our** production for a few days. Publishing is the promotion.
- ☐ Release notes must name any change to `docker-compose.yaml` or any new
  required env var under a fixed heading (e.g. *„Hinweise für Betreiber“*). External
  installs do not get the compose file automatically (SELF_HOSTING §5.4).

## 3. Licence gate ☑

Removed: every module is always on, and `NOTENMANAGEMENT_BASE_URL` is optional.
`GET /api/entitlements` remains as a deprecated all-features stub for older
mobile-app builds. ☐ Delete it once the app no longer calls it.

## 4. Migration discipline (process, ongoing)

Partners roll out unattended, and we never see their failures.

- ☐ Migrations must be forward-compatible with the previous image. Their update
  script rolls the app back but not the DB, the same as our `deploy.yaml`. That
  means expand → deploy → contract across two releases, never a rename or drop in
  the same release that stops using the column.
- ☐ No data migration may assume HTL-Braunau-specific rows (room names, class
  names, subject codes) exist.
- ☐ Consider a CI check that fails a PR when a migration contains `DROP COLUMN`,
  `DROP TABLE` or `ALTER … RENAME` without a marker comment.

## 5. School-specific values baked into the code

These work for us and are wrong or useless for another school:

| Where | What | Action |
|---|---|---|
| `prisma/seed.ts` | Our holidays, rooms, subjects, times | ☐ Split into a generic seed (times, roles) and an optional HTL-Braunau seed, or make the rooms/subjects list empty for others. They are told to edit these in the admin UI and never re-seed. |
| `src/env.js` | `NOTENMANAGEMENT_BASE_URL` | ☑ Optional; unset hides the transfer UI and NM routes answer 503. |
| `src/app/api/github/releases/route.ts` | Reads releases of our private repo with `GITHUB_TOKEN` | ☐ Check it degrades gracefully without a token (no error toast, no broken page). Or point it at a public changelog, or bundle the release notes into the image at build time. |
| `.env.example`, `docs/DEPLOYMENT.md`, `docker-compose.yaml` comments | Our hostnames and IPs | Fine as-is; the compose file itself is generic. ☐ Remove the unused `ENTRA_SYNC_MODE` from `docker-compose.yaml`, since it is not read anywhere. |
| `sync-scheduler` in compose | Timezone `Europe/Vienna`, 02:00 | Fine for Austrian schools. |

## 6. Shipping the compose file

The compose file is part of our private repo. The partner cannot fetch it.

- ☐ Attach `docker-compose.yaml` (and the two scripts from SELF_HOSTING §5.2/§6.1)
  as **release assets**. Simplest: an extra step in `promote-stable.yaml` using
  `gh release upload`. They then always download the compose file matching the
  release they run.
- Alternatively move `docker-compose.yaml`, `docs/SELF_HOSTING.md` and the scripts
  into a small **public** `wechselplan-deploy` repo.

## 7. Support and contact

- ☐ Agree on a contact address for partner schools and put it in SELF_HOSTING §8.
- ☐ Keep a list of partner installations: school, contact, channel followed
  (`stable` / `latest`), registry token expiry.
- ☐ Decide what we promise: response times and how long a given release is
  supported. Write it down before the first incident, not during it.

## 8. Nothing changes for us

None of the above affects our own deployment. `deploy.yaml` keeps deploying
`sha-<commit>` on every green `main`, and the self-hosted runner stays ours alone.
Do **not** register a runner at a partner school. It would execute our workflows
inside their network with access to our repo.
