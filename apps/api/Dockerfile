FROM node:22-alpine AS base
RUN corepack enable

# Dev dependencies only for compiling api + shared (web workspace excluded).
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/prisma ./apps/api/prisma/
RUN npm ci --ignore-scripts \
    --workspace=api --workspace=@lilink/shared --include-workspace-root \
  && npm run prisma:generate --workspace api

# Compile: keep manifest copies before sources so dependency layers cache when only code changes.
FROM base AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY --from=deps /app/node_modules ./node_modules
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build --workspace @lilink/shared && npm run build --workspace api

# Production install for the runtime image (no Nest/TS toolchain; smaller than dev tree).
FROM base AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/prisma ./apps/api/prisma/
RUN npm ci --omit=dev --ignore-scripts \
    --workspace=api --workspace=@lilink/shared --include-workspace-root \
  && npm run prisma:generate --workspace api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app

COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/scripts ./scripts
RUN mkdir -p /app/src/modules/questionnaire
COPY --from=build /app/apps/api/src/modules/questionnaire/hard-match.constants.ts /app/src/modules/questionnaire/hard-match.constants.ts
COPY --from=build /app/apps/api/package.json ./
COPY --from=build /app/packages/shared ./packages/shared

USER app
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/bootstrap-admin.mjs && node dist/src/main.js"]
