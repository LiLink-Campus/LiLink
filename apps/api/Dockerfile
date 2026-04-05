# Keep Node 20 here because npm ci on node:22-alpine currently fails for this lockfile.
FROM node:20-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --ignore-scripts && npx prisma generate

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/src/modules/questionnaire
COPY --from=build /app/src/modules/questionnaire/hard-match.constants.ts /app/src/modules/questionnaire/hard-match.constants.ts
COPY --from=build /app/package.json ./

USER app
EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node scripts/bootstrap-admin.mjs && node dist/src/main.js"]
