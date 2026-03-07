// tests/unit/generate-archives.test.js
'use strict';

// generate-archives.js performs two key pure operations we can test:
// 1. Grouping posts into YYYY/MM buckets
// 2. Rendering post body via marked

// ─── Helpers mirrored from generate-archives.js ──────────────────────────────
const { marked } = require('../../js/marked.umd.js');
marked.setOptions({ breaks: true, gfm: true });
function groupByMonth(posts) {
  const byMonth = {};
  for (const post of posts) {
    const d = new Date(post.date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const key = `${y}/${m}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(post);
  }
  // Sort each group newest-first
  for (const key of Object.keys(byMonth)) {
    byMonth[key].sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  return byMonth;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


// ─── Fixtures ─────────────────────────────────────────────────────────────────
const posts = [
  { id: 'a', date: '2026-03-15T12:00:00.000Z', body: 'March late' },
  { id: 'b', date: '2026-03-05T12:00:00.000Z', body: 'March early' },
  { id: 'c', date: '2026-01-15T12:00:00.000Z', body: 'January' },
  { id: 'd', date: '2025-11-15T12:00:00.000Z', body: 'November' },
];

// ─── groupByMonth ─────────────────────────────────────────────────────────────
describe('groupByMonth', () => {
  test('groups posts into correct YYYY/MM keys', () => {
    const result = groupByMonth(posts);
    expect(Object.keys(result).sort()).toEqual(['2025/11', '2026/01', '2026/03']);
  });

  test('puts multiple posts in the same month bucket', () => {
    const result = groupByMonth(posts);
    expect(result['2026/03'].length).toBe(2);
  });

  test('sorts each bucket newest-first', () => {
    const result = groupByMonth(posts);
    const march = result['2026/03'];
    expect(march[0].id).toBe('a'); // Mar 10 before Mar 01
    expect(march[1].id).toBe('b');
  });

  test('single-post month has one entry', () => {
    const result = groupByMonth(posts);
    expect(result['2025/11'].length).toBe(1);
  });

  test('returns empty object for no posts', () => {
    expect(groupByMonth([])).toEqual({});
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────
describe('escapeHtml', () => {
  test('escapes ampersand', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
  test('escapes less-than', () => expect(escapeHtml('<tag>')).toBe('&lt;tag&gt;'));
  test('escapes double quote', () => expect(escapeHtml('"hi"')).toBe('&quot;hi&quot;'));
  test('returns empty string for null', () => expect(escapeHtml(null)).toBe(''));
  test('returns empty string for undefined', () => expect(escapeHtml(undefined)).toBe(''));
  test('leaves plain text unchanged', () => expect(escapeHtml('hello')).toBe('hello'));
});

// ─── marked rendering (used by generate-archives.js) ─────────────────────────
describe('marked rendering', () => {
  test('wraps plain text in <p>', () => {
    expect(marked.parse('Hello')).toContain('<p>Hello</p>');
  });

  test('renders **bold** as <strong>', () => {
    expect(marked.parse('**bold**')).toContain('<strong>bold</strong>');
  });

  test('renders *italic* as <em>', () => {
    expect(marked.parse('*italic*')).toContain('<em>italic</em>');
  });

  test('renders `code` as <code>', () => {
    expect(marked.parse('`code`')).toContain('<code>code</code>');
  });

  test('renders [text](url) as <a>', () => {
    expect(marked.parse('[click](https://example.com)')).toContain('<a href="https://example.com">click</a>');
  });

  test('renders # heading as <h1>', () => {
    expect(marked.parse('# Title')).toContain('<h1>Title</h1>');
  });

  test('renders ## heading as <h2>', () => {
    expect(marked.parse('## Section')).toContain('<h2>Section</h2>');
  });

  test('renders ### heading as <h3>', () => {
    expect(marked.parse('### Sub')).toContain('<h3>Sub</h3>');
  });

  test('renders > blockquote', () => {
    expect(marked.parse('> quoted')).toContain('<blockquote>');
  });

  test('splits double-newlines into separate paragraphs', () => {
    const result = marked.parse('First\n\nSecond');
    expect(result).toContain('<p>First</p>');
    expect(result).toContain('<p>Second</p>');
  });

  test('handles empty string', () => {
    expect(() => marked.parse('')).not.toThrow();
  });
});
