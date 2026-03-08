---
name: spec-issues_crud__core_domain_-cluster-w2
kind: specification
description: Bug Issue群のDoD明示化と技術判断の明文化
dmail-schema-version: "1"
issues:
  - MY-233
  - MY-381
  - MY-382
  - MY-383
metadata:
  idempotency_key: 5d106acefd74ad2783639b5d8ef47e3cb3b98d1bb52bd8e4d79885204450af9d
---

# Bug Issue群のDoD明示化と技術判断の明文化

MY-381/382/383にDoD チェックリストを追記し、MY-382のOption A/B選定基準とDrizzle ORM CHECK制約サポート状況を記載、MY-381の既存データマイグレーション戦略を明文化する。加えてMY-233のテスト要件文言をローカルMCPサーバ文脈に修正し、後続Issueへの参照を補完する。

## Actions

- [add_dod] MY-381: MY-381にDoDチェックリストと既存データマイグレーション戦略を追記
- [add_dod] MY-382: MY-382にDoDチェックリストとOption選定基準・技術調査結果を追記
- [add_dod] MY-383: MY-383に正式なDoDチェックリストを追記（Done済みだが記録として）
- [update_description] MY-233: MY-233のテスト要件文言をローカルMCPサーバ文脈に修正し後続Issue参照を追記
