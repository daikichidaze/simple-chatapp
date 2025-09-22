# CLAUDE.md

Claude Code 向け開発ガイド

基本情報・セットアップ → @README.md 参照

## 開発コマンド

コマンド一覧 → @README.md 参照

### 開発時の注意点
- `npm run dev`: TypeScript サーバービルド後に server.js 実行
- `npm run typecheck`: 型チェックのみ（ビルドなし）
- `npm run test:ci`: CI環境用（ウォッチなし・カバレッジ付き）

## アーキテクチャ

技術スタック → @README.md 参照

### システム構成
Next.js フロントエンド + カスタム WebSocket サーバー

### サーバーアーキテクチャ

ハイブリッドサーバー構成：

#### コンポーネント階層
1. **エントリーポイント**: `server.js` - コンパイル済み TS サーバー起動
2. **HTTP サーバー**: `src/lib/server.ts` - Next.js アプリ提供 + WebSocket アップグレード
3. **WebSocket サーバー**: `src/lib/websocket-server.ts` - リアルタイム通信管理
4. **データベース**: `src/lib/database.ts` - SQLite 永続化

### 技術詳細

#### 認証・セキュリティ
- NextAuth.js + JWT
- WebSocket: JWT クッキー認証
- オリジン検証

#### パフォーマンス
- **レート制限**: トークンバケット（バースト10, 3msg/秒）
- **SQLite**: WAL モード + プリペアドステートメント
- **メッセージ管理**: 24h TTL, 500msg/room 制限
- **メモリ管理**: インメモリ状態 + 自動クリーンアップ

### データフロー

1. **認証**: NextAuth.js
2. **WebSocket 接続**: `/ws` エンドポイント（JWT + オリジン検証）
3. **ルーム参加**: 'default' ルーム自動参加 + 履歴取得
4. **メッセージング**: レート制限 + Zod 検証
5. **永続化**: SQLite 保存 + ルーム内ブロードキャスト
6. **クリーンアップ**: 自動バックグラウンド処理（毎分）

## テスト

### 構造: `src/__tests__/`
- `unit/` - 個別コンポーネント
- `integration/` - マルチコンポーネント
- `contract/` - WebSocket メッセージ
- `acceptance/` - E2E
- `load/` - パフォーマンス
- `a11y/` - アクセシビリティ

## 実装メモ

<required>
テストファーストでの実装を行うこと
</required>

### 重要ポイント
- WebSocket と Next.js 同一ポート（HTTP アップグレード）
- 全 WebSocket メッセージ Zod 検証（型安全性）
- グレースフルシャットダウン対応