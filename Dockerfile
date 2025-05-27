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

RUN sed -i "s/provider = \".*\"/provider = \"postgresql\"/" prisma/schema.prisma
RUN sed -i "s/DATABASE_URL=.*$/DATABASE_URL=postgres:\/\/postgres:postgres@db:5432\/mydb/" .env
RUN sed -i "s/provider = \"sqlite\"/provider = \"postgresql\"/" prisma/schema.prisma


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

CMD ["npm", "start"]
