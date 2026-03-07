# Stage 1: Install dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: Build (copy source for potential future compile step)
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle/ drizzle/

# Stage 3: Runtime
FROM oven/bun:1-slim AS runtime
WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/false --create-home appuser

# Copy production dependencies and source
COPY --from=deps /app/node_modules node_modules/
COPY --from=build /app/src src/
COPY --from=build /app/drizzle drizzle/
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p /app/.run && chown -R appuser:appuser /app/.run && chmod 700 /app/.run

USER appuser

ENV NODE_ENV=production
ENV MCP_PORT=8834
ENV LOCAL_ISSUES_DB_PATH=/app/.run/local-issues.db
ENV LOG_LEVEL=info

EXPOSE 8834

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "fetch('http://localhost:8834/healthz').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
