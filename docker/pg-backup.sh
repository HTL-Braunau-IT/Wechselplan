#!/bin/bash
#
# Nightly logical backup of a Wechselplan stack's database.
#
# Installed on htlsrv-wechselplan-01 at /usr/local/bin/wechselplan-backup and
# driven by the wechselplan-backup@.timer systemd unit; see docs/DEPLOYMENT.md.
# Kept in the repo so the backup policy is reviewable rather than living only
# as an undocumented file on a server.
#
# A logical dump complements, rather than replaces, the Proxmox Backup Server
# snapshot of the container: PBS gives a crash-consistent image of a running
# Postgres, which restores but is not guaranteed clean. pg_dump is the copy you
# actually want when restoring a single environment.
#
# Usage: wechselplan-backup <stack-directory>
#
set -euo pipefail

STACK_DIR=${1:?usage: wechselplan-backup <stack-directory>}
RETENTION_DAYS=${RETENTION_DAYS:-30}

cd "$STACK_DIR"

if [ -z "$(docker compose ps -q db 2>/dev/null)" ]; then
  echo "[backup] no db container running in ${STACK_DIR}; nothing to do"
  exit 0
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="backups/nightly-${STAMP}.dump"

# --format=custom so a restore can be selective and parallel (pg_restore -j).
# Written to a temporary name first: a truncated dump left behind by a crash
# would otherwise look like a valid backup.
docker compose exec -T db sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "${OUT}.partial"
mv "${OUT}.partial" "$OUT"

echo "[backup] wrote ${STACK_DIR}/${OUT} ($(du -h "$OUT" | cut -f1))"

find backups -name 'nightly-*.dump' -mtime +"${RETENTION_DAYS}" -print -delete
# Half-written dumps from an interrupted run are never useful.
find backups -name '*.partial' -mtime +1 -print -delete
