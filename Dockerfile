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

# Update Prisma schema for PostgreSQL
RUN sed -i "s/provider = \".*\"/provider = \"postgresql\"/" prisma/schema.prisma
RUN sed -i "s/DATABASE_URL=.*$/DATABASE_URL=postgres:\/\/postgres:postgres@db:5432\/mydb/" .env

# Generate Prisma client
RUN npx prisma generate
RUN cp .env.example .env
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

# Create a script to handle migrations and start the app
RUN echo '#!/bin/sh\n\
echo "Waiting for database..."\n\
sleep 5\n\
echo "Running migrations..."\n\
npx prisma migrate reset --force\n\
npx prisma migrate deploy\n\
echo "Starting application..."\n\
npm start' > /app/start.sh && chmod +x /app/start.sh

CMD ["/app/start.sh"]
