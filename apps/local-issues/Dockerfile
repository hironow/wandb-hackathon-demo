# Stage 1: Install dependencies and build
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Copy workspace root files for Bun workspace resolution
COPY package.json bun.lock ./
COPY apps/local-issues/package.json apps/local-issues/

# Install dependencies using workspace lockfile
RUN bun install --frozen-lockfile

# Copy application source
WORKDIR /app/apps/local-issues
COPY apps/local-issues/src/ src/
COPY apps/local-issues/tsconfig.json ./
COPY apps/local-issues/drizzle.config.ts ./
RUN bun build --compile --minify src/index.ts --outfile server

# Stage 2: Runtime (minimal Alpine)
FROM alpine:3.21 AS runtime
WORKDIR /app

# Install minimal runtime deps for compiled Bun binary
RUN apk add --no-cache libgcc libstdc++

# Create non-root user
RUN addgroup -g 1001 appuser && \
    adduser -u 1001 -G appuser -s /bin/false -D appuser

# Copy compiled binary
COPY --from=build /app/apps/local-issues/server ./server

# Copy entrypoint script for umask and permission enforcement
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Create data directory for SQLite
RUN mkdir -p /app/.run && chown -R appuser:appuser /app/.run && chmod 700 /app/.run

USER appuser

ENV NODE_ENV=production
ENV MCP_PORT=8834
ENV LOCAL_ISSUES_DB_PATH=/app/.run/local-issues.db

EXPOSE 8834

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8834/healthz || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["./server"]
