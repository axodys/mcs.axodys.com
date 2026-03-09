// tests/unit/admin.test.js
'use strict';

const AdminModule = require('../../js/admin.js');
const {
  loadState,
  saveState,
  getGHConfig,
  saveGHConfig,
  clearGHToken,
  clearAllLocalData,
  buildPost,
  applyPost,
  renderPostItem,
  renderPostsList,
  buildTimezoneOptions,
  buildDownloadHref,
  DEFAULT_CONFIG,
  TZ_LIST,
  LOCAL_DATA_KEYS,
} = AdminModule;

// ─── Minimal localStorage stub ────────────────────────────────────────────────
function makeStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem:    key       => store[key] ?? null,
    setItem:    (key, val) => { store[key] = String(val); },
    removeItem: key       => { delete store[key]; },
    _store:     store,
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const POST_1 = {
  id: 1,
  date: '2026-03-02T12:00:00.000Z',
  body: 'Hello world',
  tags: ['life', 'meta'],
  emojis: ['😊'],
  image: null,
  imageCaption: null,
};

const POST_2 = {
  id: 2,
  date: '2026-01-15T12:00:00.000Z',
  body: 'Earlier post',
  tags: ['books'],
  emojis: [],
  image: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  imageCaption: 'A sample image',
};

const BASE_CONFIG = {
  ...DEFAULT_CONFIG,
  timezone: 'UTC',
  cloudinary: { cloudName: 'mycloud', uploadPreset: 'mypreset' },
};

// ─── loadState ────────────────────────────────────────────────────────────────
describe('loadState', () => {
  test('returns default posts and config when storage is empty', () => {
    const storage = makeStorage();
    const { posts, config } = loadState(storage);
    expect(posts).toEqual([]);
    expect(config.title).toBe('Journal');
  });

  test('parses stored posts', () => {
    const storage = makeStorage({
      journal_posts: JSON.stringify([POST_1]),
    });
    const { posts } = loadState(storage);
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe(1);
  });

  test('merges stored config over defaults', () => {
    const storage = makeStorage({
      journal_config: JSON.stringify({ title: 'My Blog', timezone: 'America/Chicago' }),
    });
    const { config } = loadState(storage);
    expect(config.title).toBe('My Blog');
    expect(config.timezone).toBe('America/Chicago');
    // defaults still present for unset keys
    expect(config.author).toBe('');
  });

  test('preserves cloudinary defaults when not stored', () => {
    const storage = makeStorage({
      journal_config: JSON.stringify({ title: 'Test' }),
    });
    const { config } = loadState(storage);
    expect(config.cloudinary).toBeDefined();
  });
});

// ─── saveState ────────────────────────────────────────────────────────────────
describe('saveState', () => {
  test('serialises posts to journal_posts key', () => {
    const storage = makeStorage();
    saveState([POST_1], BASE_CONFIG, storage);
    const stored = JSON.parse(storage.getItem('journal_posts'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(1);
  });

  test('serialises config to journal_config key', () => {
    const storage = makeStorage();
    saveState([], BASE_CONFIG, storage);
    const stored = JSON.parse(storage.getItem('journal_config'));
    expect(stored.timezone).toBe('UTC');
  });

  test('roundtrips: save then load returns same data', () => {
    const storage = makeStorage();
    saveState([POST_1, POST_2], BASE_CONFIG, storage);
    const { posts, config } = loadState(storage);
    expect(posts).toHaveLength(2);
    expect(config.timezone).toBe('UTC');
  });
});

// ─── getGHConfig / saveGHConfig ────────────────────────────────────────────────
describe('getGHConfig', () => {
  test('returns empty strings when nothing stored', () => {
    const storage = makeStorage();
    const gh = getGHConfig(storage);
    expect(gh.username).toBe('');
    expect(gh.repo).toBe('');
    expect(gh.token).toBe('');
  });

  test('returns branch "main" as default', () => {
    const storage = makeStorage();
    expect(getGHConfig(storage).branch).toBe('main');
  });

  test('returns stored values', () => {
    const storage = makeStorage({
      gh_username: 'axodys',
      gh_repo: 'microcosm',
      gh_branch: 'main',
      gh_token: 'ghp_secret',
    });
    const gh = getGHConfig(storage);
    expect(gh.username).toBe('axodys');
    expect(gh.token).toBe('ghp_secret');
  });
});

describe('saveGHConfig', () => {
  test('persists all four fields to storage', () => {
    const storage = makeStorage();
    saveGHConfig({ username: 'axodys', repo: 'microcosm', branch: 'main', token: 'ghp_x' }, storage);
    expect(storage.getItem('gh_username')).toBe('axodys');
    expect(storage.getItem('gh_token')).toBe('ghp_x');
  });

  test('roundtrips via getGHConfig', () => {
    const storage = makeStorage();
    const cfg = { username: 'axodys', repo: 'microcosm', branch: 'develop', token: 'ghp_y' };
    saveGHConfig(cfg, storage);
    expect(getGHConfig(storage)).toEqual(cfg);
  });
});

// ─── clearGHToken ─────────────────────────────────────────────────────────────
describe('clearGHToken', () => {
  test('removes gh_token from storage', () => {
    const storage = makeStorage({ gh_token: 'ghp_secret' });
    clearGHToken(storage);
    expect(storage.getItem('gh_token')).toBeNull();
  });

  test('leaves other GH fields intact', () => {
    const storage = makeStorage({ gh_username: 'axodys', gh_token: 'ghp_secret' });
    clearGHToken(storage);
    expect(storage.getItem('gh_username')).toBe('axodys');
  });
});

// ─── clearAllLocalData ────────────────────────────────────────────────────────
describe('clearAllLocalData', () => {
  test('removes all known local data keys', () => {
    const initial = {};
    LOCAL_DATA_KEYS.forEach(k => { initial[k] = 'some-value'; });
    const storage = makeStorage(initial);
    clearAllLocalData(storage);
    LOCAL_DATA_KEYS.forEach(k => {
      expect(storage.getItem(k)).toBeNull();
    });
  });
});

// ─── buildPost ────────────────────────────────────────────────────────────────
describe('buildPost', () => {
  test('builds a new post with an auto-incremented id', () => {
    const fields = {
      body: 'New post',
      tagsRaw: 'life, ideas',
      caption: '',
      emoji1: '😊',
      emoji2: '',
      imageUrl: null,
      editingId: null,
      datetimeLocal: null,
    };
    const post = buildPost(fields, [POST_1, POST_2], BASE_CONFIG);
    expect(post.id).toBe(3); // max(1,2) + 1
    expect(post.body).toBe('New post');
  });

  test('parses comma-separated tags, trimming whitespace', () => {
    const fields = { body: 'x', tagsRaw: ' life ,  ideas ', caption: '', emoji1: '', emoji2: '', imageUrl: null, editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    expect(post.tags).toEqual(['life', 'ideas']);
  });

  test('filters empty tag strings', () => {
    const fields = { body: 'x', tagsRaw: '', caption: '', emoji1: '', emoji2: '', imageUrl: null, editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    expect(post.tags).toEqual([]);
  });

  test('collects non-empty emojis', () => {
    const fields = { body: 'x', tagsRaw: '', caption: '', emoji1: '😊', emoji2: '🎶', imageUrl: null, editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    expect(post.emojis).toEqual(['😊', '🎶']);
  });

  test('filters out empty emoji slots', () => {
    const fields = { body: 'x', tagsRaw: '', caption: '', emoji1: '😊', emoji2: '', imageUrl: null, editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    expect(post.emojis).toEqual(['😊']);
  });

  test('stores imageUrl on the post', () => {
    const fields = { body: 'x', tagsRaw: '', caption: 'nice shot', emoji1: '', emoji2: '', imageUrl: 'https://cdn.example.com/photo.jpg', editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    expect(post.image).toBe('https://cdn.example.com/photo.jpg');
    expect(post.imageCaption).toBe('nice shot');
  });

  test('sets imageCaption to null when caption is empty', () => {
    const fields = { body: 'x', tagsRaw: '', caption: '', emoji1: '', emoji2: '', imageUrl: null, editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    expect(post.imageCaption).toBeNull();
  });

  test('preserves editingId as the post id when editing', () => {
    const fields = { body: 'updated', tagsRaw: '', caption: '', emoji1: '', emoji2: '', imageUrl: null, editingId: 1, datetimeLocal: null };
    const post = buildPost(fields, [POST_1], BASE_CONFIG);
    expect(post.id).toBe(1);
  });

  test('new post date is a valid ISO string close to now', () => {
    const before = Date.now();
    const fields = { body: 'x', tagsRaw: '', caption: '', emoji1: '', emoji2: '', imageUrl: null, editingId: null, datetimeLocal: null };
    const post = buildPost(fields, [], BASE_CONFIG);
    const after = Date.now();
    const postTime = new Date(post.date).getTime();
    expect(postTime).toBeGreaterThanOrEqual(before);
    expect(postTime).toBeLessThanOrEqual(after);
  });

  test('when editing with a datetimeLocal, converts it using config timezone', () => {
    // UTC noon entered as "2026-03-02T12:00" in UTC tz
    const fields = { body: 'edit', tagsRaw: '', caption: '', emoji1: '', emoji2: '', imageUrl: null, editingId: 1, datetimeLocal: '2026-03-02T12:00' };
    const post = buildPost(fields, [POST_1], BASE_CONFIG);
    expect(post.date).toBe('2026-03-02T12:00:00.000Z');
  });
});

// ─── applyPost ────────────────────────────────────────────────────────────────
describe('applyPost', () => {
  test('prepends a new post to the array', () => {
    const newPost = { id: 3, date: '2026-04-01T12:00:00.000Z', body: 'newest', tags: [], emojis: [], image: null, imageCaption: null };
    const result = applyPost(newPost, [POST_1, POST_2]);
    expect(result[0].id).toBe(3);
    expect(result).toHaveLength(3);
  });

  test('does not mutate the original array', () => {
    const posts = [POST_1];
    const newPost = { id: 99, body: 'x', tags: [], emojis: [], image: null, imageCaption: null };
    applyPost(newPost, posts);
    expect(posts).toHaveLength(1);
  });

  test('replaces an existing post by id when editing', () => {
    const updated = { ...POST_1, body: 'edited body' };
    const result = applyPost(updated, [POST_1, POST_2]);
    expect(result).toHaveLength(2);
    expect(result.find(p => p.id === 1).body).toBe('edited body');
  });

  test('preserves order of other posts when editing', () => {
    const updated = { ...POST_1, body: 'changed' };
    const result = applyPost(updated, [POST_1, POST_2]);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });
});

// ─── renderPostItem ───────────────────────────────────────────────────────────
describe('renderPostItem', () => {
  test('includes the formatted date', () => {
    const html = renderPostItem(POST_1, BASE_CONFIG);
    expect(html).toContain('Mar');
  });

  test('includes the post body preview', () => {
    const html = renderPostItem(POST_1, BASE_CONFIG);
    expect(html).toContain('Hello world');
  });

  test('renders tag badges', () => {
    const html = renderPostItem(POST_1, BASE_CONFIG);
    expect(html).toContain('life');
    expect(html).toContain('meta');
  });

  test('renders camera emoji when post has an image', () => {
    const html = renderPostItem(POST_2, BASE_CONFIG);
    expect(html).toContain('📷');
  });

  test('does not render camera emoji when no image', () => {
    const html = renderPostItem(POST_1, BASE_CONFIG);
    expect(html).not.toContain('📷');
  });

  test('includes edit and delete buttons with the post id', () => {
    const html = renderPostItem(POST_1, BASE_CONFIG);
    expect(html).toContain('editPost(1)');
    expect(html).toContain('deletePost(1)');
  });

  test('renders emojis inline with date when present', () => {
    const html = renderPostItem(POST_1, BASE_CONFIG);
    expect(html).toContain('😊');
  });
});

// ─── renderPostsList ─────────────────────────────────────────────────────────
describe('renderPostsList', () => {
  test('returns the empty-state message for no posts', () => {
    const html = renderPostsList([], BASE_CONFIG);
    expect(html).toContain('no posts yet');
  });

  test('returns HTML for each post', () => {
    const html = renderPostsList([POST_1, POST_2], BASE_CONFIG);
    expect(html).toContain('Hello world');
    expect(html).toContain('Earlier post');
  });

  test('returns a string', () => {
    expect(typeof renderPostsList([POST_1], BASE_CONFIG)).toBe('string');
  });
});

// ─── buildTimezoneOptions ─────────────────────────────────────────────────────
describe('buildTimezoneOptions', () => {
  test('returns an array of option objects', () => {
    const opts = buildTimezoneOptions('UTC', 'UTC');
    expect(Array.isArray(opts)).toBe(true);
    expect(opts.length).toBeGreaterThan(0);
  });

  test('each option has value, label, and selected fields', () => {
    const opts = buildTimezoneOptions('UTC', 'UTC');
    expect(opts[0]).toHaveProperty('value');
    expect(opts[0]).toHaveProperty('label');
    expect(opts[0]).toHaveProperty('selected');
  });

  test('marks the configTz option as selected', () => {
    const opts = buildTimezoneOptions('UTC', 'America/New_York');
    const selected = opts.filter(o => o.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].value).toBe('America/New_York');
  });

  test('prepends an unlisted currentTz to the list', () => {
    const exotic = 'Pacific/Chatham';
    const opts = buildTimezoneOptions(exotic, exotic);
    expect(opts[0].value).toBe(exotic);
  });

  test('does not duplicate a currentTz that is already in TZ_LIST', () => {
    const tz = 'America/New_York'; // already in TZ_LIST
    const opts = buildTimezoneOptions(tz, tz);
    const count = opts.filter(o => o.value === tz).length;
    expect(count).toBe(1);
  });

  test('labels replace underscores with spaces', () => {
    const opts = buildTimezoneOptions('UTC', 'America/New_York');
    const nyc = opts.find(o => o.value === 'America/New_York');
    expect(nyc.label).toBe('America/New York');
  });
});
