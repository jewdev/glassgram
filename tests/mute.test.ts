import { describe, expect, it } from 'vitest';
import { isEmpty, isMuted, parseMuteList, postAuthor } from '../src/content/core/mute';

describe('parseMuteList', () => {
  it('splits accounts from words and ignores blanks', () => {
    const l = parseMuteList(' spoiler, @Some.Account ,,\n giveaway , @ ');
    expect([...l.accounts]).toEqual(['some.account']);
    expect(l.words).toHaveLength(2);
    expect(isEmpty(parseMuteList(' , \n'))).toBe(true);
  });
});

describe('isMuted', () => {
  const l = parseMuteList('cat, a.b, giveaway time, ממומן, @spam_acc');

  it('mutes listed accounts, ignoring case', () => {
    expect(isMuted(l, 'SPAM_acc', '')).toBe(true);
    expect(isMuted(l, 'friend', '')).toBe(false);
  });

  it('matches whole words, hashtags and phrases', () => {
    expect(isMuted(l, undefined, 'My CAT sleeps')).toBe(true);
    expect(isMuted(l, undefined, '#cat #pug')).toBe(true);
    expect(isMuted(l, undefined, 'new category')).toBe(false);
    expect(isMuted(l, undefined, 'big Giveaway time!')).toBe(true);
    expect(isMuted(l, undefined, 'פוסט ממומן')).toBe(true);
  });

  it('treats regex characters literally', () => {
    expect(isMuted(l, undefined, 'see a.b now')).toBe(true);
    expect(isMuted(l, undefined, 'see axb now')).toBe(false);
  });
});

describe('postAuthor', () => {
  it('takes the first profile link, skipping nav and post links', () => {
    const links = ['/explore/', '/p/ABCDE/', '/author.name/', '/liker/'].map((href) => ({ getAttribute: () => href }));
    const root = { querySelectorAll: () => links } as unknown as Element;
    expect(postAuthor(root)).toBe('author.name');
  });
});
