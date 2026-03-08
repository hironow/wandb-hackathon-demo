---
name: report-my-403
kind: report
description: 'Expedition #76 completed verify for MY-403'
issues:
    - MY-403
dmail-schema-version: "1"
metadata:
    idempotency_key: 5bc59784d1ac73301186046c8d74f868ad15a4e58f4465b3017ff543c35a6574
---

# Expedition #76 Report: Bug: toSlug strips non-ASCII characters (Japanese slug support broken)

- **Issue:** MY-403
- **Mission:** verify
- **Status:** success
- **PR:** https://github.com/hironow/wandb-hackathon-demo/pull/32

## Summary

QA verified MY-403 PR #22 — found DoD #3 violation (empty slug for special-chars-only titles). Filed MY-417 and implemented fix with TDD. PR #32 created with 2 new tests.
