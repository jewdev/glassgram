import type { ResolvedPost, StoryExtras } from '../../shared/types';
import { h } from '../ui/dom';
import { openModal } from '../ui/modal';

function section(title: string, count: number, ...rows: HTMLElement[]): HTMLElement | null {
  if (!count) return null;
  return h('section', { class: 'ige-sd__section' }, h('h3', { class: 'ige-sd__title' }, `${title} `, h('span', { class: 'ige-badge' }, String(count))), ...rows);
}

const ext = (href: string, ...kids: (Node | string | null)[]) => h('a', { class: 'ige-sd__row', href, target: '_blank', rel: 'noopener noreferrer' }, ...kids);

/** Panel listing mentions (incl. hidden ones), hashtags, location, links, music and shared posts of a story item. */
export function openStoryDetails(post: ResolvedPost) {
  const e: StoryExtras = post.extras ?? { mentions: [], hashtags: [], locations: [], links: [], music: [], sharedPosts: [] };
  const m = openModal(`Story by @${post.username}`, { width: 440 });
  const hiddenCount = e.mentions.filter((x) => x.hidden).length;

  const parts = [
    section(
      'Mentions',
      e.mentions.length,
      ...(hiddenCount ? [h('p', { class: 'ige-muted ige-sd__note' }, `${hiddenCount} hidden (tiny, flagged hidden, or outside the frame).`)] : []),
      ...e.mentions.map((u) =>
        h('a', { class: 'ige-user', href: `/${u.username}/`, target: '_blank', rel: 'noopener' },
          h('img', { src: u.picUrl, alt: '', loading: 'lazy' }),
          h('span', { class: 'ige-user__names' }, h('strong', {}, `@${u.username}`), h('span', {}, u.fullName)),
          u.hidden ? h('span', { class: 'ige-pill', title: 'Not visible on the story' }, 'hidden') : null,
        ),
      ),
    ),
    section('Hashtags', e.hashtags.length, ...e.hashtags.map((t) => ext(`/explore/tags/${encodeURIComponent(t)}/`, `#${t}`))),
    section('Location', e.locations.length, ...e.locations.map((l) => ext(l.id ? `/explore/locations/${l.id}/` : '/explore/', l.name))),
    section(
      'Links',
      e.links.length,
      ...e.links.map((l) => ext(l.url, h('span', { class: 'ige-sd__link' }, l.display), l.title && l.title !== 'Visit Link' ? h('span', { class: 'ige-muted' }, l.title) : null)),
    ),
    section('Music', e.music.length, ...e.music.map((x) => h('div', { class: 'ige-sd__row' }, h('strong', {}, x.title), x.artist ? h('span', { class: 'ige-muted' }, x.artist) : null))),
    section('Shared posts', e.sharedPosts.length, ...e.sharedPosts.map((p) => ext(`/${p.isReel ? 'reel' : 'p'}/${p.code}/`, `${p.isReel ? 'Reel' : 'Post'} ${p.code}`))),
  ].filter((x): x is HTMLElement => !!x);

  m.body.append(...(parts.length ? parts : [h('p', { class: 'ige-muted ige-empty' }, 'No mentions, tags, links or music on this story.')]));
}
