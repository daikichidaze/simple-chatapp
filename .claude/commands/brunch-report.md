---
description: "現在のGitブランチ状態を分析し、詳細なレポートを生成します"
allowed-tools: ["bash"]
---

# ブランチ状態レポート

現在のGitブランチの状態を詳細に分析し、包括的なレポートを生成します。

## 現在のブランチ情報

!git branch --show-current

## 最新コミット履歴（直近5件）

!git log -n 5 --oneline

## 詳細なコミット情報

!git log -n 5 --pretty=format:"%h - %an, %ar : %s"

## ブランチ間の差分状況

!git status --porcelain

## ステージングエリアの状況

!git diff --cached --stat

## 作業ディレクトリの変更

!git diff --stat

## リモートとの同期状況

!git fetch --dry-run 2>&1 || echo "リモート情報を取得中..."
!git log HEAD..origin/$(git branch --show-current) --oneline 2>/dev/null || echo "リモートブランチとの比較情報なし"

## ブランチの統計情報

!git log --oneline | wc -l | awk '{print "総コミット数: " $1}'
!git log --since="1 week ago" --oneline | wc -l | awk '{print "過去1週間のコミット数: " $1}'

## ファイル変更サマリー

!git diff --name-status HEAD~5 2>/dev/null || echo "比較対象のコミットが不足しています"

## 貢献者情報

!git shortlog -sn --since="1 month ago"

---

## レポート分析

上記の情報を基に、以下の観点で現在のブランチ状況を分析してください：

1. **開発活動の活発度**
2. **コミットの質と頻度**
3. **未コミットの変更状況**
4. **リモートとの同期状態**
5. **今後の開発方針への提案**

このブランチの現状と推奨アクションを教えてください。