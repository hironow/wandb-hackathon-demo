---
name: feedback-issue_statuses___labels-cluster-w2
kind: feedback
description: Wave Issue Statuses & Labels:cluster-w2 feedback for amadeus
dmail-schema-version: "1"
issues:
  - 81b98779-e15e-4836-ac04-48417dabe651
  - bcce6cc0-154a-4f3c-954f-24b8485ceea6
metadata:
  idempotency_key: 1b03d3efe4dbedaf349c50fb17975b55ac1756dd26cabb6950df9b6de05f3e2b
---

# Wave Feedback: MCPツールエラーハンドリング & seed冪等性方針確定

Applied 3 action(s).

## Ripple Effects

- [Issues CRUD (Core Domain)] MY-386のteamId存在チェックパターンは、issues CRUDツール群（listIssues, getIssueなど）でも同様のバリデーション不足がないか横展開確認が必要
- [Foundation & Scaffolding] MY-385のseed冪等性方針確定（onConflictDoNothing()で十分）は、今後追加されるseedデータ（labels, cycles等）にも同じ方針を適用すべき前例となる
