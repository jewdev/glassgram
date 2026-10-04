import { describe, expect, it } from 'vitest';
import { renderFilename, sanitizeSegment } from '../src/content/core/filename';

const vars = { user: 'nat:geo', shortcode: 'C9x', index: 2, id: '42', takenAt: Date.UTC(2024, 0, 5, 12) / 1000, type: 'image' };

describe('filename', () => {
  it('renders tokens and folders', () => {
    const out = renderFilename('Instagram/{user}/{user}_{shortcode}_{index}', vars, 'jpg');
    expect(out).toBe('Instagram/nat_geo/nat_geo_C9x_2.jpg');
  });

  it('renders the date token', () => {
    expect(renderFilename('{date}', vars, 'mp4')).toMatch(/^2024-01-0[45]\.mp4$/);
  });

  it('blocks path traversal and absolute paths', () => {
    const out = renderFilename('../../{user}/..\\x', vars, 'jpg');
    expect(out.split('/')).not.toContain('..');
    expect(out.startsWith('/')).toBe(false);
  });

  it('falls back to id when there is no shortcode', () => {
    expect(renderFilename('{shortcode}', { ...vars, shortcode: '' }, 'jpg')).toBe('42.jpg');
  });

  it('sanitizes illegal characters', () => {
    expect(sanitizeSegment('a<b>c|d?.')).toBe('a_b_c_d_');
    expect(sanitizeSegment('   ')).toBe('_');
  });

  it('uses a default when the template is empty', () => {
    expect(renderFilename('  ', vars, 'jpg')).toBe('nat_geo_C9x_2.jpg');
  });
});
