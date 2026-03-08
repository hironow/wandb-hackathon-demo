---
name: feedback-teams___users__read-only_-cluster-w2
kind: feedback
description: Wave Teams & Users (Read-only):cluster-w2 feedback for amadeus
dmail-schema-version: "1"
issues:
  - 13d85a2e-59a1-4970-b342-da756758ec06
  - 2819217f-2ee0-467b-b428-985e51c92fb7
  - c7948759-90a4-4495-9a81-ff3b565a1f61
metadata:
  idempotency_key: 1708b716c2c15d3f9aa7e6972b300ed544d789da4f2cb70ca8c12198bec41e6d
---

# Wave Feedback: 技術決定の確定 & スキーマ変更仕様の明文化

Applied 3 action(s).

## Ripple Effects

- [Issues CRUD (Core Domain)] MY-387のusers.team_id FK追加により、issueのassigneeやcreator取得時にuser-team JOIN が可能になる。issue一覧でのチーム別フィルタ実装に影響する可能性がある
- [Foundation & Scaffolding] MY-388のISO-8601 durationパーサーは汎用ユーティリティとして、list_issues等の他ツールの日付フィルタでも再利用される。共通ユーティリティとしての配置を検討すべき
- [Projects & Milestones] MY-389のarchived_atパターン（NULLable TEXTカラム + includeArchivedフィルタ）はprojectsテーブルにも同様に適用可能。list_projectsのincludeArchivedパラメータ実装時に同じパターンを踏襲できる
