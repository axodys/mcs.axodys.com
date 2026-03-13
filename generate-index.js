#!/usr/bin/env node
// generate-index.js
// Reads posts.json + config.json, writes a static index.html with the most
// recent N posts baked in. Run automatically by GitHub Actions on every deploy.

'use strict';

const fs     = require('fs');
const path   = require('path');
const { marked } = require('./js/marked.umd.js');

marked.setOptions({ breaks: true, gfm: true });

const posts  = JSON.parse(fs.readFileSync('posts.json',  'utf8')).posts || [];
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const RECENT_LIMIT = config.recentLimit || 25;

const title    = config.title    || 'Microcosm';
const tagline  = config.tagline  || '';
const author   = config.author   || '';
const siteUrl  = config.siteUrl  || '';
const tz       = config.timezone || '';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return (str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

function getBlogTz() {
  return tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function formatPostDate(isoString) {
  const blogTz = getBlogTz();
  const d = new Date(isoString);
  const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: blogTz });
  const day   = d.toLocaleDateString('en-US', { day: '2-digit',  timeZone: blogTz });
  const time  = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: blogTz });
  return `${month} ${day} ${time}`;
}

// ─── Sort & slice ─────────────────────────────────────────────────────────────
const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
const recent = sorted.slice(0, RECENT_LIMIT);
const older  = sorted.slice(RECENT_LIMIT);

// ─── Archive months (for nav) ─────────────────────────────────────────────────
const archiveMonths = [...new Set(older.map(p => {
  const d = new Date(p.date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}))].sort((a, b) => b.localeCompare(a));

// ─── Tags from visible (recent) posts only ───────────────────────────────────
const allTags = [...new Set(recent.flatMap(p => p.tags || []))].sort();

// ─── Permalink slug ───────────────────────────────────────────────────────────
// Produces a stable, timezone-independent anchor from UTC date+time: 11T1423
function postSlug(isoDate) {
  const d   = new Date(isoDate);
  const day = d.getUTCDate();
  const h   = String(d.getUTCHours()).padStart(2, '0');
  const m   = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}T${h}${m}`;
}

// Archive page URL for a post (relative to site root)
function archiveUrl(isoDate) {
  const d = new Date(isoDate);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}/${m}.html`;
}
function postHTML(post) {
  const tags = (post.tags || []).map(t =>
    `<span class="post-tag" onclick="filterByTag('${escapeHtml(t)}')">${escapeHtml(t)}</span>`
  ).join('');
  const emojiStr  = (post.emojis || []).join('');
  const dateStr   = formatPostDate(post.date);
  const bodyHtml  = marked.parse(post.body || '');
  const slug      = postSlug(post.date);
  const permalink = `${archiveUrl(post.date)}#${slug}`;
  const image     = post.image ? `
    <figure class="post-image">
      <img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.imageCaption || '')}" loading="lazy">
      ${post.imageCaption ? `<figcaption>${escapeHtml(post.imageCaption)}</figcaption>` : ''}
    </figure>` : '';

  return `
    <article class="post" id="post-${post.id}" data-tags="${escapeHtml((post.tags||[]).join(','))}">
      <div class="post-meta">
        ${emojiStr ? `<span class="post-emojis">${emojiStr}</span>` : ''}
        ${tags}
      </div>
      <div class="post-body">${bodyHtml}</div>
      ${image}
      <div class="post-footer">
        <div class="post-footer-left">
          <span class="post-date">${dateStr}</span>
        </div>
        <a class="post-permalink" href="${permalink}" title="Permalink">¶</a>
      </div>
    </article>`;
}

// ─── Archive popup: grouped by year, 6-per-row, Jan/Feb labels ───────────────
const MONTH_ABR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function archivePopupContent(months, baseHref) {
  // Group by year, newest year first, newest month first within year
  const byYear = {};
  for (const ym of months) {
    const [y, m] = ym.split('/');
    if (!byYear[y]) byYear[y] = [];
    byYear[y].push({ ym, m: parseInt(m, 10) });
  }
  return Object.keys(byYear).sort((a, b) => b - a).map(y => {
    const tiles = byYear[y]
      .sort((a, b) => b.m - a.m)
      .map(({ ym, m }) =>
        `<a class="archive-option" href="${baseHref(ym)}">${MONTH_ABR[m - 1]}</a>`
      ).join('');
    return `<div class="archive-year-group">
          <span class="archive-year-label">${y}</span>
          <div class="archive-year-grid">${tiles}</div>
        </div>`;
  }).join('\n        ');
}

// ─── Top bar: tags (left) + archive (right) ───────────────────────────────────
function topBarHTML() {
  const hasTags    = allTags.length > 0;
  const hasArchive = archiveMonths.length > 0;
  if (!hasTags && !hasArchive) return '';

  const tagSection = hasTags ? `
    <div class="top-bar-left">
      <button class="filter-btn" id="filter-btn" onclick="togglePopup('filter')">all ▾</button>
      <div class="filter-popup" id="filter-popup">
        <button class="filter-option active" onclick="setFilter('all')">all</button>
        ${allTags.map(t => `<button class="filter-option" onclick="setFilter('${escapeHtml(t)}')">${escapeHtml(t)}</button>`).join('\n        ')}
      </div>
    </div>` : '<div></div>';

  const archiveSection = hasArchive ? `
    <div class="top-bar-right">
      <button class="archive-btn" id="archive-btn" onclick="togglePopup('archive')">archive ▾</button>
      <div class="archive-popup" id="archive-popup">
        ${archivePopupContent(archiveMonths, ym => `${ym}.html`)}
      </div>
    </div>` : '';

  return `<div class="top-bar">${tagSection}${archiveSection}</div>`;
}

// ─── Page template ────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="alternate" type="application/rss+xml" title="RSS" href="feed.xml">

  <!-- PWA / Home Screen -->
  <link rel="manifest" href="manifest.json">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
  <link rel="shortcut icon" href="favicon.ico">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(title)}">
  <meta name="theme-color" content="#2d6a4f" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#161614" media="(prefers-color-scheme: dark)">
  <meta name="mobile-web-app-capable" content="yes">

  <script src="js/marked.umd.js"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

    html { font-size: 18px; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #faf9f7;
      --surface: #ffffff;
      --text: #1a1a1a;
      --muted: #6b6b6b;
      --border: #e8e6e1;
      --accent: #2d6a4f;
      --accent-light: #e8f4ee;
      --tag-hover: #c8e6d4;
      --code-bg: #f0efeb;
      --mono: 'JetBrains Mono', monospace;
      --serif: 'Noto Sans', sans-serif;
    }

    [data-theme="dark"] {
      --bg: #161614;
      --surface: #1e1e1b;
      --text: #e8e6e0;
      --muted: #888880;
      --border: #2e2e2a;
      --accent: #5aaf85;
      --accent-light: #1a3028;
      --tag-hover: #1f4030;
      --code-bg: #252520;
    }

    body {
      font-family: var(--serif);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.7;
      transition: background 0.2s, color 0.2s;
    }

    header { border-bottom: 1px solid var(--border); padding: 2rem 0 1.5rem; margin-bottom: 0.5rem; }
    .container { max-width: 640px; margin: 0 auto; padding: 0 1.5rem; }

    .site-name { font-family: var(--serif); font-size: 1.15rem; font-weight: 500; color: var(--text); text-decoration: none; }
    .site-tagline { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; font-family: var(--mono); }
    .header-inner { display: flex; align-items: flex-end; justify-content: space-between; }
    .header-right { display: flex; gap: 0.75rem; align-items: center; }

    .rss-link {
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted); text-decoration: none;
      border: 1px solid var(--border); padding: 0.2rem 0.5rem; border-radius: 3px;
      transition: color 0.15s, border-color 0.15s;
    }
    .rss-link:hover { color: var(--accent); border-color: var(--accent); }

    .theme-toggle {
      background: none; border: 1px solid var(--border); border-radius: 3px;
      padding: 0.15rem 0.45rem; cursor: pointer; font-size: 0.9rem; line-height: 1.4;
      color: var(--muted); transition: border-color 0.15s, color 0.15s;
    }
    .theme-toggle:hover { color: var(--text); border-color: var(--muted); }

    .top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .top-bar-left, .top-bar-right { position: relative; }
    .filter-btn, .archive-btn {
      font-family: var(--mono); font-size: 0.7rem; padding: 0.3rem 0.75rem;
      border: 1px solid var(--border); border-radius: 3px; background: transparent;
      color: var(--muted); cursor: pointer; transition: color 0.15s, border-color 0.15s;
    }
    .filter-btn:hover, .filter-btn.active { color: var(--accent); border-color: var(--accent); }
    .archive-btn:hover, .archive-btn.active { color: var(--accent); border-color: var(--accent); }
    .filter-popup, .archive-popup {
      position: absolute; top: calc(100% + 6px);
      background: var(--surface); border: 1px solid var(--border); border-radius: 5px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12); z-index: 100;
      padding: 0.6rem; display: none;
    }
    .filter-popup { left: 0; width: 260px; flex-wrap: wrap; gap: 0.4rem; }
    .archive-popup { right: 0; width: 246px; }
    .filter-popup.open { display: flex; }
    .archive-popup.open { display: block; }
    .filter-option, .archive-option {
      flex: 0 0 auto;
      font-family: var(--mono); font-size: 0.65rem; padding: 0.25rem 0.55rem;
      border: 1px solid var(--border); border-radius: 3px; background: transparent;
      color: var(--muted); cursor: pointer; white-space: nowrap;
      transition: color 0.15s, border-color 0.15s, background 0.15s;
      text-decoration: none; display: inline-block;
    }
    .filter-option:hover, .archive-option:hover { color: var(--accent); border-color: var(--accent); }
    .filter-option.active { background: var(--accent); color: white; border-color: var(--accent); }
    .archive-year-group { margin-bottom: 0.5rem; }
    .archive-year-group:last-child { margin-bottom: 0; }
    .archive-year-label {
      font-family: var(--mono); font-size: 0.6rem; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.06em;
      display: block; margin-bottom: 0.3rem;
    }
    .archive-year-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; }

    #posts-container { padding-bottom: 4rem; }

    .post { padding: 0.9rem 0 0.5rem; border-bottom: 1px solid var(--border); animation: fadeIn 0.3s ease; }
    .post.hidden { display: none; }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .post-meta {
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted);
      margin-bottom: 0.3rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
    }
    .post-meta:empty { display: none; margin: 0; }

    .post-tag {
      background: var(--accent-light); color: var(--accent); padding: 0.1rem 0.45rem;
      border-radius: 3px; font-size: 0.65rem; cursor: pointer; transition: background 0.15s;
    }
    .post-tag:hover { background: var(--tag-hover); }

    .post-permalink {
      font-family: var(--mono); font-size: 0.65rem; color: var(--muted);
      text-decoration: none; transition: color 0.15s; margin-left: auto;
    }
    .post-permalink:hover { color: var(--text); }

    .post-emojis { font-size: 1rem; letter-spacing: 0.05em; }

    .post-footer {
      display: flex; align-items: center; justify-content: space-between;
      margin-top: 0.5rem; gap: 0.5rem;
    }
    .post-footer-left { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .post-date { font-family: var(--mono); font-size: 0.68rem; color: var(--muted); }

    .post-body { font-size: 1rem; line-height: 1.75; color: var(--text); }
    .post-body p { margin-bottom: 0.75rem; }
    .post-body p:last-child { margin-bottom: 0; }
    .post-body a { color: var(--accent); }
    .post-body strong { font-weight: 600; }
    .post-body em { font-style: italic; }
    .post-body h1, .post-body h2, .post-body h3 {
      font-family: var(--serif); font-weight: 500;
      margin: 1.25rem 0 0.5rem; line-height: 1.3;
    }
    .post-body h1 { font-size: 1.3rem; }
    .post-body h2 { font-size: 1.1rem; }
    .post-body h3 { font-size: 1rem; }
    .post-body ul, .post-body ol { margin: 0.5rem 0 0.75rem 1.5rem; }
    .post-body li { margin-bottom: 0.25rem; }
    .post-body blockquote {
      border-left: 3px solid var(--accent); padding-left: 1rem;
      margin: 0.75rem 0; color: var(--muted); font-style: italic;
    }
    .post-body code {
      font-family: var(--mono); font-size: 0.82em;
      background: var(--code-bg); padding: 0.1em 0.35em; border-radius: 3px;
    }
    .post-body pre {
      background: var(--code-bg); border-radius: 4px;
      padding: 1rem; overflow-x: auto; margin: 0.75rem 0;
    }
    .post-body pre code { background: none; padding: 0; font-size: 0.85rem; }
    .post-body hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }

    .post-image { margin-top: 1rem; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); }
    .post-image img { width: 100%; height: auto; display: block; }
    .post-image figcaption {
      font-size: 0.75rem; color: var(--muted); padding: 0.5rem 0.75rem;
      font-family: var(--mono); background: var(--bg);
    }

    .empty {
      text-align: center; color: var(--muted); font-family: var(--mono);
      font-size: 0.8rem; padding: 4rem 0;
    }

    .back-link {
      display: inline-flex; align-items: center; gap: 0.4rem;
      font-family: var(--mono); font-size: 0.75rem; color: var(--muted);
      text-decoration: none; margin-bottom: 2rem;
    }
    .back-link:hover { color: var(--text); }

    footer {
      text-align: center; font-family: var(--mono); font-size: 0.65rem;
      color: var(--border); padding: 2rem 0; border-top: 1px solid var(--border);
    }
  </style>

  <!-- Theme bootstrap: runs immediately to prevent flash of wrong theme -->
  <script>
    (function () {
      const saved = localStorage.getItem('journal_theme') ||
        (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', saved);
    })();
  </script>
</head>
<body>

<header>
  <div class="container">
    <div class="header-inner">
      <div>
        <a class="site-name" href="index.html">${escapeHtml(title)}</a>
        ${tagline ? `<div class="site-tagline">${escapeHtml(tagline)}</div>` : ''}
      </div>
      <div class="header-right">
        <button class="theme-toggle" id="theme-toggle" onclick="toggleTheme()" title="Toggle dark mode">☀︎</button>
        <a class="rss-link" href="feed.xml">RSS</a>
      </div>
    </div>
  </div>
</header>

<main class="container">
  ${topBarHTML()}
  <div id="posts-container">
    ${recent.length ? recent.map(postHTML).join('\n') : '<div class="empty">no posts yet.</div>'}
  </div>
</main>

<footer>
  <div class="container">${author ? `© ${escapeHtml(author)}` : ''}</div>
</footer>

<script src="js/utils.js"></script>
<script>
// ─── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☽' : '☀︎';
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('journal_theme', next);
  applyTheme(next);
}
applyTheme(document.documentElement.getAttribute('data-theme'));

// ─── Tag filtering ────────────────────────────────────────────────────────────
// ─── Popup toggle ─────────────────────────────────────────────────────────────
function togglePopup(which) {
  const filter  = document.getElementById('filter-popup');
  const archive = document.getElementById('archive-popup');
  if (which === 'filter') {
    filter?.classList.toggle('open');
    archive?.classList.remove('open');
  } else {
    archive?.classList.toggle('open');
    filter?.classList.remove('open');
  }
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.top-bar-left') && !e.target.closest('.top-bar-right')) {
    document.getElementById('filter-popup')?.classList.remove('open');
    document.getElementById('archive-popup')?.classList.remove('open');
  }
});

function setFilter(tag) {
  document.querySelectorAll('.filter-option').forEach(b =>
    b.classList.toggle('active', b.textContent === tag || (tag === 'all' && b.textContent === 'all'))
  );
  const btn = document.getElementById('filter-btn');
  if (btn) {
    btn.textContent = (tag === 'all' ? 'all' : tag) + ' ▾';
    btn.classList.toggle('active', tag !== 'all');
  }
  document.getElementById('filter-popup')?.classList.remove('open');
  document.querySelectorAll('#posts-container .post').forEach(el => {
    if (tag === 'all') {
      el.classList.remove('hidden');
    } else {
      const tags = el.dataset.tags ? el.dataset.tags.split(',') : [];
      el.classList.toggle('hidden', !tags.includes(tag));
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function filterByTag(tag) { setFilter(tag); }
</script>
</body>
</html>`;

fs.writeFileSync('index.html', html, 'utf8');
console.log(`✓ index.html generated (${recent.length} posts, ${archiveMonths.length} archive months)`);
if (config.recentLimit === undefined) {
  console.log(`  recentLimit: ${RECENT_LIMIT} (default — set "recentLimit" in config.json to override)`);
}