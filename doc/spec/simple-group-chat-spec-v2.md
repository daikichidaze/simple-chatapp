# プロジェクト仕様書（v2 / 全面改訂）

**プロジェクト名**: Simple Group Chat (Web) — Prototype  
**目的**: 一般ユーザー向けの雑談用グループチャット（UIスタイル: System-Native Minimal）  
**対象プラットフォーム**: PC / スマホ（レスポンシブWeb）  
**認証**: Google OAuth（NextAuth.js + JWT セッション / Cookie）  
**保存ポリシー**: **短期永続**（SQLite。各ルーム直近 N=500 件、TTL=24h。ページ再読込で直近履歴再取得）  
**ユーザー規模**: 登録5名、同時接続5名  
**コスト制約**: プロトタイプのため上限設定なし  
**テスト方針**: Unitテスト（TDD）、契約テスト、a11y自動チェック

---

## 1. スコープ

### 1.1 MVPに含む
- グループチャット（1つ以上のチャットルーム、既定は `default`）
- リアルタイム配信（即時反映）
- Googleでサインイン（`openid profile` のみ）
- テキストメッセージ送受信
- メンション（@username）※入力補完は表示名、保存は userId
- レスポンシブUI（PC/スマホ）
- ユーザー設定（表示名の上書き/サインアウト）
- 再接続と差分同期（sinceTs / beforeId カーソル）

### 1.2 MVPに含まない（Phase 2 以降）
- 既読・通知（ブラウザ通知 / Web Push）
- 画像/ファイル/音声メモ/絵文字リアクション
- メッセージ編集・削除
- 検索、スレッド/引用返信
- 招待リンク/複数ルーム権限、分析、アラート、BAN/通報
- 永続保存（オプトイン履歴）

---

## 2. 要件

### 2.1 機能要件（FRD）
1) **認証**
- ユーザーはGoogleでサインインできる。  
- 初回サインイン時に表示名を設定/上書き可能（セッション/メモリ保持、永続しない）。  
- セッションは**Cookie版JWT**（HttpOnly, Secure, SameSite=Lax）で保持。

2) **チャット**
- ログイン済ユーザーは既定ルームに参加し、テキストを送受信できる。  
- メンション：`@`入力で**オンラインユーザーの表示名**候補をサジェスト。送信時は**mentions=userId配列**で保存、表示はハイライト。  
- **サーバ発行 ts / id**：送信時にサーバが `ts`（ms）と `id`（ULID推奨）を付与。  
- **リアルタイム反映**：他クライアントへ100–300ms程度で配送（目標値）。  
- **短期永続**：各ルーム直近 N=500 / TTL=24h をSQLiteで保持。入室時に直近 M=100 件を返却。  
- **差分同期**：再接続時に `sinceTs` 以降を送る。履歴遡りは `beforeId` / `beforeTs` でページング。

3) **ユーザー設定**
- 表示名の一時変更（サーバメモリ内保持）。  
- サインアウト。

### 2.2 非機能要件（NFRD）
- **パフォーマンス**: 〜5同時接続で安定。  
- **スケーラビリティ**: 単一インスタンス前提（水平分割は将来対応）。  
- **可観測性**: 構造化ログ（JSON）。PIIなし。  
- **アクセシビリティ**: キーボード操作・コントラスト配慮、`aria-live="polite"`、フォーカス可視。  
- **言語**: 英語UIのみ。  
- **モーション**: `prefers-reduced-motion` 尊重。

---

## 3. アーキテクチャ

### 3.1 推奨スタック（OSS）
- **フロント**: Next.js（App Router） + React + Tailwind CSS  
- **リアルタイム**: WebSocket（`ws` 推奨）  
- **認証**: NextAuth.js（Google Provider / JWT）  
- **バックエンド**: Next.js Route Handler（Node ランタイム）  
- **データ**: SQLite（1ファイル / WAL）短期永続  
- **デプロイ**: Render / Fly.io / 自前Node（**単一リージョン**）。Vercel Edge/ServerlessはWS常時接続非推奨。

### 3.2 コンポーネント（論理）
- **Browser (Next.js SPA)**
  - Auth Client (NextAuth)
  - Chat UI（Room / MessageList / Composer / MentionPicker）
  - WS Client
- **Web Server**
  - Next.js Pages / API Routes
  - NextAuth（Google OAuth）
  - WS Server（presence=インメモリ、message=SQLite）

---

## 4. データモデル（SQLite＋インメモリ）
> メッセージは**短期永続（24h/500件）**でSQLite。presence/設定はメモリ。

```ts
// User (session-scoped)
{
  id: string,           // Google sub（ハッシュ化可）
  displayName: string,
  avatarUrl?: string    // 取得しない/空で可
}

// Room
{
  id: string,           // "default"（将来拡張可）
  members: Set<UserID>
}

// Message (short-term persistent)
{
  id: string,           // ULID（時系列ソート可能）
  roomId: string,
  userId: string,
  displayName: string,  // 当時の表示名を冗長保持（履歴再現）
  text: string,         // 最大 2000〜4000 文字（制限は実装に合わせる）
  mentions?: string[],  // userId の配列（表示はクライアントで解決）
  ts: number            // サーバ発行の送信時刻（ms）
}
```

**SQLite スキーマ**
```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_ts ON messages(room_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_ts ON messages(ts);
```

**クリーンアップ（定期ジョブ / 1分毎推奨）**
```sql
-- TTL（24h）
DELETE FROM messages WHERE ts < :now_ms - 86400000;

-- 件数上限（ルーム単位：最新500件だけ残す）
DELETE FROM messages
WHERE id IN (
  SELECT id FROM messages
  WHERE room_id = :roomId
  ORDER BY ts DESC
  LIMIT -1 OFFSET 500
);
```

---

## 5. API / プロトコル

### 5.1 認証
- **`/api/auth/[...nextauth]`**（NextAuth + Google）
  - スコープ：`openid profile` のみ（**email 取得しない**を推奨）
  - セッション：Cookie版JWT（HttpOnly, Secure, SameSite=Lax）
  - CSRF：NextAuth 準拠

### 5.2 WebSocket（例: `/ws`）
- **接続**: 認証必須。**WS Upgrade時にCookieのJWTを検証**（クエリトークン不可）。`Origin` チェック  
- **サブプロトコル**: JSON  
- **レート制限**: 1ユーザー毎秒3通（バースト10）、超過は `RATE_LIMIT`  
- **イベント型（契約）**

```ts
// client → server
type Join        = { type: "join"; roomId: string; sinceTs?: number; beforeId?: string };
type SendMessage = { type: "message"; roomId: string; text: string }; // ts/idはサーバ付与
type SetDisplayName = { type: "set_name"; displayName: string };

// server → client
type Hello    = { type: "hello"; selfId: string; users: {id:string;displayName:string}[] };
type Presence = { type: "presence"; users: {id:string;displayName:string}[] };
type Message  = { type: "message"; id:string; roomId:string; userId:string; text:string; mentions?:string[]; ts:number };
type History  = { type: "history"; roomId:string; messages: Message[]; nextCursor?: { beforeId?: string; beforeTs?: number } };
type Error    = { type: "error"; code: "UNAUTH"|"RATE_LIMIT"|"BAD_REQUEST"|"SERVER_ERROR"; msg:string };
```

**メッセージ例**
```json
// client → server
{"type":"message","roomId":"default","text":"Hello @alice"}

// server → clients
{"type":"message","id":"01J8R6X7...","roomId":"default","userId":"u_001","text":"Hello @alice","mentions":["u_002"],"ts":1737592330123}
```

---

## 6. UI要件（System-Native Minimal）

- **テーマ**：OSのライト/ダークに追従（`prefers-color-scheme`）  
- **色/トークン（Tailwind例）**  
  - bg: `#fff` / `#0b0f14`、muted: `#f8fafc` / `#0f172a`  
  - text: `#0f172a` / `#e5e7eb`、border: `#e5e7eb` / `#1f2937`  
  - accent: `blue-500`（hover: `blue-600`）  
- **タイポグラフィ**：`Inter`, `ui-sans-serif`, `system-ui`。見出し18–22px、本文14–16px、行間1.5  
- **レイアウト**：8ptグリッド。PCは左：オンライン一覧／中央：メッセージ／上：ルーム名。モバイルはオンライン一覧をドロワー  
- **コンポーネント**  
  - Button：`rounded-md`、実線、フォーカスリング明確  
  - Input/Textarea：ボーダー＋フォーカスリング、**Shift+Enter=改行／Enter=送信**（設定で反転可）  
  - Message：アバター省略可、ユーザー名・本文・時刻。**メンションは色＋太字＋下線/アイコン**  
  - Mention Picker：`@`でポップオーバ、オンラインのみ、矢印キー操作  
  - 送信UI：文字数カウンタ、送信中スピナー、二重送信抑止  
- **モーション**：100–150ms `ease-out`、過度なアニメ禁止、`prefers-reduced-motion`尊重  
- **アクセシビリティ**  
  - メッセージリスト：`role="log"` + `aria-live="polite"`  
  - コントラスト比 4.5:1 以上、キーボードフォーカス常時可視

**画面**
1. **Login**（Googleボタンのみ）  
2. **Chat**（ルームヘッダ、メッセージリスト、送信欄、オンラインユーザー/メンションピッカー）  
3. **User Settings**（表示名上書き、Sign out）

---

## 7. セキュリティ / プライバシー
- **最小保存**：メッセージは短期永続（N=500 / TTL=24h）。ユーザープロファイルはセッション/メモリのみ  
- **PII削減**：Googleの `sub` と `displayName` のみ。**emailは取得しない**  
- **輸送**：HTTPS/WSS  
- **CSRF**：NextAuth依存、WSはJWT検証 + `Origin` チェック  
- **コンテンツ安全**：受信テキストはサニタイズ、リンクは `rel="noopener noreferrer"`、プレビュー無効  
- **レート制限**：ユーザー毎秒3通（バースト10）。超過は429/`RATE_LIMIT`

---

## 8. テスト（TDD）
- **方針**：仕様→契約/ユニットテスト→実装→リファクタ  
- **契約テスト**：WSの型/必須フィールドを `zod` 等で検証、スナップショット  
- **ユニット**：  
  - メンション抽出/トークン化（表示名→userId解決）  
  - WSハンドラ（join/message/presence、差分同期、重複なし）  
  - 認証ガード（未認証接続拒否）  
  - 表示名上書きロジック  
- **負荷スモーク**：5ユーザー×60秒、合計10 msg/s、欠損・順序崩れなし  
- **a11y自動チェック**：`@testing-library/jest-dom` + `axe-core` で主要画面違反0  
- **カバレッジ目安**：主要ロジック>80%

---

## 9. フィーチャートグル（将来/Phase 2）
- メッセージ検索（全文/ユーザー/期間）  
- スレッド/引用返信  
- 通知（Web Push）  
- 画像/ファイル/絵文字/既読  
- 招待リンク/複数ルーム/権限  
- 永続化（履歴保存：オプトイン）

---

## 10. 受入基準（サンプル / チェックリスト）
1. Googleサインイン成功でチャット画面へ遷移。  
2. 同一ルームの5ユーザー間で、送信から**300ms程度**以内に相互表示。  
3. `@`入力でオンライン候補が表示され、選択で本文がハイライト。  
4. ページ再読込後も直近 **M=100件** が表示（短期永続方針を満たす）。  
5. 2,000文字超のメッセージは送信不可で**警告表示**（*Too long*）。  
6. 1秒あたり4通以上連投すると、4通目以降が **429/`RATE_LIMIT`**。UIに “Slow down”。  
7. 未認証WSは **Upgrade時に401** で拒否。  
8. ネット切断→10秒後再接続で、**重複なし**に `sinceTs` 以降が同期。  
9. スクリーンリーダーで新着を読み上げ（`aria-live="polite"`）。  
10. CIでユニット/契約/a11yテストが全て成功（主要ロジック>80%）。

---

## 11. 実装ノート（手順）
1. Next.js + Tailwind セットアップ（App Router）  
2. NextAuth + Google Provider（`openid profile`、Cookie版JWT）  
3. WSサーバ（`ws`）をNext.js内Nodeランタイムで常時起動（Edge不可）  
4. インメモリ `rooms/users/presence` とブロードキャスト  
5. SQLite 接続（WAL / PRAGMA）、メッセージ保存・TTL/件数クリーンアップの定期ジョブ  
6. フロント：Chat UI、MentionPicker、WSクライアント（再接続と差分同期）  
7. レート制限（トークンバケット）、サニタイズ、Origin検証  
8. テスト作成→実装→リファクタ

---

## 12. ログ/運用
- **構造化ログ（JSON）**：`time, level, reqId, userId(hash), event, latencyMs` など  
- **相関ID**：接続ごとに `reqId` を付与  
- **監視**：エラーレート、平均配送遅延、再接続回数

---

## 13. デプロイ/環境
- **PaaS相性**：Vercel(Edge/Serverless)はWS常時接続非推奨 → **Render / Fly.io / 自前Node** 推奨  
- **単一リージョン・単一インスタンス**で確認（マルチは将来Redis Pub/Sub）  
- **.envサンプル**
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_URL=https://example.com
NEXTAUTH_SECRET=...
DATABASE_URL=file:./data/chat.sqlite
NODE_ENV=production
```

---

## 付録A：WSイベント定義（最終版）
（§5.2の型定義を参照。実装は `zod`/`valibot` 等でバリデート）

## 付録B：メンション抽出（最終版）
```ts
function extractMentions(text: string, onlineNames: string[]): string[] {
  // @alice, @Bob を抽出し、オンライン名にマッチするものだけ小文字化で照合
  const tokens = [...text.matchAll(/@([\w.-]{1,50})/g)].map(m => m[1].toLowerCase());
  const set = new Set(onlineNames.map(n => n.toLowerCase()));
  return tokens.filter(t => set.has(t));
}
// 保存時は displayName→userId に解決し mentions に userId配列を入れる
```

## 付録C：取得API（将来拡張互換のためのフォーマット例）
```
GET /api/messages?roomId=default&beforeId=01J8...&limit=100
// 将来の検索用パラメータは受けても無視（後方互換）
```

---

**備考（リスク）**
- 単一インスタンス前提（SQLiteはローカル）。再起動後もTTL内で履歴は残る。  
- マルチインスタンス化時は**Redis Pub/Sub**等の導入が必須。  
- Googleログインの到達性/リージョン規制に依存。
