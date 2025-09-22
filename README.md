# Simple Group Chat v0.1.0

リアルタイムグループチャットアプリケーション

## 機能

- リアルタイムメッセージング
- ユーザー認証
- メッセージ履歴の永続化
- ユーザープレゼンス表示

## 必要環境

- Node.js 18以上
- npm

## セットアップ

```bash
# 依存関係のインストール
npm install

# 環境変数ファイルをコピー
cp .env.example .env

# 開発サーバーの起動
npm run dev
```

## 利用可能なコマンド

- `npm run dev` - 開発サーバーの起動
- `npm run build` - プロダクションビルド
- `npm start` - プロダクションサーバーの起動
- `npm test` - テスト実行
- `npm run lint` - コードチェック

## アーキテクチャ

- **フロントエンド**: Next.js + React + TypeScript
- **バックエンド**: カスタム WebSocket サーバー
- **データベース**: SQLite (better-sqlite3)
- **認証**: NextAuth.js

## ライセンス

Private