---
name: spec-comments___attachments-cluster-w2
kind: specification
description: MY-236 DoD残項目補完 & MY-402 影響範囲調査
dmail-schema-version: "1"
issues:
  - 72f195df-1fc3-43b1-910a-a0bf60b6aa26
  - 944581f9-733a-4bf2-873a-8aa2bfd687f8
metadata:
  idempotency_key: af225880b2d1ce43a5b12008da5c3e5f8776aadb0ad5de9475896c6a2f702933
---

# MY-236 DoD残項目補完 & MY-402 影響範囲調査

MY-236のテスト要件チェックリスト・エラーレスポンス形式統一チェックリストの未完了項目を明確化し、attachments保存ディレクトリの.gitignore設定をDoDに追記する。MY-402についてはdeleteAttachmentにも同様のidentifier→UUID未解決問題があるか調査し、結果をdescriptionに反映する。

## Actions

- [add_dod] 72f195df-1fc3-43b1-910a-a0bf60b6aa26: MY-236にattachments保存ディレクトリの.gitignore設定DoDを追記
- [add_dod] 72f195df-1fc3-43b1-910a-a0bf60b6aa26: MY-236にエラーレスポンス形式統一の検証DoDを追記
- [update_description] 944581f9-733a-4bf2-873a-8aa2bfd687f8: MY-402にdeleteAttachment影響調査タスクを追記
