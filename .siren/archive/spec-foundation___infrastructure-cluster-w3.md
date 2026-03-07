---
name: spec-foundation___infrastructure-cluster-w3
kind: specification
description: mcporter出力とDrizzleスキーマの整合性検証手段の追加
dmail-schema-version: "1"
issues:
  - 617ce323-14b8-4ada-bbd1-f977ee61db2e
  - 6ad1aec3-0e07-4fc8-af10-de54a121f57b
metadata:
  idempotency_key: 3ed7f77e4564220662efff564f31ddd47f7a34084469466eef78693b59a55ff7
---

# mcporter出力とDrizzleスキーマの整合性検証手段の追加

観察事項で指摘されたmcporter出力とDrizzleスキーマの整合性検証手段が未定義である点に対応する。fogレベルのためサブIssue化はせず、両IssueのDescriptionに検証手段をWarningとして追記する。

## Actions

- [update_description] 617ce323-14b8-4ada-bbd1-f977ee61db2e: MY-229にmcporter→Drizzle整合性チェックの注記を追加
- [update_description] 6ad1aec3-0e07-4fc8-af10-de54a121f57b: MY-230にスキーマ変更時の型整合性確認手順の注記を追加
