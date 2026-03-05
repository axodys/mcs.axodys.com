// ─── js/feed.js ──────────────────────────────────────────────────────────────
// Public-facing feed logic extracted from index.html.
// Pure/testable functions are exported via `window.FeedModule` for browser use,
// and via `module.exports` for Jest.

(function (exports) {

  // ─── Theme ─────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☽' : '☀︎';
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    const tc = document.createElement('meta');
    tc.name = 'theme-color';
    tc.content = theme === 'dark' ? '#161614' : '#2d6a4f';
    document.head.appendChild(tc);
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('journal_theme', next);
    applyTheme(next);
  }

  // ─── Timezone / date formatting ─────────────────────────────────────────────
  function getBlogTz(config) {
    return (config && config.timezone) ||
      (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      'UTC';
  }

  function formatPostDate(isoString, config) {
    const tz = getBlogTz(config);
    const d = new Date(isoString);
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: tz });
    const day   = d.toLocaleDateString('en-US', { day: '2-digit',  timeZone: tz });
    const time  = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    return `${month} ${day} ${time}`;
  }

  // ─── Tag helpers ────────────────────────────────────────────────────────────
  function collectTags(posts) {
    return [...new Set(posts.flatMap(p => p.tags || []))].sort();
  }

  // ─── Post sorting ───────────────────────────────────────────────────────────
  function sortPostsByDate(posts) {
    return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // ─── Archive month grouping ─────────────────────────────────────────────────
  function getArchiveMonths(sortedPosts, recentLimit) {
    const older = sortedPosts.slice(recentLimit);
    return [...new Set(older.map(p => {
      const d = new Date(p.date);
      return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }))].sort((a, b) => b.localeCompare(a));
  }

  // ─── Post HTML generation ───────────────────────────────────────────────────
  function postHTML(post, config, markedParseFn) {
    const tags = (post.tags || []).map(t =>
      `<span class="post-tag" onclick="filterByTag('${t}')">${t}</span>`
    ).join('');
    const emojiStr = (post.emojis || []).join('');
    const dateStr = formatPostDate(post.date, config);
    const image = post.image ? `
    <figure class="post-image">
      <img src="${post.image}" alt="${post.imageCaption || ''}" loading="lazy">
      ${post.imageCaption ? `<figcaption>${post.imageCaption}</figcaption>` : ''}
    </figure>` : '';
    const bodyHtml = markedParseFn ? markedParseFn(post.body || '') : (post.body || '');

    return `
    <article class="post" id="post-${post.id}">
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
        <a class="post-permalink" href="#${post.id}" title="Permalink">¶</a>
      </div>
    </article>`;
  }

  // ─── DOM rendering (browser-only) ───────────────────────────────────────────
  function renderPosts(posts, config, markedParseFn) {
    const container = document.getElementById('posts-container');
    if (!posts.length) {
      container.innerHTML = '<div class="empty">no posts yet.</div>';
      return;
    }
    container.innerHTML = posts.map(p => postHTML(p, config, markedParseFn)).join('');
  }

  function renderFilterBar(allPosts, onAll, onTag) {
    const tags = collectTags(allPosts);
    const bar = document.getElementById('filter-bar');
    if (!tags.length) return;
    bar.style.display = 'flex';

    const all = document.createElement('button');
    all.className = 'filter-tag active';
    all.textContent = 'all';
    all.onclick = () => { setActive(all); onAll(); };
    bar.appendChild(all);

    tags.forEach(tag => {
      const btn = document.createElement('button');
      btn.className = 'filter-tag';
      btn.textContent = tag;
      btn.onclick = () => { setActive(btn); onTag(tag); };
      bar.appendChild(btn);
    });
  }

  function setActive(el) {
    document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
  }

  function renderArchiveNav(allSorted, recentLimit) {
    const nav = document.getElementById('archive-nav');
    if (allSorted.length <= recentLimit) { nav.style.display = 'none'; return; }

    const months = getArchiveMonths(allSorted, recentLimit);
    nav.style.display = 'flex';
    nav.innerHTML = `
      <span class="archive-nav-label">archive</span>
      <div class="archive-months">
        ${months.map(ym => {
          const [y, m] = ym.split('/');
          const label = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          return `<a class="archive-link" href="${ym}.html">${label}</a>`;
        }).join('')}
      </div>`;
  }

  function filterByTag(tag, allPosts, config, markedParseFn) {
    document.querySelectorAll('.filter-tag').forEach(b =>
      b.classList.toggle('active', b.textContent === tag)
    );
    renderPosts(allPosts.filter(p => (p.tags || []).includes(tag)), config, markedParseFn);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderPermalink(id, allPosts, config, markedParseFn) {
    const post = allPosts.find(p => p.id === id);
    const container = document.getElementById('posts-container');
    if (!post) { container.innerHTML = '<div class="empty">post not found.</div>'; return; }
    document.getElementById('archive-nav').style.display = 'none';
    container.innerHTML = `<a class="back-link" href="index.html">← all posts</a>${postHTML(post, config, markedParseFn)}`;
  }

  // ─── Exports ────────────────────────────────────────────────────────────────
  const publicAPI = {
    // Pure — fully testable
    getBlogTz,
    formatPostDate,
    collectTags,
    sortPostsByDate,
    getArchiveMonths,
    postHTML,
    // DOM-dependent — browser only
    applyTheme,
    toggleTheme,
    renderPosts,
    renderFilterBar,
    setActive,
    renderArchiveNav,
    filterByTag,
    renderPermalink,
  };

  // Browser
  if (typeof window !== 'undefined') {
    window.FeedModule = publicAPI;
  }

  // Node / Jest
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = publicAPI;
  }

})(typeof exports !== 'undefined' ? exports : {});
