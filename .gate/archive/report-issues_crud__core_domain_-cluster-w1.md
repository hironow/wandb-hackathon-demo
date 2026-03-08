---
name: report-issues_crud__core_domain_-cluster-w1
kind: report
description: Wave Issues CRUD (Core Domain):cluster-w1 completed
dmail-schema-version: "1"
issues:
  - MY-381
  - MY-382
  - MY-383
metadata:
  idempotency_key: 2fffbfb52300cc83152684a8f3338ec3b47d8a66d14c3bcbcff9b80c0b8ebd1e
---

# Wave Completed: Bug Issue群のトラッキング整備（estimate・依存関係・ラベル）

Applied 6 action(s).

## Ripple Effects

- [Foundation / Scaffolding] MY-381・MY-382がMY-230（DBスキーマ設計）をblockする依存関係を追加した。MY-230のPRマージ前にこれらBugの解消が必要となり、Foundation / Scaffoldingクラスタのスキーマ完成マイルストーンに影響する可能性がある
- [Issues CRUD (Core Domain)] MY-382がMY-233（issue_relations CRUD）にrelated関係で紐付けられた。issue_relationsのtype CHECK制約が未実装のままMY-233のCRUD実装を進めると、不正なrelation typeが混入するリスクがある。MY-233着手前にMY-382の解消を推奨
