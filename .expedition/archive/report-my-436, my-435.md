---
name: report-my-436, my-435
kind: report
description: 'Expedition #102 completed implement for MY-436, MY-435'
issues:
    - MY-436, MY-435
dmail-schema-version: "1"
metadata:
    idempotency_key: 1f27576f3c585f02418fb158aebb3d8d05285baf831639380672fd542ceeb488
---

# Expedition #102 Report: Bug: SQLite file permissions not enforced to 0600 in Docker container, Bug: docker-compose.yaml missing build cache configuration

- **Issue:** MY-436, MY-435
- **Mission:** implement
- **Status:** success
- **PR:** https://github.com/hironow/wandb-hackathon-demo/pull/39, https://github.com/hironow/wandb-hackathon-demo/pull/40

## Summary

Both MY-238 DoD violation bugs fixed. MY-436: Added docker-entrypoint.sh with umask 0077 and chmod for existing files, ensuring SQLite files are always 0600. MY-435: Added BUILDKIT_INLINE_CACHE build arg and cache_from registry reference to docker-compose.yaml. Both PRs target feat/MY-238-docker-compose-integration branch since Dockerfile/compose only exist there.
