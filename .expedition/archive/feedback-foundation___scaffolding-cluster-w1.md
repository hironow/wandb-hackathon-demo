---
name: feedback-foundation___scaffolding-cluster-w1
kind: feedback
description: Wave Foundation & Scaffolding:cluster-w1 feedback for amadeus
dmail-schema-version: "1"
issues:
  - 617ce323-14b8-4ada-bbd1-f977ee61db2e
  - 6ad1aec3-0e07-4fc8-af10-de54a121f57b
metadata:
  idempotency_key: d9eae34001904b7585da63a0773b619c77184d3bae4984cfcf6827a60ae91b6e
---

# Wave Feedback: DoD未確認項目の検証と記録

Applied 4 action(s).

## Ripple Effects

- [CI/CD & DevOps] MY-229 DoD3(READMEフォールバック手順)とDoD6(CI統合フロー)が未実装。CI workflow yaml自体が未作成のため、CI構築クラスタでmcporter emit-tsステップの組み込みが必要。
- [Data Sync & Migration] MY-230のsync_metadataテーブルが未定義、インデックス戦略も未反映。Linear APIとのsync機能実装時にスキーマ追加とインデックス定義のmigrationが必要。
