---
name: spec-foundation___infrastructure-cluster-w2
kind: specification
description: 'MY-230 DoD明確化: SQLite制約・インデックス戦略・sync方針'
dmail-schema-version: "1"
issues:
  - 6ad1aec3-0e07-4fc8-af10-de54a121f57b
metadata:
  idempotency_key: 0135c2f99e635ff847cf8e8be243a9d3e57a05a61dd0697ff188bf41f28b964a
---

# MY-230 DoD明確化: SQLite制約・インデックス戦略・sync方針

MY-230のスキーマ設計に不足しているDoD項目を追記する。MY-230は5つの後続Issueをブロックするクリティカルパス上のIssueであり、SQLite運用上の制約設定、インデックス設計、Linear APIからのsync方向、カスケード削除ポリシー、seedデータ仕様を明確化することで後続作業の手戻りを防ぐ。

## Actions

- [add_dod] 6ad1aec3-0e07-4fc8-af10-de54a121f57b: SQLite運用制約の明記（WALモード・外部キー制約）
- [add_dod] 6ad1aec3-0e07-4fc8-af10-de54a121f57b: インデックス戦略の定義
- [add_dod] 6ad1aec3-0e07-4fc8-af10-de54a121f57b: Linear APIからのsync方向を明確化
- [add_dod] 6ad1aec3-0e07-4fc8-af10-de54a121f57b: カスケード削除ポリシーの定義
- [add_dod] 6ad1aec3-0e07-4fc8-af10-de54a121f57b: seedデータ仕様の明記
