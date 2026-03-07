# Error Responses

This document maps error codes used by local-issues MCP tools to their MCP error semantics.

## MCP Error Response Format

All tool errors follow the MCP `isError: true` convention. Two response shapes exist:

### Structured Error (tools with error codes)

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Plain Text Error (tools without error codes)

```text
Error message string
```

## Error Code Reference

### list_cycles

| Error Code | Trigger | Description |
|---|---|---|
| `INTERNAL_ERROR` | Unexpected exception in query execution | Catch-all for unhandled errors (e.g., invalid teamId causing DB error) |

### extract_images

| Error Code | Trigger | Description |
|---|---|---|
| `RELATIVE_URL_WITHOUT_BASE` | Markdown contains relative image URLs but `base_url` param is not provided | Returned as `result.error`, not thrown |

Non-fatal errors (per-image failures) are recorded in the `skipped_urls` array:

| Skipped Reason | Trigger |
|---|---|
| `HTTP {status}` | Image fetch returned non-2xx status |
| `The operation was aborted` | Image fetch exceeded 10s timeout |
| `Invalid data URL format` | `data:` URL does not match `data:{mime};base64,{data}` pattern |
| Network/DNS error message | fetch() threw (e.g., ENOTFOUND, ECONNREFUSED) |

### search_documentation

| Error Code | Trigger | Description |
|---|---|---|
| `SEARCH_ERROR` | FTS5 query syntax error or DB exception | Wraps raw SQLite FTS5 errors (e.g., unmatched quotes in MATCH expression) |

### Issues, Documents, Projects, Comments, Attachments (CRUD tools)

These tools return plain text errors without structured error codes:

| Error Pattern | Trigger |
|---|---|
| `"Issue not found"` | get_issue with non-existent ID/identifier |
| `"Issue status not found"` | get_issue_status with non-existent name/ID |
| `"Team not found: {id}"` | Operation referencing non-existent team |
| `"Project not found: {id}"` | Operation referencing non-existent project |
| `"Document not found"` | get_document / update_document with non-existent ID/slug |
| `"Label \"{name}\" already exists..."` | create_issue_label with duplicate name in same scope |
| `"Invalid state transition: {from} -> {to}..."` | Project state change violating allowed transitions |
| Validation error message | Zod schema validation failure (invalid params) |
| Exception message string | Catch-all for unhandled exceptions |

## MCP Protocol Error Code Mapping

The MCP SDK maps tool-level errors to JSON-RPC error codes at the transport layer:

| MCP Layer | JSON-RPC Code | When |
|---|---|---|
| Tool returns `isError: true` | (not a JSON-RPC error) | Tool executed but reported a domain error; client sees `isError` flag |
| Zod validation fails | `-32602` (Invalid params) | Request params do not match tool's zod schema |
| Tool not found | `-32601` (Method not found) | Requested tool name does not exist |
| Transport error | `-32603` (Internal error) | Server-side crash before tool execution |

## HTTP Endpoint Errors

| Endpoint | Status | Body |
|---|---|---|
| `GET /health` | `200` | `{"status":"ok","version":"..."}` |
| `POST /mcp` | Handled by MCP SDK | JSON-RPC response (success or error) |
| Any other path | `404` | `{"error":"not found"}` |
