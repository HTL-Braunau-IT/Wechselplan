# Multi-stage build to handle lightningcss Alpine compatibility issues
# Stage 1: Build dependencies in Debian environment
FROM node:22-slim AS deps-debian
WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables to force native compilation
ENV npm_config_build_from_source=true
ENV npm_config_target_platform=linux
ENV npm_config_target_arch=x64

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Explicitly install the correct lightningcss binary for Linux x64
RUN npm install lightningcss-linux-x64-gnu@1.30.1

# Force rebuild of native modules
RUN npm rebuild

# Stage 2: Build the application in Debian environment
FROM node:22-slim AS builder-debian
ARG VERSION
ARG BUILD_DATE
ENV NEXT_PUBLIC_APP_VERSION=$VERSION
ENV NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE

WORKDIR /app
COPY . .
COPY --from=deps-debian /app/node_modules ./node_modules
RUN apt-get update -y && apt-get install -y openssl
RUN cp .env.example .env
RUN npx prisma generate
RUN npm run build

# Stage 3: Alpine production image
FROM node:22-alpine AS runner
ARG VERSION
ARG BUILD_DATE
ENV NEXT_PUBLIC_APP_VERSION=$VERSION
ENV NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE
ENV NODE_ENV=production

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache libc6-compat

# Copy built application from Debian builder
COPY --from=builder-debian /app/public ./public
COPY --from=builder-debian /app/.next ./.next
COPY --from=builder-debian /app/node_modules ./node_modules
COPY --from=builder-debian /app/package.json ./package.json
COPY --from=builder-debian /app/prisma ./prisma
COPY --from=builder-debian /app/.env.example ./.env
COPY --from=builder-debian /app/src/app/templates/excel ./src/app/templates/excel

# Create start script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Waiting for database..."' >> /app/start.sh && \
    echo 'sleep 5' >> /app/start.sh && \
    echo 'echo "Applying migrations..."' >> /app/start.sh && \
    echo 'npx prisma migrate deploy' >> /app/start.sh && \
    echo 'echo "Seeding database..."' >> /app/start.sh && \
    echo 'npx prisma db seed' >> /app/start.sh && \
    echo 'echo "Starting application..."' >> /app/start.sh && \
    echo 'npm start' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"] 