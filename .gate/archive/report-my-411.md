---
name: report-my-411
kind: report
description: 'Expedition #66 completed implement for MY-411'
issues:
    - MY-411
dmail-schema-version: "1"
metadata:
    idempotency_key: b829e345f50c9efbd2da68e46b3935a52b65a7f556d840a633d9a55cd4bae9d5
---

# Expedition #66 Report: Bug: FTS5 performance benchmark test missing (10,000 docs / 200ms requirement)

- **Issue:** MY-411
- **Mission:** implement
- **Status:** success
- **PR:** https://github.com/hironow/wandb-hackathon-demo/pull/30

## Summary

FTS5 benchmark test implemented with 10,000 document seed, 200ms warm-start threshold, SKIP_BENCHMARK=1 CI skip support, and stderr-only result output. All 28 tests pass.
