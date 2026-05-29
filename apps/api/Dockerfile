ARG PRISMA_GENERATE_DATABASE_URL="postgresql://lilink:lilink@localhost:5432/lilink?schema=public"

FROM node:22.22.3-alpine AS base
RUN corepack enable

# Dev dependencies only for compiling api + shared (web workspace excluded).
FROM base AS deps
ARG PRISMA_GENERATE_DATABASE_URL
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/prisma ./apps/api/prisma/
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
RUN npm ci --ignore-scripts \
    --workspace=api --workspace=@lilink/shared --include-workspace-root \
  && DATABASE_URL="$PRISMA_GENERATE_DATABASE_URL" npm run prisma:generate --workspace api

# Compile: keep manifest copies before sources so dependency layers cache when only code changes.
FROM base AS build
ARG PRISMA_GENERATE_DATABASE_URL
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build --workspace @lilink/shared \
  && DATABASE_URL="$PRISMA_GENERATE_DATABASE_URL" npm run build --workspace api

# Production install for the runtime image (no Nest/TS toolchain; smaller than dev tree).
FROM base AS production-deps
ARG PRISMA_GENERATE_DATABASE_URL
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/prisma ./apps/api/prisma/
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
RUN npm ci --omit=dev --ignore-scripts \
    --workspace=api --workspace=@lilink/shared --include-workspace-root \
  && DATABASE_URL="$PRISMA_GENERATE_DATABASE_URL" npm run prisma:generate --workspace api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/apps/api/scripts ./scripts
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/packages/shared ./packages/shared

USER app
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/bootstrap-admin.mjs && node dist/src/main.js"]
