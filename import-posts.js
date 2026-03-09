#!/usr/bin/env node
// import-posts.js — convert a formatted markdown document to posts.json
//
// Usage: node import-posts.js <input.md> [--output <path>]
//
// Post format:
//
//   ## 2026
//
//   * #### 🍏⚙️ FEB 26 21:38
//   First paragraph.
//
//   Second paragraph, still the same post.
//
//   tags: life, ideas
//   image: https://cdn.example.com/photo.jpg
//   caption: optional caption
//
//   * #### 😊 MAR 01 09:15
//   Another post.
//
//   ## 2025
//
//   * #### 🎶 DEC 31 23:59
//   Last post of 2025.

'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (!args.length || args[0] === '--help') {
  console.log('Usage: node import-posts.js <input.md> [--output <path>]');
  process.exit(args[0] === '--help' ? 0 : 1);
}

const inputFile  = args[0];
const outputFlag = args.indexOf('--output');
const outputFile = outputFlag !== -1 ? args[outputFlag + 1] : path.join(__dirname, 'posts.json');

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

// ─── Date parsing ─────────────────────────────────────────────────────────────
const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function getTzOffsetMinutes(tz, date) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr  = date.toLocaleString('en-US', { timeZone: tz });
  return (new Date(utcStr) - new Date(tzStr)) / 60000;
}

// Convert "FEB 26 21:38" + year + tz into an ISO string.
function parsePostDate(dateStr, year, tz) {
  const parts = dateStr.trim().split(/\s+/);
  if (parts.length !== 3) throw new Error(`Unrecognised date format: "${dateStr}"`);

  const [monStr, dayStr, timeStr] = parts;
  const month = MONTHS[monStr.toUpperCase()];
  if (month === undefined) throw new Error(`Unknown month: "${monStr}"`);

  const day         = parseInt(dayStr, 10);
  const [hour, min] = timeStr.split(':').map(Number);

  // Build a naive UTC date at those components, then correct for tz offset
  const naive    = new Date(Date.UTC(year, month, day, hour, min, 0, 0));
  const tzOffset = getTzOffsetMinutes(tz, naive); // (UTC - local) in minutes
  return new Date(naive.getTime() + tzOffset * 60000).toISOString();
}

// ─── Emoji extraction ─────────────────────────────────────────────────────────
// Splits "🍏⚙️ FEB 26 21:38" into { emojis: ['🍏','⚙️'], dateStr: 'FEB 26 21:38' }
function splitGraphemes(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter().segment(str)].map(s => s.segment);
  }
  // Fallback for older Node: spread by code point
  return [...str];
}

function extractEmojisAndDate(headerValue) {
  const dateMatch = headerValue.match(/([A-Z]{3}\s+\d{1,2}\s+\d{2}:\d{2})/);
  if (!dateMatch) throw new Error(`No date found in header: "${headerValue}"`);

  const dateStr = dateMatch[1];
  const before  = headerValue.slice(0, headerValue.indexOf(dateStr)).trim();
  const emojis  = before ? splitGraphemes(before).filter(ch => ch.trim() !== '') : [];
  return { emojis, dateStr };
}

// ─── Document parser ──────────────────────────────────────────────────────────
function parseDocument(text) {
  const lines    = text.split('\n');
  const rawPosts = [];

  let currentYear = null;
  let currentPost = null;

  function finalisePost() {
    if (!currentPost) return;

    // Trim trailing blank lines from body
    while (currentPost.bodyLines.length &&
           currentPost.bodyLines[currentPost.bodyLines.length - 1].trim() === '') {
      currentPost.bodyLines.pop();
    }

    // Peel optional metadata lines from the end (tags, image, caption)
    const metadata = {};
    let changed = true;
    while (changed) {
      changed = false;
      // Strip trailing blank lines
      while (currentPost.bodyLines.length &&
             currentPost.bodyLines[currentPost.bodyLines.length - 1].trim() === '') {
        currentPost.bodyLines.pop();
        changed = true;
      }
      // Strip a metadata line
      if (currentPost.bodyLines.length) {
        const last = currentPost.bodyLines[currentPost.bodyLines.length - 1].trim();
        const metaMatch = last.match(/^(tags|image|caption):\s*(.*)$/i);
        if (metaMatch) {
          metadata[metaMatch[1].toLowerCase()] = metaMatch[2].trim();
          currentPost.bodyLines.pop();
          changed = true;
        }
      }
    }

    currentPost.tags    = metadata.tags
      ? metadata.tags.split(',').map(t => t.trim()).filter(Boolean)
      : [];
    currentPost.image   = metadata.image   || null;
    currentPost.caption = metadata.caption || null;

    rawPosts.push(currentPost);
    currentPost = null;
  }

  for (const line of lines) {
    // Year header: ## 2025
    const yearMatch = line.match(/^##\s+(\d{4})\s*$/);
    if (yearMatch) {
      finalisePost();
      currentYear = parseInt(yearMatch[1], 10);
      continue;
    }

    // Post header: * #### <emojis+date>
    const headerMatch = line.match(/^\*\s+#{1,6}\s+(.+)$/);
    if (headerMatch) {
      finalisePost();
      if (currentYear === null) {
        throw new Error(`Post header before any ## YEAR line: "${line}"`);
      }
      const { emojis, dateStr } = extractEmojisAndDate(headerMatch[1]);
      currentPost = { year: currentYear, emojis, dateStr, bodyLines: [] };
      continue;
    }

    // Body line
    if (currentPost) {
      currentPost.bodyLines.push(line);
    }
  }

  finalisePost();
  return rawPosts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const tz   = await resolveTimezone();
  const text = fs.readFileSync(inputFile, 'utf8');

  let rawPosts;
  try {
    rawPosts = parseDocument(text);
  } catch (e) {
    console.error(`Parse error: ${e.message}`);
    process.exit(1);
  }

  if (!rawPosts.length) {
    console.error('No posts found in document.');
    process.exit(1);
  }

  // Document is descending (newest first); reverse for chronological ID assignment
  const chronological = [...rawPosts].reverse();

  const posts = chronological.map((raw, i) => {
    let date;
    try {
      date = parsePostDate(raw.dateStr, raw.year, tz);
    } catch (e) {
      console.error(`Date parse error on post ${i + 1}: ${e.message}`);
      process.exit(1);
    }

    return {
      id:           i + 1,
      date,
      body:         raw.bodyLines.join('\n').trimEnd(),
      tags:         raw.tags,
      emojis:       raw.emojis,
      image:        raw.image,
      imageCaption: raw.caption,
    };
  });

  // Reverse back to descending order for posts.json
  posts.reverse();

  fs.writeFileSync(outputFile, JSON.stringify({ posts }, null, 2), 'utf8');

  console.log(`✓ imported ${posts.length} post${posts.length !== 1 ? 's' : ''} → ${outputFile}`);
  console.log(`  timezone : ${tz}`);
  console.log(`  id range : 1–${posts.length} (oldest → newest)`);
}

main().catch(e => { console.error(e.message); process.exit(1); });