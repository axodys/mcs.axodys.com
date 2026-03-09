// ─── js/admin.js ─────────────────────────────────────────────────────────────
// Extracted admin logic. Pure functions and async API calls live here.
// DOM wiring and one-time init remain in admin.html.
// Depends on js/utils.js being loaded first (window.Utils in browser,
// require('./utils') in Jest).

(function (exports) {
  // Resolve Utils — browser (window.Utils) or Node (require)
  const Utils = (typeof window !== 'undefined' && window.Utils) ||
    (typeof require !== 'undefined' && require('./utils'));

  // ─── Constants ───────────────────────────────────────────────────────────────
  const TZ_LIST = [
    'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles', 'America/Denver',
    'America/Chicago', 'America/New_York', 'America/Sao_Paulo', 'Atlantic/Azores',
    'Europe/London', 'Europe/Paris', 'Europe/Helsinki', 'Europe/Moscow',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Singapore',
    'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney', 'Pacific/Auckland',
  ];

  const GH_STORAGE_KEYS = ['gh_username', 'gh_repo', 'gh_branch', 'gh_token'];
  const LOCAL_DATA_KEYS  = ['journal_posts', 'journal_config', ...GH_STORAGE_KEYS];

  // ─── State helpers ────────────────────────────────────────────────────────────
  const DEFAULT_CONFIG = {
    title: 'Journal', tagline: '', author: '', timezone: '',
    cloudinary: { cloudName: '', uploadPreset: '' },
  };

  function loadState(storage) {
    const s = storage || localStorage;
    let posts = [];
    let config = { ...DEFAULT_CONFIG, cloudinary: { ...DEFAULT_CONFIG.cloudinary } };
    const rawPosts  = s.getItem('journal_posts');
    const rawConfig = s.getItem('journal_config');
    if (rawPosts)  posts  = JSON.parse(rawPosts);
    if (rawConfig) config = { ...config, ...JSON.parse(rawConfig) };
    return { posts, config };
  }

  function saveState(posts, config, storage) {
    const s = storage || localStorage;
    s.setItem('journal_posts',  JSON.stringify(posts));
    s.setItem('journal_config', JSON.stringify(config));
  }

  // ─── GitHub config ────────────────────────────────────────────────────────────
  function getGHConfig(storage) {
    const s = storage || localStorage;
    return {
      username: s.getItem('gh_username') || '',
      repo:     s.getItem('gh_repo')     || '',
      branch:   s.getItem('gh_branch')   || 'main',
      token:    s.getItem('gh_token')    || '',
    };
  }

  function saveGHConfig(ghConfig, storage) {
    const s = storage || localStorage;
    s.setItem('gh_username', ghConfig.username);
    s.setItem('gh_repo',     ghConfig.repo);
    s.setItem('gh_branch',   ghConfig.branch || 'main');
    s.setItem('gh_token',    ghConfig.token);
  }

  function clearGHToken(storage) {
    (storage || localStorage).removeItem('gh_token');
  }

  function clearAllLocalData(storage) {
    const s = storage || localStorage;
    LOCAL_DATA_KEYS.forEach(k => s.removeItem(k));
  }

  // ─── Post assembly ────────────────────────────────────────────────────────────
  // Build a post object from field values. Returns { id, date, body, tags, emojis, image, imageCaption }.
  function buildPost(fields, posts, config) {
    const tags = fields.tagsRaw
      ? fields.tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const emojis = [fields.emoji1, fields.emoji2].filter(Boolean);
    const caption = fields.caption || null;

    let postDate;
    if (fields.editingId) {
      postDate = fields.datetimeLocal
        ? Utils.localInputToIso(fields.datetimeLocal, config)
        : (posts.find(p => p.id === fields.editingId)?.date || new Date().toISOString());
    } else {
      postDate = new Date().toISOString();
    }

    return {
      id:           fields.editingId || Utils.nextPostId(posts),
      date:         postDate,
      body:         fields.body,
      tags,
      emojis,
      image:        fields.imageUrl || null,
      imageCaption: caption,
    };
  }

  // Apply a built post to the posts array: updates existing or prepends new.
  function applyPost(post, posts) {
    if (posts.some(p => p.id === post.id)) {
      return posts.map(p => p.id === post.id ? { ...p, ...post } : p);
    }
    return [post, ...posts];
  }

  // ─── Post list rendering ──────────────────────────────────────────────────────
  function renderPostItem(post, config) {
    const date     = Utils.formatPostDate(post.date, config);
    const tags     = (post.tags   || []).map(t => `<span class="post-tag-badge">${t}</span>`).join('');
    const emojiStr = (post.emojis || []).join('');
    const preview  = Utils.postPreview(post.body);
    return `
      <div class="post-item">
        <div>
          <div class="post-item-date">${date}${post.image ? ' · 📷' : ''}${emojiStr ? ' · ' + emojiStr : ''}</div>
          <div class="post-item-body">${preview}</div>
          ${tags ? `<div class="post-item-tags">${tags}</div>` : ''}
        </div>
        <div class="post-item-actions">
          <button class="btn-ghost" onclick="editPost(${JSON.stringify(post.id)})">edit</button>
          <button class="btn-danger" onclick="deletePost(${JSON.stringify(post.id)})">del</button>
        </div>
      </div>`;
  }

  function renderPostsList(posts, config) {
    if (!posts.length) {
      return '<div style="font-family:var(--mono);font-size:0.8rem;color:var(--muted);padding:2rem 0;">no posts yet.</div>';
    }
    return posts.map(p => renderPostItem(p, config)).join('');
  }

  // ─── Timezone select ──────────────────────────────────────────────────────────
  // Returns an array of timezone option objects: [{ value, label, selected }]
  function buildTimezoneOptions(currentTz, configTz) {
    const current = currentTz || (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');
    const all = TZ_LIST.includes(current) ? TZ_LIST : [current, ...TZ_LIST];
    const selected = configTz || current;
    return all.map(tz => ({
      value:    tz,
      label:    tz.replace(/_/g, ' '),
      selected: tz === selected,
    }));
  }

  // ─── GitHub API ───────────────────────────────────────────────────────────────
  async function fetchGitHubRepo(ghConfig, fetchFn) {
    const fn = fetchFn || fetch;
    const res = await fn(
      `https://api.github.com/repos/${ghConfig.username}/${ghConfig.repo}`,
      { headers: { 'Authorization': `Bearer ${ghConfig.token}`, 'Accept': 'application/vnd.github+json' } }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`${res.status}: ${err.message}`);
    }
    return res.json();
  }

  async function commitFileToGitHub(filename, content, ghConfig, fetchFn) {
    const fn = fetchFn || fetch;
    const apiBase = `https://api.github.com/repos/${ghConfig.username}/${ghConfig.repo}/contents/${filename}`;
    const headers = {
      'Authorization': `Bearer ${ghConfig.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
    let sha = null;
    try {
      const existing = await fn(`${apiBase}?ref=${ghConfig.branch}`, { headers });
      if (existing.ok) sha = (await existing.json()).sha;
    } catch (_) { /* file may not exist yet */ }

    const body = Utils.buildCommitPayload(content, sha, ghConfig.branch);
    const res = await fn(apiBase, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // ─── Cloudinary upload ────────────────────────────────────────────────────────
  async function uploadToCloudinary(file, config, fetchFn) {
    const fn = fetchFn || fetch;
    if (!Utils.isCloudinaryConfigured(config)) {
      throw new Error('Cloudinary not configured — add cloud name and upload preset in Settings');
    }
    const { cloudName, uploadPreset } = config.cloudinary;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
    const res = await fn(Utils.cloudinaryUploadUrl(cloudName), { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Cloudinary error ${res.status}`);
    }
    const data = await res.json();
    return data.secure_url;
  }

  // ─── GitHub source-of-truth fetch ────────────────────────────────────────────
  // Fetches posts.json directly from the repo contents API and returns the
  // parsed posts array. Throws if the request fails.
  async function fetchPostsFromGitHub(ghConfig, fetchFn) {
    const fn = fetchFn || fetch;
    const url = `https://api.github.com/repos/${ghConfig.username}/${ghConfig.repo}/contents/posts.json?ref=${ghConfig.branch}`;
    const res = await fn(url, {
      headers: {
        'Authorization': `Bearer ${ghConfig.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`${res.status}: ${err.message}`);
    }
    const data = await res.json();
    // GitHub returns file content as base64
    const decoded = atob(data.content.replace(/\n/g, ''));
    return JSON.parse(decoded).posts || [];
  }

  // ─── Export helpers ───────────────────────────────────────────────────────────
  // Returns a data-URL blob string — callers create the <a> and click it.
  function buildDownloadHref(text, type) {
    return URL.createObjectURL(new Blob([text], { type }));
  }

  // ─── Public API ───────────────────────────────────────────────────────────────
  const publicAPI = {
    // constants
    TZ_LIST,
    GH_STORAGE_KEYS,
    LOCAL_DATA_KEYS,
    DEFAULT_CONFIG,
    // state
    loadState,
    saveState,
    // GH config
    getGHConfig,
    saveGHConfig,
    clearGHToken,
    clearAllLocalData,
    // posts
    buildPost,
    applyPost,
    renderPostItem,
    renderPostsList,
    // UI helpers
    buildTimezoneOptions,
    buildDownloadHref,
    // API
    fetchGitHubRepo,
    fetchPostsFromGitHub,
    commitFileToGitHub,
    uploadToCloudinary,
  };

  if (typeof window !== 'undefined') window.AdminModule = publicAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;

})(typeof exports !== 'undefined' ? exports : {});
