import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/content/core/api', () => ({ getFriendshipPage: () => {}, jitter: () => 0, myUserId: () => 'me' }));
vi.mock('../src/content/ui/dom', () => ({ h: () => ({}) }));
vi.mock('../src/content/ui/modal', () => ({ openModal: () => ({}) }));
vi.mock('../src/content/ui/toast', () => ({ toast: () => {} }));

const { csv } = await import('../src/content/features/unfollowers');
const user = (full_name: string) => ({ username: 'x', full_name, is_verified: false, is_private: false }) as never;

describe('unfollowers csv', () => {
  it('neutralises names that a spreadsheet would run as formulas', () => {
    for (const name of ['=HYPERLINK("http://evil","click")', '+1', '-2', '@SUM(A1)', '\tx', '\rx']) {
      const cell = csv([user(name)]).split('\r\n')[1].split(',')[1];
      expect(cell.startsWith(`"'`)).toBe(true);
    }
  });

  it('leaves ordinary names alone and escapes quotes', () => {
    expect(csv([user('Ann "A" Lee')]).split('\r\n')[1]).toBe('"x","Ann ""A"" Lee","https://www.instagram.com/x/","no","no"');
  });
});
