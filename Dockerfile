# Install dependencies only when needed
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Rebuild the source code only when needed
FROM node:22-alpine AS builder
# Add build arguments for version and build date
ARG VERSION
ARG BUILD_DATE
# Set environment variables
ENV NEXT_PUBLIC_APP_VERSION=$VERSION
ENV NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE

# Debug: Print environment variables
RUN echo "NEXT_PUBLIC_APP_VERSION: $NEXT_PUBLIC_APP_VERSION"
RUN echo "NEXT_PUBLIC_BUILD_DATE: $NEXT_PUBLIC_BUILD_DATE"

WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

RUN cp .env.example .env
RUN npm install @opentelemetry/core


# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image
FROM node:22-alpine AS runner
# Add build arguments for version and build date
ARG VERSION
ARG BUILD_DATE
# Set environment variables
ENV NEXT_PUBLIC_APP_VERSION=$VERSION
ENV NEXT_PUBLIC_BUILD_DATE=$BUILD_DATE

WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.env.example ./.env
COPY --from=builder /app/src/app/templates/excel ./src/app/templates/excel

# Create start script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Waiting for database..."' >> /app/start.sh && \
    echo 'sleep 5' >> /app/start.sh && \
    echo 'echo "Applying migrations..."' >> /app/start.sh && \
    echo 'npx prisma migrate deploy' >> /app/start.sh && \
    echo 'npx prisma db seed' >> /app/start.sh && \
    echo 'echo "Starting application..."' >> /app/start.sh && \
    echo 'npm start' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"]
