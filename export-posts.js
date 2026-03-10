#!/usr/bin/env node
// export-posts.js — export posts.json to a posts.md file in the import format
//
// Usage: node export-posts.js [--input <path>] [--output <path>]
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
  console.log('Usage: node export-posts.js [--input <path>] [--output <path>]');
  process.exit(0);
}

const inputFlag  = args.indexOf('--input');
const outputFlag = args.indexOf('--output');
const inputFile  = inputFlag  !== -1 ? args[inputFlag  + 1] : path.join(__dirname, 'posts.json');
const outputFile = outputFlag !== -1 ? args[outputFlag + 1] : path.join(__dirname, 'posts.md');

if (!fs.existsSync(inputFile)) {
  console.error(`Error: file not found — ${inputFile}`);
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

// ─── Date formatting ──────────────────────────────────────────────────────────
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                     'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function formatPostHeader(isoDate, tz) {
  const date = new Date(isoDate);

  // Get local time components in the target timezone
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
  const month  = parseInt(get('month'),  10) - 1; // 0-indexed
  const day    = parseInt(get('day'),    10);
  const hour   = get('hour').padStart(2, '0');
  const minute = get('minute').padStart(2, '0');

  // Handle midnight hour reported as '24' by some implementations
  const displayHour = hour === '24' ? '00' : hour;

  return {
    year,
    dateStr: `${MONTH_NAMES[month]} ${String(day).padStart(2, '0')} ${displayHour}:${minute}`,
  };
}

// ─── Document builder ─────────────────────────────────────────────────────────
function buildDocument(posts, tz) {
  // posts.json is descending (newest first) — that's the order we want in the doc
  const lines = [];
  let currentYear = null;

  for (const post of posts) {
    const { year, dateStr } = formatPostHeader(post.date, tz);

    // Emit year header when year changes
    if (year !== currentYear) {
      if (currentYear !== null) lines.push(''); // blank line before new year
      lines.push(`## ${year}`);
      currentYear = year;
    }

    lines.push('');

    // Post header: * #### <emojis><dateStr>
    const emojiStr = (post.emojis || []).join('');
    lines.push(`* #### ${emojiStr}${emojiStr ? ' ' : ''}${dateStr}`);

    // Body
    const body = (post.body || '').trimEnd();
    if (body) {
      lines.push(body);
    }

    // Optional metadata lines
    if (post.tags && post.tags.length) {
      lines.push(`tags: ${post.tags.join(', ')}`);
    }
    if (post.image) {
      lines.push(`image: ${post.image}`);
    }
    if (post.imageCaption) {
      lines.push(`caption: ${post.imageCaption}`);
    }
  }

  lines.push(''); // trailing newline
  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const tz = await resolveTimezone();

  const data  = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const posts = data.posts || [];

  if (!posts.length) {
    console.error('No posts found in posts.json.');
    process.exit(1);
  }

  const doc = buildDocument(posts, tz);
  fs.writeFileSync(outputFile, doc, 'utf8');

  console.log(`✓ exported ${posts.length} post${posts.length !== 1 ? 's' : ''} → ${outputFile}`);
  console.log(`  timezone : ${tz}`);
  const years = [...new Set(posts.map(p => new Date(p.date).getFullYear()))];
  console.log(`  years    : ${years.sort((a, b) => b - a).join(', ')}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });