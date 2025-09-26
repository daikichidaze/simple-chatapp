import { describe, it, expect } from '@jest/globals';
import { validateMessageText, sanitizeText, extractMentions } from '@/utils/sanitize';

describe('Message Validation', () => {
  describe('validateMessageText', () => {
    describe('正常系', () => {
      it('1文字のメッセージが有効であること', () => {
        const result = validateMessageText('a');
        expect(result.isValid).toBe(true);
      });

      it('1000文字のメッセージが有効であること', () => {
        const message = 'a'.repeat(1000);
        const result = validateMessageText(message);
        expect(result.isValid).toBe(true);
      });

      it('改行を含むメッセージが有効であること', () => {
        const message = 'Hello\nWorld';
        const result = validateMessageText(message);
        expect(result.isValid).toBe(true);
      });

      it('メンション付きメッセージが有効であること', () => {
        const message = 'Hello @alice how are you?';
        const result = validateMessageText(message);
        expect(result.isValid).toBe(true);
      });
    });

    describe('異常系', () => {
      it('空文字のメッセージが無効であること', () => {
        const result = validateMessageText('');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('メッセージが空です');
      });

      it('空白のみのメッセージが無効であること', () => {
        const result = validateMessageText('   ');
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('メッセージが空です');
      });

      it('1000文字を超えるメッセージが無効であること', () => {
        const message = 'a'.repeat(1001);
        const result = validateMessageText(message);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('メッセージが長すぎます（最大1000文字）');
      });

      it('20行を超える改行が無効であること', () => {
        const message = 'line\n'.repeat(21);
        const result = validateMessageText(message);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('改行が多すぎます（最大20行）');
      });

      it('100個以上の連続する空白文字が無効であること', () => {
        const message = 'text' + ' '.repeat(100) + 'more';
        const result = validateMessageText(message);
        expect(result.isValid).toBe(false);
        expect(result.error).toBe('連続する空白文字が多すぎます');
      });
    });

    describe('境界値テスト', () => {
      it('ちょうど1000文字のメッセージが有効であること', () => {
        const message = 'a'.repeat(1000);
        const result = validateMessageText(message);
        expect(result.isValid).toBe(true);
      });

      it('ちょうど20行のメッセージが有効であること', () => {
        const message = Array(20).fill('line').join('\n');
        const result = validateMessageText(message);
        expect(result.isValid).toBe(true);
      });

      it('99個の連続する空白文字が有効であること', () => {
        const message = 'text' + ' '.repeat(99) + 'more';
        const result = validateMessageText(message);
        expect(result.isValid).toBe(true);
      });
    });
  });

  describe('sanitizeText', () => {
    it('HTMLタグがエスケープされること', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeText(input);
      expect(result).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('特殊文字がエスケープされること', () => {
      const input = '&<>"\'\/';
      const result = sanitizeText(input);
      expect(result).toBe('&amp;&lt;&gt;&quot;&#x27;&#x2F;');
    });

    it('改行がBRタグに変換されること', () => {
      const input = 'Line1\nLine2';
      const result = sanitizeText(input);
      expect(result).toBe('Line1<br>Line2');
    });
  });

  describe('extractMentions', () => {
    const availableUsers = [
      { id: 'user1', displayName: 'alice' },
      { id: 'user2', displayName: 'bob' },
      { id: 'user3', displayName: 'charlie' }
    ];

    it('単一のメンションが正しく抽出されること', () => {
      const text = 'Hello @alice';
      const result = extractMentions(text, availableUsers);
      expect(result).toEqual(['user1']);
    });

    it('複数のメンションが正しく抽出されること', () => {
      const text = 'Hello @alice and @bob';
      const result = extractMentions(text, availableUsers);
      expect(result).toEqual(['user1', 'user2']);
    });

    it('存在しないユーザーのメンションが無視されること', () => {
      const text = 'Hello @nonexistent';
      const result = extractMentions(text, availableUsers);
      expect(result).toEqual([]);
    });

    it('重複するメンションが重複排除されること', () => {
      const text = 'Hello @alice and @alice again';
      const result = extractMentions(text, availableUsers);
      expect(result).toEqual(['user1']);
    });

    it('大文字小文字が無視されること', () => {
      const text = 'Hello @Alice';
      const result = extractMentions(text, availableUsers);
      expect(result).toEqual(['user1']);
    });

    it('メンションがない場合は空配列が返されること', () => {
      const text = 'Hello world';
      const result = extractMentions(text, availableUsers);
      expect(result).toEqual([]);
    });
  });
});