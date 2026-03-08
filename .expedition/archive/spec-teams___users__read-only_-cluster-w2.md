---
name: spec-teams___users__read-only_-cluster-w2
kind: specification
description: 技術決定の確定 & スキーマ変更仕様の明文化
dmail-schema-version: "1"
issues:
  - 13d85a2e-59a1-4970-b342-da756758ec06
  - 2819217f-2ee0-467b-b428-985e51c92fb7
  - c7948759-90a4-4495-9a81-ff3b565a1f61
metadata:
  idempotency_key: 9de4b4a45c839ea893b66921b1e7e346cca3164993144ab63b8d7223cd8ebc8e
---

# 技術決定の確定 & スキーマ変更仕様の明文化

Wave 1でDoD枠は定義されたが、MY-387のuser-team関連設計（Option A/B/C）、MY-388のISO-8601 durationパーサー方針、MY-389のusersテーブルarchived_at要否がいずれも未確定。これらの技術決定を確定し、スキーマ変更が必要なIssue（MY-387, MY-389）のマイグレーション仕様を明記する。これにより3件のバグ修正が並行着手可能になる。

## Actions

- [update_description] c7948759-90a4-4495-9a81-ff3b565a1f61: MY-387: user-team関連設計をOption A（1対多）に確定し、マイグレーション手順を明記
- [update_description] 13d85a2e-59a1-4970-b342-da756758ec06: MY-388: ISO-8601 durationパーサー方針と日付フィルタ比較仕様を確定
- [update_description] 2819217f-2ee0-467b-b428-985e51c92fb7: MY-389: usersテーブルarchived_at要否を確定し、マイグレーション仕様を明記
