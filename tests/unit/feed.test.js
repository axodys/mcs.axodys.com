// tests/unit/feed.test.js
'use strict';

const {
  collectTags,
  sortPostsByDate,
  getArchiveMonths,
  postHTML,
} = require('../../js/feed.js');

// getBlogTz and formatPostDate moved to utils.js — feed.js delegates to them.
// The real tests live in utils.test.js; we just verify the delegation here.
const { getBlogTz, formatPostDate } = require('../../js/utils.js');

// ─── Sample fixtures ──────────────────────────────────────────────────────────
const POST_A = {
  id: 'abc123',
  date: '2026-03-02T12:00:00.000Z',
  body: 'Hello world',
  tags: ['meta', 'life'],
  emojis: ['😊'],
  image: null,
  imageCaption: null,
};

const POST_B = {
  id: 'def456',
  date: '2026-01-15T08:30:00.000Z',
  body: 'Earlier post',
  tags: ['life'],
  emojis: [],
  image: null,
  imageCaption: null,
};

const POST_C = {
  id: 'ghi789',
  date: '2025-11-20T18:00:00.000Z',
  body: 'Old post',
  tags: ['books'],
  emojis: [],
  image: null,
  imageCaption: null,
};

// ─── getBlogTz ────────────────────────────────────────────────────────────────
describe('getBlogTz', () => {
  test('returns config timezone when set', () => {
    expect(getBlogTz({ timezone: 'America/New_York' })).toBe('America/New_York');
  });

  test('falls back to UTC when config is empty', () => {
    // In Node the Intl default is usually UTC; we confirm it returns a non-empty string
    const tz = getBlogTz({});
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  test('falls back gracefully with no config', () => {
    const tz = getBlogTz(null);
    expect(typeof tz).toBe('string');
  });
});

// ─── formatPostDate ───────────────────────────────────────────────────────────
describe('formatPostDate', () => {
  test('returns a non-empty string', () => {
    const result = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes the month abbreviation', () => {
    const result = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    expect(result).toMatch(/Mar/);
  });

  test('includes the day', () => {
    const result = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    expect(result).toMatch(/02/);
  });

  test('includes 24-hour time', () => {
    const result = formatPostDate('2026-03-02T14:30:00.000Z', { timezone: 'UTC' });
    expect(result).toMatch(/14:30/);
  });

  test('respects timezone offset', () => {
    // UTC noon = 07:00 in America/New_York (UTC-5 in March)
    const utc    = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    const nyc    = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'America/New_York' });
    expect(utc).not.toBe(nyc);
  });
});

// ─── collectTags ─────────────────────────────────────────────────────────────
describe('collectTags', () => {
  test('returns sorted unique tags', () => {
    expect(collectTags([POST_A, POST_B, POST_C])).toEqual(['books', 'life', 'meta']);
  });

  test('deduplicates tags that appear on multiple posts', () => {
    const tags = collectTags([POST_A, POST_B]); // both have 'life'
    expect(tags.filter(t => t === 'life').length).toBe(1);
  });

  test('returns empty array when no posts have tags', () => {
    expect(collectTags([{ tags: [] }, { tags: null }])).toEqual([]);
  });

  test('returns empty array for empty post list', () => {
    expect(collectTags([])).toEqual([]);
  });
});

// ─── sortPostsByDate ──────────────────────────────────────────────────────────
describe('sortPostsByDate', () => {
  test('sorts newest first', () => {
    const sorted = sortPostsByDate([POST_C, POST_A, POST_B]);
    expect(sorted[0].id).toBe('abc123'); // Mar 2026
    expect(sorted[1].id).toBe('def456'); // Jan 2026
    expect(sorted[2].id).toBe('ghi789'); // Nov 2025
  });

  test('does not mutate the original array', () => {
    const original = [POST_C, POST_A, POST_B];
    sortPostsByDate(original);
    expect(original[0].id).toBe('ghi789');
  });

  test('handles empty array', () => {
    expect(sortPostsByDate([])).toEqual([]);
  });

  test('handles single post', () => {
    expect(sortPostsByDate([POST_A])).toEqual([POST_A]);
  });
});

// ─── getArchiveMonths ─────────────────────────────────────────────────────────
describe('getArchiveMonths', () => {
  const sorted = [POST_A, POST_B, POST_C]; // already newest-first

  test('returns months only for posts beyond the recent limit', () => {
    // limit=1: POST_B and POST_C are "older"
    const months = getArchiveMonths(sorted, 1);
    expect(months).toContain('2026/01');
    expect(months).toContain('2025/11');
    expect(months).not.toContain('2026/03');
  });

  test('returns months sorted newest-first', () => {
    const months = getArchiveMonths(sorted, 1);
    expect(months[0]).toBe('2026/01');
    expect(months[1]).toBe('2025/11');
  });

  test('returns empty array when all posts are within the limit', () => {
    expect(getArchiveMonths(sorted, 10)).toEqual([]);
  });

  test('deduplicates months when multiple posts share a month', () => {
    const twoInJan = [
      POST_A,
      { ...POST_B, id: 'extra', date: '2026-01-20T00:00:00.000Z' },
      POST_B,
    ];
    const months = getArchiveMonths(twoInJan, 1);
    expect(months.filter(m => m === '2026/01').length).toBe(1);
  });
});

// ─── postHTML ─────────────────────────────────────────────────────────────────
describe('postHTML', () => {
  const cfg = { timezone: 'UTC' };
  const noop = str => str; // stand-in for marked.parse

  test('includes the post id as the article id', () => {
    const html = postHTML(POST_A, cfg, noop);
    expect(html).toContain('id="post-abc123"');
  });

  test('renders tags as post-tag spans', () => {
    const html = postHTML(POST_A, cfg, noop);
    expect(html).toContain('meta');
    expect(html).toContain('life');
  });

  test('renders emojis when present', () => {
    const html = postHTML(POST_A, cfg, noop);
    expect(html).toContain('😊');
  });

  test('omits emoji span when emojis array is empty', () => {
    const html = postHTML(POST_B, cfg, noop);
    expect(html).not.toContain('post-emojis');
  });

  test('renders the post body through the provided parse function', () => {
    const upper = str => str.toUpperCase();
    const html = postHTML(POST_A, cfg, upper);
    expect(html).toContain('HELLO WORLD');
  });

  test('includes a permalink anchor', () => {
    const html = postHTML(POST_A, cfg, noop);
    expect(html).toContain('href="#abc123"');
  });

  test('omits figure when image is null', () => {
    const html = postHTML(POST_A, cfg, noop);
    expect(html).not.toContain('post-image');
  });

  test('renders image figure when image is present', () => {
    const withImage = { ...POST_A, image: 'data:image/png;base64,abc', imageCaption: 'A caption' };
    const html = postHTML(withImage, cfg, noop);
    expect(html).toContain('post-image');
    expect(html).toContain('A caption');
  });

  test('handles missing body gracefully', () => {
    const noBody = { ...POST_A, body: null };
    expect(() => postHTML(noBody, cfg, noop)).not.toThrow();
  });
});
