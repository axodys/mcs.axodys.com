// ─── js/utils.js ─────────────────────────────────────────────────────────────
// Pure utility functions shared between feed.js and admin.js.
// No DOM dependencies — fully testable in Node/Jest.

(function (exports) {

  // ─── Timezone ───────────────────────────────────────────────────────────────
  function getBlogTz(config) {
    return (config && config.timezone) ||
      (typeof Intl !== 'undefined' && Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      'UTC';
  }

  // ─── Date formatting ────────────────────────────────────────────────────────
  // Returns "Mar 02 14:35" in the blog timezone.
  function formatPostDate(isoString, config) {
    const tz = getBlogTz(config);
    const d = new Date(isoString);
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: tz });
    const day   = d.toLocaleDateString('en-US', { day: '2-digit',  timeZone: tz });
    const time  = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
    return `${month} ${day} ${time}`;
  }

  // ─── Datetime-local conversion ───────────────────────────────────────────────
  // ISO string → value suitable for <input type="datetime-local"> in blog tz.
  function isoToLocalInput(isoString, config) {
    const tz = getBlogTz(config);
    const d = new Date(isoString);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    const p = {};
    parts.forEach(({ type, value }) => p[type] = value);
    return `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
  }

  // datetime-local input value → ISO string, treating the input as blog tz.
  function localInputToIso(localStr, config) {
    const tz = getBlogTz(config);
    const [datePart, timePart] = localStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const tzOffset = getTzOffsetMinutes(tz, naive);
    return new Date(naive.getTime() + tzOffset * 60000).toISOString();
  }

  function getTzOffsetMinutes(tz, date) {
    const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr  = date.toLocaleString('en-US', { timeZone: tz });
    return (new Date(utcStr) - new Date(tzStr)) / 60000;
  }

  // ─── Post helpers ────────────────────────────────────────────────────────────
  // Returns the next integer post ID (max existing + 1, or 1 if empty).
  function nextPostId(posts) {
    if (!posts || !posts.length) return 1;
    return Math.max(...posts.map(p => typeof p.id === 'number' ? p.id : 0)) + 1;
  }

  // Strips markdown syntax chars for a plain-text preview snippet.
  function postPreview(body, maxLength) {
    const len = maxLength || 120;
    const stripped = (body || '').replace(/[#*`_>]/g, '');
    return stripped.slice(0, len) + (stripped.length > len ? '…' : '');
  }

  // ─── GitHub config helpers ───────────────────────────────────────────────────
  function isGHConfigured(ghConfig) {
    return !!(ghConfig && ghConfig.username && ghConfig.repo && ghConfig.token);
  }

  function buildCommitPayload(content, sha, branch) {
    const filename = 'posts.json';
    const payload = {
      message: `update ${filename}`,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: branch || 'main',
    };
    if (sha) payload.sha = sha;
    return payload;
  }

  // ─── Cloudinary helpers ──────────────────────────────────────────────────────
  function isCloudinaryConfigured(config) {
    return !!(config && config.cloudinary &&
      config.cloudinary.cloudName && config.cloudinary.uploadPreset);
  }

  function cloudinaryUploadUrl(cloudName) {
    return `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  }

  // ─── Exports ─────────────────────────────────────────────────────────────────
  const publicAPI = {
    getBlogTz,
    formatPostDate,
    isoToLocalInput,
    localInputToIso,
    getTzOffsetMinutes,
    nextPostId,
    postPreview,
    isGHConfigured,
    buildCommitPayload,
    isCloudinaryConfigured,
    cloudinaryUploadUrl,
  };

  if (typeof window !== 'undefined') window.Utils = publicAPI;
  if (typeof module !== 'undefined' && module.exports) module.exports = publicAPI;

})(typeof exports !== 'undefined' ? exports : {});
