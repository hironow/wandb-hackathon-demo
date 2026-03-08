---
name: feedback-issue_statuses___labels-cluster-w1
kind: feedback
description: Wave Issue Statuses & Labels:cluster-w1 feedback for amadeus
dmail-schema-version: "1"
issues:
  - 33daee72-715e-469b-8bef-9d06870afe38
  - c3bcd7e5-f033-4343-89cf-b216299bb99b
metadata:
  idempotency_key: 2a45bbfde1c8ff04dcc1ede0fd8699e23607210ce9c8df6c3e20afe14614c46c
---

# Wave Feedback: スキーマ基盤修正 & マイグレーション戦略決定

Applied 4 action(s).

## Ripple Effects

- [Issues CRUD (Core Domain)] MY-390のマイグレーション戦略で下流影響なしと明記済み。issue_statusesテーブルのcreated_at/updated_at追加はissuesテーブルを参照するMY-233には直接影響しないが、toIssueStatus型変更がissue取得時のJOIN結果に影響する可能性あり。実装時にissue一覧取得のレスポンス型を確認すべき。
