# Install dependencies only when needed
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Rebuild the source code only when needed
FROM node:20-alpine AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules

RUN apk add --no-cache sed
RUN cp .env.example .env

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only what's needed
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.env ./.env

# Create start script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo 'echo "Waiting for database..."' >> /app/start.sh && \
    echo 'sleep 5' >> /app/start.sh && \
    echo 'echo "Resetting database state..."' >> /app/start.sh && \
    echo 'npx prisma migrate reset --force' >> /app/start.sh && \
    echo 'echo "Creating initial migration..."' >> /app/start.sh && \
    echo 'npx prisma migrate dev --name init --create-only' >> /app/start.sh && \
    echo 'echo "Applying migrations..."' >> /app/start.sh && \
    echo 'npx prisma migrate deploy' >> /app/start.sh && \
    echo 'echo "Starting application..."' >> /app/start.sh && \
    echo 'npm start' >> /app/start.sh && \
    chmod +x /app/start.sh

CMD ["/app/start.sh"]
