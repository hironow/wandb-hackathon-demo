---
name: spec-issues_crud__core_domain_-cluster-w1
kind: specification
description: Bug Issue群のトラッキング整備（estimate・依存関係・ラベル）
dmail-schema-version: "1"
issues:
  - MY-381
  - MY-382
  - MY-383
metadata:
  idempotency_key: d0c22f5675b0a55fd01e8c79ca3cbb644db6396c67d2c44ed5c0997bd057eeba
---

# Bug Issue群のトラッキング整備（estimate・依存関係・ラベル）

MY-381/382/383のestimate未設定とLinear relations未登録を一括で修正し、クラスタ内の依存関係を可視化する。即座に着手可能な管理タスクのみで構成。

## Actions

- [add_dependency] MY-381: MY-381 → MY-230（親Issue）の依存関係をLinear relationsに登録
- [add_dependency] MY-382: MY-382 → MY-230（親Issue）の依存関係をLinear relationsに登録
- [add_dependency] MY-382: MY-382 → MY-233の依存関係をLinear relationsに登録
- [update_description] MY-381: MY-381にestimateを設定
- [update_description] MY-382: MY-382にestimateを設定
- [update_description] MY-383: MY-383にestimateを設定
