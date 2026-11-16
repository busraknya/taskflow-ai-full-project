FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat

FROM base AS build
ENV DATABASE_URL=postgresql://build:build-only@127.0.0.1:5432/taskflow
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# This target is used by the one-shot migration service.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM base AS production-deps
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

FROM base AS runtime
ENV NODE_ENV=production
COPY package*.json ./
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4000
CMD ["node", "dist/main"]
