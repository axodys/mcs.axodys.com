#!/usr/bin/env node
// generate-archives.js
// Reads posts.json + config.json, writes YYYY/MM.html archive pages.
// Run automatically by GitHub Actions on every deploy.
//
// Usage:
//   node generate-archives.js                           # regenerate all months
//   node generate-archives.js --months 2026/03,2026/02  # regenerate specific months only

'use strict';

const fs     = require('fs');
const path   = require('path');
const { marked } = require('./js/marked.umd.js');

// ─── CLI: optional --months flag ─────────────────────────────────────────────
const args       = process.argv.slice(2);
const monthsFlag = args.indexOf('--months');
const onlyMonths = monthsFlag !== -1 && args[monthsFlag + 1]
  ? new Set(args[monthsFlag + 1].split(',').map(m => m.trim()).filter(Boolean))
  : null; // null = regenerate all

marked.setOptions({ breaks: true, gfm: true });

const posts  = JSON.parse(fs.readFileSync('posts.json',  'utf8')).posts  || [];
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const title  = config.title    || 'Journal';
const tz     = config.timezone || 'UTC';
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

// ─── Permalink slug ───────────────────────────────────────────────────────────
// Produces a stable, timezone-independent anchor from UTC date+time: 11T1423
function postSlug(isoDate) {
  const d   = new Date(isoDate);
  const day = d.getUTCDate();
  const h   = String(d.getUTCHours()).padStart(2, '0');
  const m   = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}T${h}${m}`;
}

function formatPostDate(isoString) {
  const d     = new Date(isoString);
  const month = d.toLocaleDateString('en-US',  { month: 'short',   timeZone: tz });
  const day   = d.toLocaleDateString('en-US',  { day: '2-digit',   timeZone: tz });
  const time  = d.toLocaleTimeString('en-US',  { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  return `${month} ${day} ${time}`;
}

function postCard(post) {
  const tags = (post.tags || [])
    .map(t => `<span class="post-tag" onclick="setFilter('${escapeHtml(t)}')">${escapeHtml(t)}</span>`)
    .join('');

  const emojiStr = (post.emojis || []).join('');
  const dateStr  = formatPostDate(post.date);
  const body     = marked.parse(post.body || '');
  const slug     = postSlug(post.date);

  const image = post.image ? `
    <figure class="post-image">
      <img src="${post.image}" alt="${escapeHtml(post.imageCaption||'')}">
      ${post.imageCaption ? `<figcaption>${escapeHtml(post.imageCaption)}</figcaption>` : ''}
    </figure>` : '';

  return `
  <article class="post" id="${slug}" data-tags="${escapeHtml((post.tags||[]).join(','))}">
    <div class="post-meta">
      ${emojiStr ? `<span class="post-emojis">${emojiStr}</span>` : ''}
      ${tags}
    </div>
    <div class="post-body">${body}</div>
    ${image}
    <div class="post-footer">
      <div class="post-footer-left">
        <span class="post-date">${dateStr}</span>
      </div>
      <a class="post-permalink" href="#${slug}" title="Permalink">¶</a>
    </div>
  </article>`;
}

const MONTH_ABR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function archivePopupContent(months, baseHref) {
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

function topBarHTML(monthPosts, allMonths, currentYm) {
  const tags = [...new Set(monthPosts.flatMap(p => p.tags || []))].sort();
  const otherMonths = allMonths.filter(ym => ym !== currentYm);

  const tagSection = tags.length ? `
    <div class="top-bar-left">
      <button class="filter-btn" id="filter-btn" onclick="togglePopup('filter')">all ▾</button>
      <div class="filter-popup" id="filter-popup">
        <button class="filter-option active" onclick="setFilter('all')">all</button>
        ${tags.map(t => `<button class="filter-option" onclick="setFilter('${escapeHtml(t)}')">${escapeHtml(t)}</button>`).join('\n        ')}
      </div>
    </div>` : '<div></div>';

  const archiveSection = `
    <div class="top-bar-right">
      <button class="archive-btn" id="archive-btn" onclick="togglePopup('archive')">archive ▾</button>
      <div class="archive-popup" id="archive-popup">
        ${otherMonths.length ? archivePopupContent(otherMonths, ym => `../../${ym}.html`) : '<span style="font-family:var(--mono);font-size:0.65rem;color:var(--muted)">no other months</span>'}
      </div>
    </div>`;

  return `<div class="top-bar">${tagSection}${archiveSection}</div>`;
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
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,400;0,500;1,400&family=JetBrains+Mono:wght@400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { font-size: 18px; }

    :root {
      --bg: #faf9f7; --surface: #ffffff; --text: #1a1a1a; --muted: #6b6b6b;
      --border: #e8e6e1; --accent: ${accent}; --accent-light: #e8f4ee;
      --code-bg: #f0efeb;
      --mono: 'JetBrains Mono', monospace; --serif: 'Noto Sans', sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #161614; --surface: #1e1e1b; --text: #e8e6e0; --muted: #888880;
        --border: #2e2e2a; --accent: #5aaf85; --accent-light: #1a3028; --code-bg: #252520;
      }
    }

    body { font-family: var(--serif); background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.7; }

    header { border-bottom: 1px solid var(--border); padding: 1.5rem 0; margin-bottom: 0.5rem; }
    .container { max-width: 640px; margin: 0 auto; padding: 0 1.5rem; }
    .header-inner { display: flex; align-items: flex-end; justify-content: space-between; }

    .site-name { font-family: var(--serif); font-size: 1rem; font-weight: 500; color: var(--text); text-decoration: none; }
    .month-heading { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); margin-top: 0.2rem; }

    .back-link {
      display: inline-flex; align-items: center; gap: 0.4rem;
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted); text-decoration: none;
    }
    .back-link:hover { color: var(--text); }

    .post { padding: 0.9rem 0 0.5rem; border-bottom: 1px solid var(--border); }
    .post-meta {
      font-family: var(--mono); font-size: 0.7rem; color: var(--muted);
      margin-bottom: 0.3rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
    }
    .post-emojis { font-size: 1rem; letter-spacing: 0.05em; }
    .post-tag {
      background: var(--accent-light); color: var(--accent);
      padding: 0.1rem 0.45rem; border-radius: 3px; font-size: 0.65rem;
      cursor: pointer;
    }
    .post-tag:hover { opacity: 0.8; }
    .post-footer {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 0.5rem;
    }
    .post-footer-left { display: flex; align-items: center; gap: 0.75rem; }
    .post-date { font-family: var(--mono); font-size: 0.7rem; color: var(--muted); }
    .post-permalink { font-family: var(--mono); font-size: 0.65rem; color: var(--muted); text-decoration: none; }
    .post-permalink:hover { color: var(--text); }

    .top-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
    .top-bar-left, .top-bar-right { position: relative; }
    .filter-btn, .archive-btn {
      font-family: var(--mono); font-size: 0.7rem; padding: 0.3rem 0.75rem;
      border: 1px solid var(--border); border-radius: 3px; background: transparent;
      color: var(--muted); cursor: pointer; transition: color 0.15s, border-color 0.15s;
    }
    .filter-btn:hover, .filter-btn.active { color: var(--accent); border-color: var(--accent); }
    .archive-btn:hover { color: var(--accent); border-color: var(--accent); }
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
    .hidden { display: none !important; }

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
  ${topBarHTML(monthPosts, allMonths, ym)}
  ${monthPosts.map(postCard).join('')}

  <nav class="month-nav">
    ${prevLink}
    ${nextLink}
  </nav>
</main>

<footer>
  <div class="container">${config.author ? `© ${escapeHtml(config.author)}` : ''}</div>
</footer>
<script>
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
  document.querySelectorAll('.post').forEach(el => {
    if (tag === 'all') {
      el.classList.remove('hidden');
    } else {
      const tags = el.dataset.tags ? el.dataset.tags.split(',') : [];
      el.classList.toggle('hidden', !tags.includes(tag));
    }
  });
}

// ─── Permalink: scroll to post if hash present ────────────────────────────────
(function () {
  const slug = window.location.hash.slice(1);
  if (!slug) return;
  const el = document.getElementById(slug);
  if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
})();
</script>
</body>
</html>`;
}

// Write archive pages
let count = 0, skipped = 0;
for (const [ym, monthPosts] of Object.entries(byMonth)) {
  if (onlyMonths && !onlyMonths.has(ym)) { skipped++; continue; }
  const [y, m] = ym.split('/');
  const dir = path.join(y);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(y, `${m}.html`);
  fs.writeFileSync(outPath, archivePage(ym, monthPosts), 'utf8');
  console.log(`✓ ${outPath}  (${monthPosts.length} posts)`);
  count++;
}
if (skipped) console.log(`  ${skipped} unchanged month${skipped === 1 ? '' : 's'} skipped`);
console.log(`\n✓ ${count} archive page${count === 1 ? '' : 's'} generated`);