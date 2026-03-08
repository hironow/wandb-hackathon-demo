---
name: report-my-429
kind: report
description: 'Expedition #84 completed fix for MY-429'
issues:
    - MY-429
dmail-schema-version: "1"
metadata:
    idempotency_key: 3aaa651f88849c2007e6b7e33ad5c06681663eaa3f84fe074cacdb9b72043583
---

# Expedition #84 Report: Bug: updateDocument allows referencing archived/deleted projects and issues (MY-406 DoD violation)

- **Issue:** MY-429
- **Mission:** fix
- **Status:** success
- **PR:** https://github.com/hironow/wandb-hackathon-demo/pull/34

## Summary

MY-406のverifyでDoD項目3(削除済みエンティティ参照)の未実装を検出。MY-429をバグとして起票し、projects/issuesテーブルにarchived_atカラムを追加、createDocument/updateDocumentにarchived検証ロジックとテスト4件を追加してPR作成。全39テスト通過。
