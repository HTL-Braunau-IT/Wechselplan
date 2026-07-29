#!/bin/sh
#
# Single entrypoint for both roles the image plays: the one-shot `migrate` job
# and the long-running `serve` process. Keeping them in one image means the
# schema that gets applied is always the schema the running code was built
# against — they can never drift apart the way a separate migration image can.
#
set -eu

# The CLI lives in its own dependency tree (see the prisma-cli stage in the
# Dockerfile); Node resolves its requires relative to that directory.
PRISMA="node /app/.prisma-cli/node_modules/prisma/build/index.js"

case "${1:-serve}" in
  migrate)
    echo "[entrypoint] applying migrations"
    $PRISMA migrate deploy --schema /app/prisma/schema.prisma

    # Off by default. The seed is idempotent (upserts), but a deploy should not
    # silently write rows unless someone asked it to.
    if [ "${RUN_DB_SEED:-false}" = "true" ]; then
      echo "[entrypoint] seeding"
      node prisma/seed.mjs
    fi

    echo "[entrypoint] database ready"
    ;;

  serve)
    # No migrations here on purpose: compose gates `web` behind the `migrate`
    # service completing, so a failed migration stops the rollout instead of
    # producing a container that crash-loops against a half-migrated schema.
    exec node server.js
    ;;

  *)
    exec "$@"
    ;;
esac
