# syntax=docker/dockerfile:1.7

###############################################################################
# deps — install the dependency tree once, keyed on the lockfile alone so that
# source edits never invalidate this layer.
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app

# lightningcss and the Prisma engines are native modules; Alpine needs a
# toolchain plus the glibc shim to build and run them.
RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

###############################################################################
# builder — generate the Prisma client and emit `.next/standalone`.
###############################################################################
FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VERSION=dev
ARG BUILD_DATE=""
ENV NEXT_PUBLIC_APP_VERSION=$VERSION \
    NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE \
    NEXT_TELEMETRY_DISABLED=1 \
    # The build must never need production secrets. `src/env.js` validates for
    # real at boot, against the values compose injects.
    SKIP_ENV_VALIDATION=true

RUN npx prisma generate
RUN npm run build

# `prisma db seed` shells out to tsx. Bundling the seed to plain ESM here keeps
# tsx, esbuild and the TypeScript toolchain out of the runtime image.
RUN npx esbuild prisma/seed.ts --bundle --platform=node --format=esm \
      --packages=external --outfile=prisma/seed.mjs

###############################################################################
# prisma-cli — the migration toolchain as its own complete dependency tree.
#
# The CLI is a dev dependency, so it is absent from Next's standalone bundle.
# Cherry-picking `node_modules/prisma` and `node_modules/@prisma` out of the
# builder does not work either: both reach for hoisted siblings (@prisma/debug,
# jiti, …) that would have to be chased one MODULE_NOT_FOUND at a time. Letting
# npm resolve it in isolation is deterministic, and keeping it in its own
# directory means it cannot shadow anything in the app's bundle.
###############################################################################
FROM node:22-alpine AS prisma-cli
WORKDIR /cli

RUN apk add --no-cache libc6-compat openssl

COPY package-lock.json ./
# Pinned to the exact version the client was generated from — a CLI/client
# version mismatch is precisely the drift this avoids.
RUN PRISMA_VERSION=$(node -p "require('./package-lock.json').packages['node_modules/prisma'].version") \
 && rm package-lock.json \
 && npm init -y > /dev/null \
 && npm install --omit=dev "prisma@${PRISMA_VERSION}"

###############################################################################
# runner — the shipped image. No compiler, no source, no dev dependencies.
###############################################################################
FROM node:22-alpine AS runner
WORKDIR /app

# openssl is required by the Prisma query/schema engines; libc6-compat by the
# native modules Next traced into the standalone bundle.
RUN apk add --no-cache libc6-compat openssl curl \
 && addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

ARG VERSION=dev
ARG BUILD_DATE=""
ENV NEXT_PUBLIC_APP_VERSION=$VERSION \
    NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next's standalone bundle: server.js plus only the traced modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Migrations run from this image (see docker/entrypoint.sh). The CLI lives in
# its own tree so it cannot shadow the app's traced dependencies.
COPY --from=prisma-cli --chown=nextjs:nodejs /cli/node_modules ./.prisma-cli/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=nextjs:nodejs /app/prisma/seed.mjs ./prisma/seed.mjs

COPY --chown=nextjs:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Uploaded and cached photos live here; compose mounts a volume over it. The
# directory is pre-created and owned so the non-root user can write to a fresh
# volume, which Docker initialises from the image.
RUN mkdir -p /app/data/student-photos /app/data/student-photos-o365 \
             /app/data/teacher-photos /app/data/teacher-photos-o365 \
 && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["serve"]
