import type { MediaItem, ResolvedPost } from '../../shared/types';

const ILLEGAL = /[\\:*?"<>|\u0000-\u001f]/g;

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function sanitizeSegment(s: string): string {
  return s.replace(ILLEGAL, '_').replace(/\//g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120) || '_';
}

export interface FilenameVars {
  user: string;
  shortcode: string;
  index: number;
  id: string;
  takenAt: number;
  type: string;
}

export function renderFilename(template: string, v: FilenameVars, ext: string): string {
  const d = new Date((v.takenAt || Date.now() / 1000) * 1000);
  const tokens: Record<string, string> = {
    user: v.user,
    shortcode: v.shortcode || v.id,
    index: String(v.index),
    id: v.id,
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`,
    type: v.type,
  };
  const path = (template.trim() || '{user}_{shortcode}_{index}')
    .replace(/\\/g, '/')
    .split('/')
    .map((seg) => seg.replace(/\{(\w+)\}/g, (_, k: string) => sanitizeSegment(tokens[k] ?? `{${k}}`)))
    .map((seg) => (seg === '..' || seg === '.' ? '_' : sanitizeSegment(seg)))
    .filter(Boolean)
    .join('/');
  return `${path}.${ext}`;
}

export function filenameFor(template: string, post: ResolvedPost, item: MediaItem, index: number): string {
  return renderFilename(
    template,
    { user: post.username, shortcode: post.shortcode, index: index + 1, id: item.id || post.id, takenAt: post.takenAt, type: item.type },
    item.ext,
  );
}
