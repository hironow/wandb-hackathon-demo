---
name: report-my-387
kind: report
description: 'Expedition #83 completed verify for MY-387'
issues:
    - MY-387
dmail-schema-version: "1"
metadata:
    idempotency_key: b766e631787473e069c7eabce3989945d3d469d06b3ba4179f8781f769d3686c
---

# Expedition #83 Report: Bug: list_users の team パラメータが受け取りのみで未実装 (silent ignore)

- **Issue:** MY-387
- **Mission:** verify
- **Status:** success
- **PR:** https://github.com/hironow/wandb-hackathon-demo/pull/33

## Summary

Verified PR #17 (MY-387/388/389) against DoD checklists. Found 3 defects: MY-426 (list_users missing date filters), MY-427 (missing non-existent team test), MY-428 (seed missing archived team). Filed bug issues and implemented fixes in PR #33 with 51/51 tests passing.
