#!/usr/bin/env node
// export-posts.js — export posts.json to a posts.md file in the import format
//
// Usage: node export-posts.js [--input <path>] [--output <path>]
//                             [--striptags] [--startdate YYYY-MM-DD] [--days <n>]
//
// Output format mirrors the import format exactly so the file can be
// round-tripped back through import-posts.js without data loss.

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args[0] === '--help') {
  console.log([
    'Usage: node export-posts.js [options]',
    '',
    'Options:',
    '  --input <path>          Source posts.json (default: posts.json)',
    '  --output <path>         Output file (default: posts.md)',
    '  --striptags             Omit tags: lines from output',
    '  --startdate YYYY-MM-DD  Begin export from this date (inclusive)',
    '  --days <n>              Limit export to n days from start date',
    '  --mdimages              Inline images as ![](url "caption") instead of image:/caption: lines',
  ].join('\n'));
  process.exit(0);
}

function flagValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

const inputFile  = flagValue('--input')     || path.join(__dirname, 'posts.json');
const outputFile = flagValue('--output')    || path.join(__dirname, 'posts.md');
const startDateArg = flagValue('--startdate');
const daysArg      = flagValue('--days');
const stripTags = args.includes('--striptags');
const mdImages  = args.includes('--mdimages');

if (!fs.existsSync(inputFile)) {
  console.error(`Error: file not found — ${inputFile}`);
  process.exit(1);
}

// Validate --startdate
if (startDateArg && !/^\d{4}-\d{2}-\d{2}$/.test(startDateArg)) {
  console.error('Error: --startdate must be in YYYY-MM-DD format');
  process.exit(1);
}

// Validate --days
const daysLimit = daysArg ? parseInt(daysArg, 10) : null;
if (daysArg && (isNaN(daysLimit) || daysLimit < 1)) {
  console.error('Error: --days must be a positive integer');
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────
const configPath = path.join(__dirname, 'config.json');
let config = {};
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// ─── Timezone resolution ──────────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer); });
  });
}

async function resolveTimezone() {
  if (config.timezone) return config.timezone;
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const answer  = await prompt(
    `config.json has no timezone set. Use local timezone "${localTz}"? [Y/n] `
  );
  if (answer.trim().toLowerCase() === 'n') {
    const manual = await prompt('Enter timezone (e.g. America/New_York): ');
    const tz = manual.trim();
    if (!tz) { console.error('No timezone provided — aborting.'); process.exit(1); }
    return tz;
  }
  return localTz;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                     'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatPostHeader(isoDate, tz) {
  const date = new Date(isoDate);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(date);

  const get = type => parts.find(p => p.type === type).value;
  const year   = parseInt(get('year'),   10);
  const month  = parseInt(get('month'),  10) - 1;
  const day    = parseInt(get('day'),    10);
  const hour   = get('hour').padStart(2, '0');
  const minute = get('minute').padStart(2, '0');
  const displayHour = hour === '24' ? '00' : hour;

  return {
    year,
    dateStr: `${MONTH_NAMES[month]} ${String(day).padStart(2, '0')} ${displayHour}:${minute}`,
  };
}

// Returns a YYYY-MM-DD string for a post date in the given timezone
function localDateString(isoDate, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(isoDate));
  return parts.map(p => p.value).join(''); // en-CA gives YYYY-MM-DD
}

// ─── Post filtering ───────────────────────────────────────────────────────────
function filterPosts(posts, tz) {
  // posts.json is newest-first; sort oldest-first for date-range logic
  const sorted = [...posts].sort((a, b) => new Date(a.date) - new Date(b.date));

  let startDate = startDateArg || localDateString(sorted[0].date, tz);
  let endDate   = null;

  if (daysLimit) {
    // endDate is startDate + (days - 1), inclusive
    const d = new Date(startDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + daysLimit - 1);
    endDate = d.toISOString().slice(0, 10);
  }

  const filtered = sorted.filter(p => {
    const d = localDateString(p.date, tz);
    if (d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });

  // Return newest-first to match posts.json ordering
  return filtered.reverse();
}

// ─── Document builder ─────────────────────────────────────────────────────────
function buildDocument(posts, tz) {
  const lines = [];
  let currentYear = null;

  for (const post of posts) {
    const { year, dateStr } = formatPostHeader(post.date, tz);

    if (year !== currentYear) {
      if (currentYear !== null) lines.push('');
      lines.push(`## ${year}`);
      currentYear = year;
    }

    lines.push('');

    const emojiStr = (post.emojis || []).join('');
    lines.push(`* #### ${emojiStr}${emojiStr ? ' ' : ''}${dateStr}`);

    const body = (post.body || '').trimEnd();
    if (mdImages && post.image) {
      const caption = post.imageCaption ? ` "${post.imageCaption}"` : '';
      const imgTag  = `![](${post.image}${caption})`;
      lines.push(body ? `${imgTag}\n${body}` : imgTag);
    } else {
      if (body) lines.push(body);
    }

    if (!stripTags && post.tags && post.tags.length) {
      lines.push(`tags: ${post.tags.join(', ')}`);
    }
    if (!mdImages && post.image)        lines.push(`image: ${post.image}`);
    if (!mdImages && post.imageCaption) lines.push(`caption: ${post.imageCaption}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const tz = await resolveTimezone();

  const data  = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const allPosts = data.posts || [];

  if (!allPosts.length) {
    console.error('No posts found in posts.json.');
    process.exit(1);
  }

  const posts = (startDateArg || daysLimit) ? filterPosts(allPosts, tz) : allPosts;

  if (!posts.length) {
    console.error('No posts matched the specified date range.');
    process.exit(1);
  }

  const doc = buildDocument(posts, tz);
  fs.writeFileSync(outputFile, doc, 'utf8');

  const dateRange = (() => {
    const sorted = [...posts].sort((a, b) => new Date(a.date) - new Date(b.date));
    const first = localDateString(sorted[0].date, tz);
    const last  = localDateString(sorted[sorted.length - 1].date, tz);
    return first === last ? first : `${first} → ${last}`;
  })();

  console.log(`✓ exported ${posts.length} of ${allPosts.length} post${allPosts.length !== 1 ? 's' : ''} → ${outputFile}`);
  console.log(`  timezone  : ${tz}`);
  console.log(`  date range: ${dateRange}`);
  if (stripTags) console.log(`  tags      : stripped`);
  if (mdImages)  console.log(`  images    : inlined as markdown`);
}

main().catch(e => { console.error(e.message); process.exit(1); });