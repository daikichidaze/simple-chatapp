/**
 * Mention extraction utilities
 * Based on spec appendix B: メンション抽出（最終版）
 */

export interface OnlineUser {
  id: string;
  displayName: string;
}

/**
 * Extract mention tokens from text (@alice, @Bob)
 * Returns lowercase tokens for case-insensitive matching
 */
export function extractMentionTokens(text: string): string[] {
  // @alice, @Bob を抽出し、小文字化
  const regex = /@([\w.-]{1,50})/g;
  const tokens: string[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    tokens.push(match[1].toLowerCase());
  }

  return Array.from(new Set(tokens)); // 重複除去
}

/**
 * Resolve mention tokens to user IDs based on online users
 * Returns array of user IDs that match the mentions
 */
export function resolveMentionsToUserIds(
  mentionTokens: string[],
  onlineUsers: OnlineUser[]
): string[] {
  const displayNameToId = new Map<string, string>();

  // オンラインユーザーの表示名(小文字)→userIdマッピング作成
  onlineUsers.forEach(user => {
    displayNameToId.set(user.displayName.toLowerCase(), user.id);
  });

  // メンション対象のuserIdを解決
  const resolvedUserIds: string[] = [];
  mentionTokens.forEach(token => {
    const userId = displayNameToId.get(token);
    if (userId) {
      resolvedUserIds.push(userId);
    }
  });

  return Array.from(new Set(resolvedUserIds)); // 重複除去
}

/**
 * Extract mentions from text and resolve to user IDs in one step
 */
export function extractMentions(text: string, onlineUsers: OnlineUser[]): string[] {
  const tokens = extractMentionTokens(text);
  return resolveMentionsToUserIds(tokens, onlineUsers);
}

/**
 * Highlight mentions in text for display
 * Replaces @username with styled spans
 */
export function highlightMentions(
  text: string,
  onlineUsers: OnlineUser[],
  className: string = 'mention'
): string {
  const displayNameToId = new Map<string, string>();
  onlineUsers.forEach(user => {
    displayNameToId.set(user.displayName.toLowerCase(), user.id);
  });

  return text.replace(/@([\w.-]{1,50})/g, (match, username) => {
    const userId = displayNameToId.get(username.toLowerCase());
    if (userId) {
      return `<span class="${className}" data-user-id="${userId}">${match}</span>`;
    }
    return match; // 見つからない場合はそのまま
  });
}