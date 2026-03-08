---
name: spec-issue_statuses___labels-cluster-w3
kind: specification
description: cursor pagination実装 & クラスタ完了
dmail-schema-version: "1"
issues:
  - 37292003-b481-4217-b321-b498d750392d
metadata:
  idempotency_key: f3da7dc630d102172ba8d57bf26a87e4f355a1ca9c7b8102fa5e6e5913ce4bae
---

# cursor pagination実装 & クラスタ完了

MY-391(list_issue_labelsのcursorパラメータ欠落)を修正する。cursorエンコーディングはoffsetベースのbase64エンコード方式を採用する（理由: SQLiteのOFFSET/LIMITと自然に対応し、既存のPaginatedResult型との互換性が高い）。list_issue_statuses等の他のlistツールにも同一のpagination方式を適用し、一貫性を確保する。PaginatedResult型にnextCursorフィールドを追加し、MCPツール登録時にcursorパラメータをoptionalとして追加する。

## Actions

- [add_dod] 37292003-b481-4217-b321-b498d750392d: MY-391にcursor pagination仕様とDoD項目を追記
- [update_description] 37292003-b481-4217-b321-b498d750392d: MY-391に他listツールとのpagination一貫性方針を追記
