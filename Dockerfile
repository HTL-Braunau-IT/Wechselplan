# Multi-stage build to handle lightningcss Alpine compatibility issues
# Stage 1: Build dependencies in Debian environment
FROM node:22-alpine AS deps-alpine
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ libc6-compat
RUN apk add --no-cache libc6-compat make g++ python3

# Set environment variables to force native compilation
ENV npm_config_build_from_source=true
ENV npm_config_target_platform=linux
ENV npm_config_target_arch=x64

COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
RUN npm i lightningcss-linux-x64-musl

# Stage 2: Build the application in  environment
FROM node:22-alpine AS builder-alpine
ARG VERSION
ARG BUILD_DATE
ENV NEXT_PUBLIC_APP_VERSION=$VERSION
ENV NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE

WORKDIR /app
COPY . .
COPY --from=deps-alpine /app/node_modules ./node_modules
RUN apk add --no-cache openssl
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
RUN apk add --no-cache libc6-compat make g++ python3

# Copy built application from Debian builder
COPY --from=builder-alpine /app/public ./public
COPY --from=builder-alpine /app/.next ./.next
COPY --from=builder-alpine /app/node_modules ./node_modules
COPY --from=builder-alpine /app/package.json ./package.json
COPY --from=builder-alpine /app/prisma ./prisma
COPY --from=builder-alpine /app/.env.example ./.env
COPY --from=builder-alpine /app/src/app/templates/excel ./src/app/templates/excel

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