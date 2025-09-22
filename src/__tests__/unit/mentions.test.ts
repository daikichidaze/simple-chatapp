import {
  extractMentionTokens,
  resolveMentionsToUserIds,
  extractMentions,
  highlightMentions,
  OnlineUser
} from '@/utils/mentions';

describe('Mention Extraction Unit Tests', () => {
  const mockOnlineUsers: OnlineUser[] = [
    { id: 'user_001', displayName: 'Alice' },
    { id: 'user_002', displayName: 'bob' },
    { id: 'user_003', displayName: 'Charlie-123' },
    { id: 'user_004', displayName: 'test.user' },
    { id: 'user_005', displayName: 'UPPERCASE' }
  ];

  describe('extractMentionTokens', () => {
    it('should extract single mention', () => {
      const text = 'Hello @Alice how are you?';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice']);
    });

    it('should extract multiple mentions', () => {
      const text = 'Hello @Alice and @bob!';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice', 'bob']);
    });

    it('should extract mentions with special characters', () => {
      const text = 'Hi @Charlie-123 and @test.user';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['charlie-123', 'test.user']);
    });

    it('should convert to lowercase for case-insensitive matching', () => {
      const text = '@UPPERCASE @Alice @bob';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['uppercase', 'alice', 'bob']);
    });

    it('should remove duplicates', () => {
      const text = '@Alice @alice @ALICE';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice']);
    });

    it('should handle mentions at start and end of text', () => {
      const text = '@Alice middle text @bob';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice', 'bob']);
    });

    it('should handle adjacent mentions', () => {
      const text = '@Alice@bob';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice', 'bob']);
    });

    it('should ignore mentions longer than 50 characters', () => {
      const longName = 'a'.repeat(51);
      const text = `@${longName} @Alice`;
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice']);
    });

    it('should handle empty text', () => {
      const tokens = extractMentionTokens('');
      expect(tokens).toEqual([]);
    });

    it('should handle text without mentions', () => {
      const tokens = extractMentionTokens('No mentions here!');
      expect(tokens).toEqual([]);
    });

    it('should handle malformed mentions', () => {
      const text = '@ @  @invalid-chars! @valid123';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['valid123']);
    });
  });

  describe('resolveMentionsToUserIds', () => {
    it('should resolve existing mentions to user IDs', () => {
      const tokens = ['alice', 'bob'];
      const userIds = resolveMentionsToUserIds(tokens, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_002']);
    });

    it('should ignore non-existent mentions', () => {
      const tokens = ['alice', 'nonexistent', 'bob'];
      const userIds = resolveMentionsToUserIds(tokens, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_002']);
    });

    it('should handle case-insensitive matching', () => {
      const tokens = ['alice', 'BOB', 'uppercase'];
      const userIds = resolveMentionsToUserIds(tokens, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_002', 'user_005']);
    });

    it('should resolve special character names', () => {
      const tokens = ['charlie-123', 'test.user'];
      const userIds = resolveMentionsToUserIds(tokens, mockOnlineUsers);
      expect(userIds).toEqual(['user_003', 'user_004']);
    });

    it('should remove duplicate user IDs', () => {
      const tokens = ['alice', 'alice', 'bob'];
      const userIds = resolveMentionsToUserIds(tokens, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_002']);
    });

    it('should handle empty tokens array', () => {
      const userIds = resolveMentionsToUserIds([], mockOnlineUsers);
      expect(userIds).toEqual([]);
    });

    it('should handle empty online users array', () => {
      const tokens = ['alice', 'bob'];
      const userIds = resolveMentionsToUserIds(tokens, []);
      expect(userIds).toEqual([]);
    });
  });

  describe('extractMentions (end-to-end)', () => {
    it('should extract and resolve mentions in one step', () => {
      const text = 'Hello @Alice and @bob!';
      const userIds = extractMentions(text, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_002']);
    });

    it('should handle mixed case and special characters', () => {
      const text = 'Hi @ALICE, @Charlie-123, and @test.user!';
      const userIds = extractMentions(text, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_003', 'user_004']);
    });

    it('should filter out offline users', () => {
      const offlineUsers = [
        { id: 'user_006', displayName: 'offline_user' }
      ];
      const text = '@Alice @offline_user @bob';
      const userIds = extractMentions(text, offlineUsers);
      expect(userIds).toEqual([]);
    });

    it('should handle complex mention scenarios', () => {
      const text = '@Alice said to @bob: "Did you see @Charlie-123\'s message about @test.user?"';
      const userIds = extractMentions(text, mockOnlineUsers);
      expect(userIds).toEqual(['user_001', 'user_002', 'user_003', 'user_004']);
    });
  });

  describe('highlightMentions', () => {
    it('should wrap valid mentions in spans', () => {
      const text = 'Hello @Alice and @bob!';
      const result = highlightMentions(text, mockOnlineUsers);
      expect(result).toBe('Hello <span class="mention" data-user-id="user_001">@Alice</span> and <span class="mention" data-user-id="user_002">@bob</span>!');
    });

    it('should use custom CSS class', () => {
      const text = 'Hello @Alice!';
      const result = highlightMentions(text, mockOnlineUsers, 'custom-mention');
      expect(result).toBe('Hello <span class="custom-mention" data-user-id="user_001">@Alice</span>!');
    });

    it('should leave non-matching mentions unchanged', () => {
      const text = 'Hello @Alice and @unknown!';
      const result = highlightMentions(text, mockOnlineUsers);
      expect(result).toBe('Hello <span class="mention" data-user-id="user_001">@Alice</span> and @unknown!');
    });

    it('should handle case-insensitive matching', () => {
      const text = '@alice @BOB @UPPERCASE';
      const result = highlightMentions(text, mockOnlineUsers);
      expect(result).toBe('<span class="mention" data-user-id="user_001">@alice</span> <span class="mention" data-user-id="user_002">@BOB</span> <span class="mention" data-user-id="user_005">@UPPERCASE</span>');
    });

    it('should preserve original case in output', () => {
      const text = '@Alice @BOB @charlie-123';
      const result = highlightMentions(text, mockOnlineUsers);
      expect(result).toContain('@Alice');
      expect(result).toContain('@BOB');
      expect(result).toContain('@charlie-123');
    });

    it('should handle empty text', () => {
      const result = highlightMentions('', mockOnlineUsers);
      expect(result).toBe('');
    });

    it('should handle text with no mentions', () => {
      const text = 'No mentions here!';
      const result = highlightMentions(text, mockOnlineUsers);
      expect(result).toBe('No mentions here!');
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle malicious input safely', () => {
      const maliciousText = '@<script>alert("xss")</script> @Alice';
      const tokens = extractMentionTokens(maliciousText);
      expect(tokens).toEqual(['alice']); // Should only extract valid mention
    });

    it('should not match @ symbols in email addresses', () => {
      const text = 'Email me at alice@example.com or @Alice';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice']); // Should only match @Alice, not email
    });

    it('should handle unicode characters gracefully', () => {
      const unicodeUsers = [
        { id: 'user_unicode', displayName: 'ユーザー' }
      ];
      const text = 'Hello @ユーザー';
      const tokens = extractMentionTokens(text);
      // Unicode not in [\w.-] pattern, so should not match
      expect(tokens).toEqual([]);
    });

    it('should handle very long text efficiently', () => {
      const longText = 'a'.repeat(10000) + ' @Alice ' + 'b'.repeat(10000);
      const userIds = extractMentions(longText, mockOnlineUsers);
      expect(userIds).toEqual(['user_001']);
    });
  });

  describe('Spec Compliance', () => {
    it('should match spec example: @alice, @Bob extraction', () => {
      const text = 'Hello @alice and @Bob';
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual(['alice', 'bob']);
    });

    it('should implement case-insensitive照合 as specified', () => {
      const onlineNames = ['Alice', 'Bob'];
      const onlineUsers = [
        { id: 'user_1', displayName: 'Alice' },
        { id: 'user_2', displayName: 'Bob' }
      ];

      const text = '@alice @BOB'; // lowercase input
      const userIds = extractMentions(text, onlineUsers);
      expect(userIds).toEqual(['user_1', 'user_2']);
    });

    it('should limit username length to 50 characters as per regex', () => {
      const validName = 'a'.repeat(50);
      const invalidName = 'a'.repeat(51);

      const text = `@${validName} @${invalidName}`;
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual([validName.toLowerCase()]);
    });

    it('should support [\w.-] character class', () => {
      const validChars = 'user.name-123_test';
      const text = `@${validChars}`;
      const tokens = extractMentionTokens(text);
      expect(tokens).toEqual([validChars.toLowerCase()]);
    });
  });
});