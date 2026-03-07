# Stage 1: Install dependencies and build
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ src/
COPY tsconfig.json ./
COPY drizzle.config.ts ./
COPY drizzle/ drizzle/
RUN bun build --compile --minify src/index.ts --outfile server

# Stage 2: Runtime (minimal Alpine)
FROM alpine:3.21 AS runtime
WORKDIR /app

# Install minimal runtime deps for compiled Bun binary
RUN apk add --no-cache libgcc libstdc++

# Create non-root user
RUN addgroup -g 1001 appuser && \
    adduser -u 1001 -G appuser -s /bin/false -D appuser

# Copy compiled binary and drizzle migrations
COPY --from=build /app/server ./server
COPY --from=build /app/drizzle drizzle/

# Create data directory for SQLite
RUN mkdir -p /app/.run && chown -R appuser:appuser /app/.run && chmod 700 /app/.run

USER appuser

ENV NODE_ENV=production
ENV MCP_PORT=8834
ENV LOCAL_ISSUES_DB_PATH=/app/.run/local-issues.db

EXPOSE 8834

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8834/healthz || exit 1

CMD ["./server"]
