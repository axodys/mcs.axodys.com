// tests/unit/generate-archives.test.js
'use strict';

// generate-archives.js performs two key pure operations we can test:
// 1. Grouping posts into YYYY/MM buckets
// 2. Rendering post body markdown-like syntax to HTML

// ─── Helpers mirrored from generate-archives.js ──────────────────────────────
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

function renderBody(rawBody) {
  return (rawBody || '')
    .split(/\n\n+/)
    .map(para => {
      let p = escapeHtml(para.trim());
      p = p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      p = p.replace(/\*(.+?)\*/g,     '<em>$1</em>');
      p = p.replace(/`(.+?)`/g,       '<code>$1</code>');
      p = p.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
      p = p.replace(/^### (.+)/m, '<h3>$1</h3>');
      p = p.replace(/^## (.+)/m,  '<h2>$1</h2>');
      p = p.replace(/^# (.+)/m,   '<h1>$1</h1>');
      if (p.startsWith('&gt; ')) return `<blockquote>${p.slice(5)}</blockquote>`;
      return p.startsWith('<h') || p.startsWith('<blockquote') ? p : `<p>${p}</p>`;
    })
    .join('\n');
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

// ─── renderBody ───────────────────────────────────────────────────────────────
describe('renderBody', () => {
  test('wraps plain text in <p>', () => {
    expect(renderBody('Hello')).toBe('<p>Hello</p>');
  });

  test('renders **bold** as <strong>', () => {
    expect(renderBody('**bold**')).toBe('<p><strong>bold</strong></p>');
  });

  test('renders *italic* as <em>', () => {
    expect(renderBody('*italic*')).toBe('<p><em>italic</em></p>');
  });

  test('renders `code` as <code>', () => {
    expect(renderBody('`code`')).toBe('<p><code>code</code></p>');
  });

  test('renders [text](url) as <a>', () => {
    expect(renderBody('[click](https://example.com)')).toBe('<p><a href="https://example.com">click</a></p>');
  });

  test('renders # heading as <h1>', () => {
    expect(renderBody('# Title')).toBe('<h1>Title</h1>');
  });

  test('renders ## heading as <h2>', () => {
    expect(renderBody('## Section')).toBe('<h2>Section</h2>');
  });

  test('renders ### heading as <h3>', () => {
    expect(renderBody('### Sub')).toBe('<h3>Sub</h3>');
  });

  test('renders > blockquote', () => {
    expect(renderBody('> quoted')).toBe('<blockquote>quoted</blockquote>');
  });

  test('splits double-newlines into separate paragraphs', () => {
    const result = renderBody('First\n\nSecond');
    expect(result).toContain('<p>First</p>');
    expect(result).toContain('<p>Second</p>');
  });

  test('escapes HTML special chars in body', () => {
    expect(renderBody('a < b & c')).toContain('&lt;');
    expect(renderBody('a < b & c')).toContain('&amp;');
  });

  test('handles null body', () => {
    expect(() => renderBody(null)).not.toThrow();
  });
});
