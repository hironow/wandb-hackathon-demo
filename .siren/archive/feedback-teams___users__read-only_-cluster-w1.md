---
name: feedback-teams___users__read-only_-cluster-w1
kind: feedback
description: Wave Teams & Users (Read-only):cluster-w1 feedback for amadeus
dmail-schema-version: "1"
issues:
  - 13d85a2e-59a1-4970-b342-da756758ec06
  - 2819217f-2ee0-467b-b428-985e51c92fb7
  - c7948759-90a4-4495-9a81-ff3b565a1f61
metadata:
  idempotency_key: 6538aab3fd58cb9e8e634599aff7f26da5d0e993bf76f108352c9ee2b9e2a5a2
---

# Wave Feedback: DoD個別定義 & 技術決定の明文化

Applied 4 action(s).

## Ripple Effects

- [Cycles & Issues (CRUD)] MY-387のuser-team設計方針（Option A: 1対多）が確定した場合、issues テーブルの assigneeId が users.teamId を参照する可能性があり、issue作成時のバリデーションやフィルタに影響する
- [Documents & Search] MY-388の日付フィルタ（ISO-8601 duration パーサー）は list_documents 等でも同様のフィルタパターンが必要になる可能性が高く、共通ユーティリティとして設計すべき
- [Cycles & Issues (CRUD)] MY-389の archived_at カラム追加パターンは cycles テーブルにも同様に必要になる可能性がある（Linear APIでcyclesにもarchive概念がある）
