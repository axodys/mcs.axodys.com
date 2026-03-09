// tests/unit/utils.test.js
'use strict';

const {
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
} = require('../../js/utils.js');

// ─── getBlogTz ────────────────────────────────────────────────────────────────
describe('getBlogTz', () => {
  test('returns config timezone when set', () => {
    expect(getBlogTz({ timezone: 'America/New_York' })).toBe('America/New_York');
  });

  test('falls back to system timezone when config timezone is empty string', () => {
    const tz = getBlogTz({ timezone: '' });
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  test('falls back gracefully with null config', () => {
    const tz = getBlogTz(null);
    expect(typeof tz).toBe('string');
    expect(tz.length).toBeGreaterThan(0);
  });

  test('falls back gracefully with undefined config', () => {
    const tz = getBlogTz(undefined);
    expect(typeof tz).toBe('string');
  });
});

// ─── formatPostDate ───────────────────────────────────────────────────────────
describe('formatPostDate', () => {
  test('returns a non-empty string', () => {
    const result = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('includes the month abbreviation', () => {
    expect(formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' })).toMatch(/Mar/);
  });

  test('includes zero-padded day', () => {
    expect(formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' })).toMatch(/02/);
  });

  test('includes 24-hour time', () => {
    expect(formatPostDate('2026-03-02T14:30:00.000Z', { timezone: 'UTC' })).toMatch(/14:30/);
  });

  test('midnight renders as 00:00 not 24:00', () => {
    expect(formatPostDate('2026-03-02T00:00:00.000Z', { timezone: 'UTC' })).toMatch(/00:00/);
  });

  test('respects timezone offset — UTC noon ≠ NYC noon in March', () => {
    const utc = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    const nyc = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'America/New_York' });
    expect(utc).not.toBe(nyc);
  });

  test('NYC renders UTC noon as 07:00 in March (UTC-5)', () => {
    const nyc = formatPostDate('2026-03-02T12:00:00.000Z', { timezone: 'America/New_York' });
    expect(nyc).toMatch(/07:00/);
  });
});

// ─── getTzOffsetMinutes ───────────────────────────────────────────────────────
describe('getTzOffsetMinutes', () => {
  test('returns 0 for UTC vs UTC', () => {
    const d = new Date('2026-03-02T12:00:00.000Z');
    expect(getTzOffsetMinutes('UTC', d)).toBe(0);
  });

  test('returns 300 for America/New_York in March (UTC-5, before DST)', () => {
    // 2026-03-02 is before DST (which starts 2026-03-08), so offset is 300 min
    const d = new Date('2026-03-02T12:00:00.000Z');
    expect(getTzOffsetMinutes('America/New_York', d)).toBe(300);
  });

  test('returns a number', () => {
    const d = new Date('2026-03-02T12:00:00.000Z');
    expect(typeof getTzOffsetMinutes('UTC', d)).toBe('number');
  });
});

// ─── isoToLocalInput ─────────────────────────────────────────────────────────
describe('isoToLocalInput', () => {
  test('returns a datetime-local formatted string', () => {
    const result = isoToLocalInput('2026-03-02T12:00:00.000Z', { timezone: 'UTC' });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test('UTC noon becomes 2026-03-02T12:00 in UTC', () => {
    expect(isoToLocalInput('2026-03-02T12:00:00.000Z', { timezone: 'UTC' }))
      .toBe('2026-03-02T12:00');
  });

  test('UTC noon becomes 2026-03-02T07:00 in America/New_York (UTC-5)', () => {
    expect(isoToLocalInput('2026-03-02T12:00:00.000Z', { timezone: 'America/New_York' }))
      .toBe('2026-03-02T07:00');
  });

  test('midnight UTC does not roll back to previous day', () => {
    // UTC midnight in UTC should stay on the same date
    const result = isoToLocalInput('2026-03-02T00:00:00.000Z', { timezone: 'UTC' });
    expect(result).toBe('2026-03-02T00:00');
  });
});

// ─── localInputToIso ─────────────────────────────────────────────────────────
describe('localInputToIso', () => {
  test('returns a valid ISO string', () => {
    const result = localInputToIso('2026-03-02T12:00', { timezone: 'UTC' });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('UTC noon input round-trips to UTC noon ISO', () => {
    const iso = localInputToIso('2026-03-02T12:00', { timezone: 'UTC' });
    expect(iso).toBe('2026-03-02T12:00:00.000Z');
  });

  test('NYC 07:00 input converts to UTC 12:00 ISO', () => {
    const iso = localInputToIso('2026-03-02T07:00', { timezone: 'America/New_York' });
    expect(iso).toBe('2026-03-02T12:00:00.000Z');
  });

  test('isoToLocalInput and localInputToIso are inverse of each other', () => {
    const original = '2026-06-15T12:00:00.000Z';
    const cfg = { timezone: 'America/Chicago' };
    const local = isoToLocalInput(original, cfg);
    const roundTripped = localInputToIso(local, cfg);
    expect(roundTripped).toBe(original);
  });
});

// ─── nextPostId ───────────────────────────────────────────────────────────────
describe('nextPostId', () => {
  test('returns 1 for empty array', () => {
    expect(nextPostId([])).toBe(1);
  });

  test('returns 1 for null/undefined', () => {
    expect(nextPostId(null)).toBe(1);
    expect(nextPostId(undefined)).toBe(1);
  });

  test('returns max + 1', () => {
    const posts = [{ id: 3 }, { id: 1 }, { id: 5 }];
    expect(nextPostId(posts)).toBe(6);
  });

  test('ignores non-numeric ids', () => {
    const posts = [{ id: 'welcome001' }, { id: 2 }];
    expect(nextPostId(posts)).toBe(3);
  });

  test('handles all non-numeric ids by returning 1', () => {
    const posts = [{ id: 'foo' }, { id: 'bar' }];
    expect(nextPostId(posts)).toBe(1);
  });

  test('returns 1 when all ids are 0 (non-numeric mapped to 0)', () => {
    // Math.max of all-zeros + 1 = 1
    const posts = [{ id: 'abc' }];
    expect(nextPostId(posts)).toBe(1);
  });
});

// ─── postPreview ──────────────────────────────────────────────────────────────
describe('postPreview', () => {
  test('strips markdown characters', () => {
    const result = postPreview('# Hello **world** `code`');
    expect(result).not.toMatch(/[#*`]/);
    // stripping # leaves a leading space; just verify the words are present
    expect(result).toContain('Hello');
    expect(result).toContain('world');
    expect(result).toContain('code');
  });

  test('truncates at default 120 chars and appends ellipsis', () => {
    const long = 'a'.repeat(200);
    const result = postPreview(long);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBe(121); // 120 chars + ellipsis
  });

  test('does not truncate short content', () => {
    const short = 'Hello world';
    expect(postPreview(short)).toBe('Hello world');
  });

  test('respects custom maxLength', () => {
    const result = postPreview('Hello world', 5);
    expect(result).toBe('Hello…');
  });

  test('handles null/empty body', () => {
    expect(postPreview(null)).toBe('');
    expect(postPreview('')).toBe('');
  });
});

// ─── isGHConfigured ───────────────────────────────────────────────────────────
describe('isGHConfigured', () => {
  test('returns true when all required fields are present', () => {
    expect(isGHConfigured({ username: 'axodys', repo: 'microcosm', token: 'ghp_abc' })).toBe(true);
  });

  test('returns false when token is missing', () => {
    expect(isGHConfigured({ username: 'axodys', repo: 'microcosm', token: '' })).toBe(false);
  });

  test('returns false when username is missing', () => {
    expect(isGHConfigured({ username: '', repo: 'microcosm', token: 'ghp_abc' })).toBe(false);
  });

  test('returns false when repo is missing', () => {
    expect(isGHConfigured({ username: 'axodys', repo: '', token: 'ghp_abc' })).toBe(false);
  });

  test('returns false for null config', () => {
    expect(isGHConfigured(null)).toBe(false);
  });
});

// ─── buildCommitPayload ───────────────────────────────────────────────────────
describe('buildCommitPayload', () => {
  test('includes message, content, and branch', () => {
    const payload = buildCommitPayload('{"posts":[]}', null, 'main');
    expect(payload.message).toMatch(/posts\.json/);
    expect(typeof payload.content).toBe('string'); // base64
    expect(payload.branch).toBe('main');
  });

  test('omits sha when null', () => {
    const payload = buildCommitPayload('{}', null, 'main');
    expect(payload.sha).toBeUndefined();
  });

  test('includes sha when provided', () => {
    const payload = buildCommitPayload('{}', 'abc123sha', 'main');
    expect(payload.sha).toBe('abc123sha');
  });

  test('defaults branch to main when not provided', () => {
    const payload = buildCommitPayload('{}', null, undefined);
    expect(payload.branch).toBe('main');
  });

  test('base64-encodes the content', () => {
    const payload = buildCommitPayload('hello', null, 'main');
    expect(Buffer.from(payload.content, 'base64').toString()).toBe('hello');
  });
});

// ─── isCloudinaryConfigured ───────────────────────────────────────────────────
describe('isCloudinaryConfigured', () => {
  test('returns true when cloudName and uploadPreset are set', () => {
    expect(isCloudinaryConfigured({
      cloudinary: { cloudName: 'mycloud', uploadPreset: 'mypreset' }
    })).toBe(true);
  });

  test('returns false when cloudName is missing', () => {
    expect(isCloudinaryConfigured({
      cloudinary: { cloudName: '', uploadPreset: 'mypreset' }
    })).toBe(false);
  });

  test('returns false when uploadPreset is missing', () => {
    expect(isCloudinaryConfigured({
      cloudinary: { cloudName: 'mycloud', uploadPreset: '' }
    })).toBe(false);
  });

  test('returns false when cloudinary key is absent', () => {
    expect(isCloudinaryConfigured({ title: 'My Blog' })).toBe(false);
  });

  test('returns false for null config', () => {
    expect(isCloudinaryConfigured(null)).toBe(false);
  });
});

// ─── cloudinaryUploadUrl ──────────────────────────────────────────────────────
describe('cloudinaryUploadUrl', () => {
  test('returns the correct Cloudinary upload endpoint', () => {
    expect(cloudinaryUploadUrl('mycloud'))
      .toBe('https://api.cloudinary.com/v1_1/mycloud/image/upload');
  });

  test('interpolates cloudName into the URL', () => {
    expect(cloudinaryUploadUrl('another-cloud')).toContain('another-cloud');
  });
});
