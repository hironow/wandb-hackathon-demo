---
name: spec-issue_statuses___labels-cluster-w1
kind: specification
description: スキーマ基盤修正 & マイグレーション戦略決定
dmail-schema-version: "1"
issues:
  - 33daee72-715e-469b-8bef-9d06870afe38
  - c3bcd7e5-f033-4343-89cf-b216299bb99b
metadata:
  idempotency_key: f528917bf1193295def0866aa685e15cdbc344cb3b0d2448cc47918462654dd8
---

# スキーマ基盤修正 & マイグレーション戦略決定

MY-390(created_at/updated_atカラム欠落)のマイグレーション戦略を決定し実装する。スキーマ変更は他のbug fixの前提となるため最優先。SQLiteのALTER TABLE ADD COLUMNで既存テーブルにカラム追加し、既存行にはINSERT時点のtimestampをデフォルト値として設定する。併せてMY-380のroot cause(workspace-level vs team-levelスコープ判定ロジック)を修正する。この2件はスキーマ層とバリデーション層で独立しており並行作業可能。

## Actions

- [update_description] 33daee72-715e-469b-8bef-9d06870afe38: MY-390にマイグレーション戦略を明記
- [add_dod] 33daee72-715e-469b-8bef-9d06870afe38: MY-390にDoD項目を追記
- [add_dod] c3bcd7e5-f033-4343-89cf-b216299bb99b: MY-380にテストケース仕様を追記
- [add_dependency] c3bcd7e5-f033-4343-89cf-b216299bb99b: MY-380はMY-390のスキーマ変更と独立して着手可能だが、同一Wave内で完了させる
