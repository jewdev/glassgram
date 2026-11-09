import type { ResolvedPost } from '../../shared/types';
import { csvCell } from '../features/unfollowers-history';

const HEADER = ['link', 'username', 'date', 'type', 'files', 'caption'];

function kind(post: ResolvedPost): string {
  if (post.items.length > 1) return 'carousel';
  return post.items[0]?.type === 'video' ? 'video' : 'photo';
}

/** A list of posts as CSV: one row per post, captions included. Media links are left out: they expire. */
export function postsCsv(posts: ResolvedPost[]): string {
  const rows = posts.map((p) =>
    [
      `https://www.instagram.com/p/${p.shortcode}/`,
      p.username,
      p.takenAt ? new Date(p.takenAt * 1000).toISOString() : '',
      kind(p),
      String(p.items.length),
      p.caption ?? '',
    ]
      .map(csvCell)
      .join(','),
  );
  return [HEADER.join(','), ...rows].join('\r\n');
}

/** Saves `text` as a CSV file through a detached link, so nothing shows up in Instagram's DOM. */
export function saveCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
