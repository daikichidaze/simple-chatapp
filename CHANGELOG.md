# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-09-22

### Added
- リアルタイムグループチャット機能
- Next.js フロントエンド
- カスタム WebSocket サーバー
- ユーザー認証システム (NextAuth.js)
- メッセージ永続化 (SQLite)
- ユーザープレゼンス表示
- レート制限機能 (トークンバケットアルゴリズム)
- メッセージ自動クリーンアップ (24時間 TTL)
- 包括的テストスイート
  - ユニットテスト
  - 統合テスト
  - E2Eテスト
  - パフォーマンステスト
  - アクセシビリティテスト
- TypeScript サポート
- ESLint 設定
- Jest テスト環境

### Technical Details
- WebSocket と HTTP 同一ポート運用
- JWT トークン認証
- Zod スキーマ検証
- SQLite WAL モード
- グレースフルシャットダウン対応

[0.1.0]: https://github.com/your-repo/simple-chatapp/releases/tag/v0.1.0