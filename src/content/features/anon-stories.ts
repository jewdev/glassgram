import type { Feature } from './types';

// The MAIN-world script (src/inject/main-world.ts) reads this attribute on every request.
const ATTR = 'data-ige-anon';

export const anonLive: Feature = {
  id: 'anon-live',
  isEnabled: (s) => s['privacy.anonLive'],
  start() {
    document.documentElement.setAttribute('data-ige-anonlive', '1');
    return () => document.documentElement.removeAttribute('data-ige-anonlive');
  },
};

export const anonStories: Feature = {
  id: 'anon-stories',
  isEnabled: (s) => s['privacy.anonStories'],
  start() {
    document.documentElement.setAttribute(ATTR, '1');
    return () => document.documentElement.removeAttribute(ATTR);
  },
};
