FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
ENV HUSKY=0

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/lawminded
ENV DIRECT_URL=postgresql://postgres:postgres@localhost:5432/lawminded
RUN pnpm --filter @lawminded/api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @lawminded/api build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @lawminded/api exec prisma migrate deploy --schema prisma/schema.prisma && pnpm --filter @lawminded/api start:prod"]
