---
name: report-my-382
kind: report
description: 'Expedition #86 completed verify for MY-382'
issues:
    - MY-382
dmail-schema-version: "1"
metadata:
    idempotency_key: 9c7f724debda6446f68739fcf3c4bd12e4152a88152a29c2e2b1877e375c9812
---

# Expedition #86 Report: Bug: issue_relations type column missing CHECK constraint or validation

- **Issue:** MY-382
- **Mission:** verify
- **Status:** success
- **PR:** https://github.com/hironow/sandbox-alpha/pull/12

## Summary

All 3 DoD items verified — CHECK constraint added via Drizzle check() helper, tests for valid/invalid types present, all 20 tests pass (0 fail, 55 assertions)
