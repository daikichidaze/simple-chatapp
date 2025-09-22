import Database from 'better-sqlite3';
import { Message, DbMessage } from '@/types';
import { ulid } from 'ulid';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './data/chat.sqlite';
    db = new Database(dbPath);

    // WALモードと最適化設定
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('busy_timeout = 5000');

    initializeSchema();
  }
  return db;
}

function initializeSchema() {
  if (!db) return;

  // メッセージテーブル作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      text TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
  `);

  // インデックス作成
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_room_ts ON messages(room_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_ts ON messages(ts);
  `);
}

export class MessageRepository {
  private db: Database.Database;
  private insertStmt: Database.Statement;
  private selectRecentStmt: Database.Statement;
  private selectSinceStmt: Database.Statement;
  private selectBeforeStmt: Database.Statement;
  private cleanupByTtlStmt: Database.Statement;
  private cleanupByCountStmt: Database.Statement;

  constructor() {
    this.db = getDatabase();

    // プリペアドステートメント
    this.insertStmt = this.db.prepare(`
      INSERT INTO messages (id, room_id, user_id, display_name, text, ts)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.selectRecentStmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE room_id = ?
      ORDER BY ts DESC
      LIMIT ?
    `);

    this.selectSinceStmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE room_id = ? AND ts > ?
      ORDER BY ts ASC
    `);

    this.selectBeforeStmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE room_id = ? AND ts < ?
      ORDER BY ts DESC
      LIMIT ?
    `);

    this.cleanupByTtlStmt = this.db.prepare(`
      DELETE FROM messages WHERE ts < ?
    `);

    this.cleanupByCountStmt = this.db.prepare(`
      DELETE FROM messages
      WHERE id IN (
        SELECT id FROM messages
        WHERE room_id = ?
        ORDER BY ts DESC
        LIMIT -1 OFFSET ?
      )
    `);
  }

  createMessage(roomId: string, userId: string, displayName: string, text: string, mentions?: string[]): Message {
    const id = ulid();
    const ts = Date.now();

    this.insertStmt.run(id, roomId, userId, displayName, text, ts);

    return {
      id,
      roomId,
      userId,
      displayName,
      text,
      mentions,
      ts,
    };
  }

  getRecentMessages(roomId: string, limit: number = 100): Message[] {
    const rows = this.selectRecentStmt.all(roomId, limit) as DbMessage[];
    return rows.reverse().map(this.mapDbToMessage);
  }

  getMessagesSince(roomId: string, sinceTs: number): Message[] {
    const rows = this.selectSinceStmt.all(roomId, sinceTs) as DbMessage[];
    return rows.map(this.mapDbToMessage);
  }

  getMessagesBefore(roomId: string, beforeTs: number, limit: number = 100): Message[] {
    const rows = this.selectBeforeStmt.all(roomId, beforeTs, limit) as DbMessage[];
    return rows.reverse().map(this.mapDbToMessage);
  }

  cleanupByTtl(ttlMs: number = 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - ttlMs;
    const result = this.cleanupByTtlStmt.run(cutoffTime);
    return result.changes;
  }

  cleanupByCount(roomId: string, maxCount: number = 500) {
    const result = this.cleanupByCountStmt.run(roomId, maxCount);
    return result.changes;
  }

  private mapDbToMessage(row: DbMessage): Message {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      displayName: row.display_name,
      text: row.text,
      ts: row.ts,
    };
  }
}

// クリーンアップジョブ（1分毎）
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupJob() {
  if (cleanupInterval) return;

  const messageRepo = new MessageRepository();

  cleanupInterval = setInterval(() => {
    try {
      // TTLクリーンアップ（24時間）
      const ttlDeleted = messageRepo.cleanupByTtl();

      // 件数制限クリーンアップ（default ルームのみ実装）
      const countDeleted = messageRepo.cleanupByCount('default', 500);

      if (ttlDeleted > 0 || countDeleted > 0) {
        console.log(`Cleanup: deleted ${ttlDeleted} by TTL, ${countDeleted} by count`);
      }
    } catch (error) {
      console.error('Cleanup job error:', error);
    }
  }, 60 * 1000); // 1分毎
}

export function stopCleanupJob() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}