// テキストサニタイゼーション機能

export function sanitizeText(text: string): string {
  if (!text) return '';

  // HTMLエスケープ
  let sanitized = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  // 改行をHTML改行に変換
  sanitized = sanitized.replace(/\n/g, '<br>');

  // 基本的なURLリンク化（安全性を考慮して制限的）
  const urlRegex = /(https?:\/\/[^\s<>"]{1,2048})/g;
  sanitized = sanitized.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 underline">$1</a>');

  return sanitized;
}

export function validateMessageText(text: string): { isValid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { isValid: false, error: 'Message cannot be empty' };
  }

  if (text.length > 2000) {
    return { isValid: false, error: 'Message too long (max 2000 characters)' };
  }

  // 改行数制限（スパム防止）
  const lineCount = text.split('\n').length;
  if (lineCount > 20) {
    return { isValid: false, error: 'Too many line breaks (max 20)' };
  }

  // 連続する空白文字の制限
  if (/\s{100,}/.test(text)) {
    return { isValid: false, error: 'Too many consecutive spaces' };
  }

  return { isValid: true };
}

export function extractMentions(text: string, availableUsers: Array<{id: string, displayName: string}>): string[] {
  const mentionRegex = /@(\w+)/g;
  const matches = text.match(mentionRegex);

  if (!matches) return [];

  const mentionNames = matches.map(match => match.substring(1).toLowerCase());
  const availableUserMap = new Map(
    availableUsers.map(user => [user.displayName.toLowerCase(), user.id])
  );

  const mentionedUserIds: string[] = [];

  for (const name of mentionNames) {
    const userId = availableUserMap.get(name);
    if (userId && !mentionedUserIds.includes(userId)) {
      mentionedUserIds.push(userId);
    }
  }

  return mentionedUserIds;
}