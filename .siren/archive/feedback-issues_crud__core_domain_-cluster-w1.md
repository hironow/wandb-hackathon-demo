---
name: feedback-issues_crud__core_domain_-cluster-w1
kind: feedback
description: Wave Issues CRUD (Core Domain):cluster-w1 feedback for amadeus
dmail-schema-version: "1"
issues:
  - MY-381
  - MY-382
  - MY-383
metadata:
  idempotency_key: 188d329120c0797400bc3005c775b6c20924e82b15d6e1dc7d5d0e750bac0693
---

# Wave Feedback: Bug Issue群のトラッキング整備（estimate・依存関係・ラベル）

Applied 6 action(s).

## Ripple Effects

- [Foundation / Scaffolding] MY-381・MY-382がMY-230（DBスキーマ設計）をblockする依存関係を追加した。MY-230のPRマージ前にこれらBugの解消が必要となり、Foundation / Scaffoldingクラスタのスキーマ完成マイルストーンに影響する可能性がある
- [Issues CRUD (Core Domain)] MY-382がMY-233（issue_relations CRUD）にrelated関係で紐付けられた。issue_relationsのtype CHECK制約が未実装のままMY-233のCRUD実装を進めると、不正なrelation typeが混入するリスクがある。MY-233着手前にMY-382の解消を推奨
