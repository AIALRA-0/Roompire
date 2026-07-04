FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS migrator
COPY db ./db
COPY scripts ./scripts
COPY seed-data ./seed-data
CMD ["pnpm", "db:migrate"]

FROM deps AS builder
COPY . .
RUN pnpm db:generate
RUN pnpm --filter @roompire/web build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

RUN mkdir -p apps/web/.roompire_uploads && chown -R nextjs:nodejs apps/web/.roompire_uploads

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "const u=process.env.ROOMPIRE_SITE_GATE_USERNAME,p=process.env.ROOMPIRE_SITE_GATE_PASSWORD,h={};if(u&&p)h.Authorization='Basic '+Buffer.from(u+':'+p).toString('base64');fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/v1/health',{headers:h}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1));"
CMD ["node", "apps/web/server.js"]
