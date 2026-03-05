// tests/unit/generate-feed.test.js
'use strict';

// generate-feed.js reads files and writes feed.xml directly, so we test
// its pure logic by extracting the same transformations it performs.

// ─── Helpers mirrored from generate-feed.js ──────────────────────────────────
function buildFeedItems(posts, siteUrl) {
  const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted.map(p => ({
    guid: `${siteUrl}/index.html#${p.id}`,
    link: `${siteUrl}/index.html#${p.id}`,
    pubDate: new Date(p.date).toUTCString(),
    description: p.body + (p.image ? `\n\n<img src="${p.image}" alt="${p.imageCaption || ''}" />` : ''),
  }));
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
const SITE_URL = 'https://example.github.io/blog';

const posts = [
  { id: 'p1', date: '2026-01-01T00:00:00.000Z', body: 'First', image: null, imageCaption: null },
  { id: 'p2', date: '2026-03-01T00:00:00.000Z', body: 'Third', image: null, imageCaption: null },
  { id: 'p3', date: '2026-02-01T00:00:00.000Z', body: 'Second', image: null, imageCaption: null },
];

// ─── Tests ───────────────────────────────────────────────────────────────────
describe('buildFeedItems', () => {
  test('sorts posts newest-first', () => {
    const items = buildFeedItems(posts, SITE_URL);
    expect(items[0].description).toBe('Third');
    expect(items[1].description).toBe('Second');
    expect(items[2].description).toBe('First');
  });

  test('does not mutate the original posts array', () => {
    buildFeedItems(posts, SITE_URL);
    expect(posts[0].id).toBe('p1');
  });

  test('generates correct guid and link', () => {
    const items = buildFeedItems([posts[0]], SITE_URL);
    expect(items[0].guid).toBe(`${SITE_URL}/index.html#p1`);
    expect(items[0].link).toBe(`${SITE_URL}/index.html#p1`);
  });

  test('pubDate is a valid UTC date string', () => {
    const items = buildFeedItems([posts[0]], SITE_URL);
    expect(new Date(items[0].pubDate).toString()).not.toBe('Invalid Date');
  });

  test('appends image tag to description when image is present', () => {
    const withImage = [{ id: 'img1', date: '2026-03-01T00:00:00.000Z', body: 'Look', image: 'data:image/png;base64,abc', imageCaption: 'Nice' }];
    const items = buildFeedItems(withImage, SITE_URL);
    expect(items[0].description).toContain('<img');
    expect(items[0].description).toContain('Nice');
  });

  test('no image tag when image is null', () => {
    const items = buildFeedItems([posts[0]], SITE_URL);
    expect(items[0].description).not.toContain('<img');
  });

  test('returns empty array for empty posts', () => {
    expect(buildFeedItems([], SITE_URL)).toEqual([]);
  });
});
