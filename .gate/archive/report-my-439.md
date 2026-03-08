---
name: report-my-439
kind: report
description: 'Expedition #109 completed fix for MY-439'
issues:
    - MY-439
dmail-schema-version: "1"
metadata:
    idempotency_key: cca6b0c94d6010203abeed36be74adde036374fa74a00bca8b04179eec493fba
---

# Expedition #109 Report: Bug: Docker build fails — bun.lock and drizzle/ directory missing from build context (MY-238 DoD violation)

- **Issue:** MY-439
- **Mission:** fix
- **Status:** success
- **PR:** https://github.com/hironow/wandb-hackathon-demo/pull/43

## Summary

Fixed Docker build by changing build context to repo root, updating Dockerfile COPY paths for monorepo layout, removing non-existent drizzle/ directory COPY, moving .dockerignore to repo root, and generating workspace-level bun.lock. All DoD items verified: docker compose build succeeds, container starts, /healthz returns 200.
