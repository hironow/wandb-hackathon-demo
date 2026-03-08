---
name: spec-issue_statuses___labels-cluster-w2
kind: specification
description: MCPツールエラーハンドリング & seed冪等性方針確定
dmail-schema-version: "1"
issues:
  - 81b98779-e15e-4836-ac04-48417dabe651
  - bcce6cc0-154a-4f3c-954f-24b8485ceea6
metadata:
  idempotency_key: d89e0511dd0d37751f1ef8056d2a6706b8e43888a89152b2f6d805a61ea6aaf5
---

# MCPツールエラーハンドリング & seed冪等性方針確定

MY-386(存在しないteamIdでの明示的エラー返却)とMY-385(seed処理のmetadata管理)を対処する。MY-386はlistIssueStatuses/getIssueStatusの両ツールでteamId存在チェックを追加し、不在時はisError:trueを返却する。getIssueStatusではid検索・name検索の両パスでteamId検証を行う。MY-385はonConflictDoNothing()による実質的冪等性が確保済みであることを踏まえ、metadata管理の追加は費用対効果が低いためDoD文言を実態に合わせて更新する方針とする（fog: Warning扱い）。両件はバリデーション層とseed層で独立しており並行作業可能。

## Actions

- [add_dod] 81b98779-e15e-4836-ac04-48417dabe651: MY-386にMCPツールレベルの具体的実装仕様とDoD項目を追記
- [update_description] bcce6cc0-154a-4f3c-954f-24b8485ceea6: MY-385の方針を明確化: onConflictDoNothing()による実質的冪等性で十分と判断
- [add_dod] bcce6cc0-154a-4f3c-954f-24b8485ceea6: MY-385のDoDを実態に合わせて更新
