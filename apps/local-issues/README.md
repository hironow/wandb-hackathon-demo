# local-issues MCP Server

A local MCP (Model Context Protocol) server for issue tracking, built with Bun + Drizzle ORM + SQLite.

## Quick Start

```bash
cd apps/local-issues
bun install
bun run dev
```

The server starts on port 3100 by default.

## Port Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_PORT` | `3100` | HTTP server port |
| `LOCAL_ISSUES_DB_PATH` | `.run/local-issues.db` | SQLite database file path |
| `LOG_LEVEL` | `info` | Logging verbosity |

### Changing the Port

Set the `MCP_PORT` environment variable:

```bash
# Local development
MCP_PORT=4000 bun run dev

# Docker Compose (override in docker-compose.yaml or .env)
MCP_PORT=4000 docker compose up
```

When changing the port in Docker, update both the environment variable and the port mapping in `docker-compose.yaml`:

```yaml
services:
  local-issues-mcp:
    ports:
      - "4000:4000"
    environment:
      MCP_PORT: "4000"
```

### Docker Port Allocation

Port 8834 is assigned for Docker deployment. See the port allocation registry in `docker-compose.yaml` at the repository root.

## Endpoints

- `GET /healthz` — Health check (returns `{"status":"ok","version":"..."}`)
- `POST /mcp` — MCP Streamable HTTP transport

## Testing

```bash
bun test
```

## Docker

```bash
# Build and run with docker compose
docker compose up local-issues-mcp

# Or build standalone
docker build -t local-issues-mcp apps/local-issues/
docker run -p 8834:8834 local-issues-mcp
```
