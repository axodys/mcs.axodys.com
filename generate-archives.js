#!/usr/bin/env node
// generate-archives.js
// Reads posts.json + config.json, writes YYYY/MM.html archive pages.
// Run automatically by GitHub Actions on every deploy.

const fs     = require('fs');
const path   = require('path');
const { marked } = require('./js/marked.umd.js');

marked.setOptions({ breaks: true, gfm: true });

const posts  = JSON.parse(fs.readFileSync('posts.json',  'utf8')).posts  || [];
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const title  = config.title  || 'Journal';
const accent = '#2d6a4f';

// Group posts by YYYY/MM
const byMonth = {};
for (const post of posts) {
  const d  = new Date(post.date);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const key = `${y}/${m}`;
  if (!byMonth[key]) byMonth[key] = [];
  byMonth[key].push(post);
}

// Sort each group newest-first
for (const key of Object.keys(byMonth)) {
  byMonth[key].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function postCard(post) {
  const date = new Date(post.date);
  const formatted = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const tags = (post.tags || [])
    .map(t => `<span class="post-tag">${escapeHtml(t)}</span>`)
    .join('');

  const emojiStr = (post.emojis || []).join('');

  const body = marked.parse(post.body || '');

  const image = post.image ? `
    <figure class="post-image">
      <img src="../../${post.image.startsWith('data:') ? '' : ''}${post.image.startsWith('data:') ? post.image : '../../' + post.image}" alt="${escapeHtml(post.imageCaption||'')}">
      ${post.imageCaption ? `<figcaption>${escapeHtml(post.imageCaption)}</figcaption>` : ''}
    </figure>` : '';

  return `
  <article class="post" id="post-${post.id}">
    <div class="post-meta">
      <span>${formatted} · ${time}</span>
      ${emojiStr ? `<span class="post-emojis">${emojiStr}</span>` : ''}
      ${tags}
      <a class="post-permalink" href="../../index.html#${post.id}" title="View on main feed">¶</a>
    </div>
    <div class="post-body">${body}</div>
    ${image}
  </article>`;
}

function archivePage(ym, monthPosts) {
  const [y, m] = ym.split('/');
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Sibling months for prev/next nav
  const allMonths = Object.keys(byMonth).sort();
  const idx       = allMonths.indexOf(ym);
  const prev      = idx > 0             ? allMonths[idx - 1] : null; // older
  const next      = idx < allMonths.length - 1 ? allMonths[idx + 1] : null; // newer

  function monthLink(key) {
    if (!key) return '<span></span>';
    const [ky, km] = key.split('/');
    const label = new Date(ky, km - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return `<a class="archive-link" href="../${km}/${km === m && ky === y ? '' : ''}../../${key}.html">${label}</a>`;
  }

  // Relative paths: archive pages are at /YYYY/MM.html, so root is ../../
  const prevLink = prev ? `<a class="nav-arrow" href="../../${prev}.html">← ${new Date(prev.split('/')[0], prev.split('/')[1]-1, 1).toLocaleDateString('en-US',{month:'short',year:'numeric'})}</a>` : '<span></span>';
  const nextLink = next ? `<a class="nav-arrow" href="../../${next}.html">${new Date(next.split('/')[0], next.split('/')[1]-1, 1).toLocaleDateString('en-US',{month:'short',year:'numeric'})} →</a>` : '<span></span>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${monthLabel} · ${title}</title>
  <link rel="icon" type="image/png" sizes="32x32" href="../../icons/favicon-32.png">
  <link rel="shortcut icon" href="../../favicon.ico">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #faf9f7; --surface: #ffffff; --text: #1a1a1a; --muted: #6b6b6b;
      --border: #e8e6e1; --accent: ${accent}; --accent-light: #e8f4ee;
      --code-bg: #f0efeb;
      --mono: 'JetBrains Mono', monospace; --serif: 'Lora', Georgia, serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #161614; --surface: #1e1e1b; --text: #e8e6e0; --muted: #888880;
        --border: #2e2e2a; --accent: #5aaf85; --accent-light: #1a3028; --code-bg: #252520;
      }
    }

    body { font-family: var(--serif); background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.7; }

    header { border-bottom: 1px solid var(--border); padding: 1.5rem 0; margin-bottom: 2.5rem; }
    .container { max-width: 640px; margin: 0 auto; padding: 0 1.5rem; }
    .header-inner { display: flex; align-items: flex-end; justify-content: space-between; }

    .site-name { font-family: var(--serif); font-size: 1rem; font-weight: 500; color: var(--text); text-decoration: none; }
    .month-heading { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); margin-top: 0.2rem; }

    .back-link {
      display: inline-flex; align-items: center; gap: 0.4rem;
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted); text-decoration: none;
    }
    .back-link:hover { color: var(--text); }

    .post { padding: 1.75rem 0; border-bottom: 1px solid var(--border); }
    .post-meta {
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted);
      margin-bottom: 0.65rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
    }
    .post-emojis { font-size: 1rem; letter-spacing: 0.05em; }
    .post-tag {
      background: var(--accent-light); color: var(--accent);
      padding: 0.1rem 0.45rem; border-radius: 3px; font-size: 0.65rem;
    }
    .post-permalink { font-family: var(--mono); font-size: 0.65rem; color: var(--border); text-decoration: none; margin-left: auto; }
    .post-permalink:hover { color: var(--muted); }

    .post-body { font-size: 1rem; line-height: 1.75; color: var(--text); }
    .post-body p { margin-bottom: 0.75rem; }
    .post-body p:last-child { margin-bottom: 0; }
    .post-body a { color: var(--accent); }
    .post-body strong { font-weight: 600; }
    .post-body em { font-style: italic; }
    .post-body h1, .post-body h2, .post-body h3 { font-family: var(--serif); font-weight: 500; margin: 1rem 0 0.4rem; }
    .post-body h1 { font-size: 1.25rem; } .post-body h2 { font-size: 1.05rem; }
    .post-body blockquote { border-left: 3px solid var(--accent); padding-left: 1rem; margin: 0.5rem 0; color: var(--muted); font-style: italic; }
    .post-body code { font-family: var(--mono); font-size: 0.82em; background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px; }

    .post-image { margin-top: 1rem; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
    .post-image img { width: 100%; height: auto; display: block; }
    .post-image figcaption { font-size: 0.75rem; color: var(--muted); padding: 0.5rem 0.75rem; font-family: var(--mono); background: var(--bg); }

    .month-nav {
      display: flex; justify-content: space-between; align-items: center;
      padding: 2rem 0 1rem; border-top: 1px solid var(--border); margin-top: 1rem;
    }
    .nav-arrow {
      font-family: var(--mono); font-size: 0.72rem; color: var(--muted);
      text-decoration: none; transition: color 0.15s;
    }
    .nav-arrow:hover { color: var(--text); }
    .archive-link {
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted);
      text-decoration: none; border: 1px solid var(--border);
      padding: 0.2rem 0.55rem; border-radius: 3px;
    }
    .archive-link:hover { color: var(--accent); border-color: var(--accent); }

    footer { text-align: center; font-family: var(--mono); font-size: 0.65rem; color: var(--border); padding: 2rem 0; }
  </style>
</head>
<body>
<header>
  <div class="container">
    <div class="header-inner">
      <div>
        <a class="site-name" href="../../index.html">${escapeHtml(title)}</a>
        <div class="month-heading">${monthLabel} · ${monthPosts.length} post${monthPosts.length === 1 ? '' : 's'}</div>
      </div>
      <a class="back-link" href="../../index.html">← latest</a>
    </div>
  </div>
</header>

<main class="container">
  ${monthPosts.map(postCard).join('')}

  <nav class="month-nav">
    ${prevLink}
    ${nextLink}
  </nav>
</main>

<footer>
  <div class="container">${config.author ? `© ${escapeHtml(config.author)}` : ''}</div>
</footer>
</body>
</html>`;
}

// Write archive pages
let count = 0;
for (const [ym, monthPosts] of Object.entries(byMonth)) {
  const [y, m] = ym.split('/');
  const dir = path.join(y);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(y, `${m}.html`);
  fs.writeFileSync(outPath, archivePage(ym, monthPosts), 'utf8');
  console.log(`✓ ${outPath}  (${monthPosts.length} posts)`);
  count++;
}
console.log(`\n✓ ${count} archive page${count === 1 ? '' : 's'} generated`);
