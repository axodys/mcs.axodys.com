#!/usr/bin/env node
// emoji-tool.js — convert emoji_data.json ↔ emoji_data.md
//
// Usage:
//   node emoji-tool.js --export [--input emoji_data.json] [--output emoji_data.md]
//   node emoji-tool.js --import [--input emoji_data.md]  [--output emoji_data.json]

'use strict';

const fs   = require('fs');
const path = require('path');

const COLS = 6; // emoji per row in markdown

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (!args.length || args[0] === '--help') {
  console.log([
    'Usage: node emoji-tool.js <--export|--import|--report> [options]',
    '',
    'Commands:',
    '  --export   Convert emoji_data.json → emoji_data.md',
    '  --import   Convert emoji_data.md  → emoji_data.json',
    '  --report   Count emoji frequency in posts.json → emoji-report.md',
    '',
    'Options:',
    '  --input <path>   Input file (default depends on command)',
    '  --output <path>  Output file (default depends on command)',
  ].join('\n'));
  process.exit(0);
}

const doExport = args.includes('--export');
const doImport = args.includes('--import');
const doReport = args.includes('--report');

if ([doExport, doImport, doReport].filter(Boolean).length !== 1) {
  console.error('Error: specify exactly one of --export, --import, or --report');
  process.exit(1);
}

function flagValue(flag) {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
}

// ─── Export: emoji_data.json → emoji_data.md ──────────────────────────────────
function runExport() {
  const inputFile  = flagValue('--input')  || path.join(__dirname, 'emoji_data.json');
  const outputFile = flagValue('--output') || path.join(__dirname, 'emoji_data.md');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: file not found — ${inputFile}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const lines = ['# Emoji Data', ''];

  for (const [label, emojis] of Object.entries(data)) {
    lines.push(`## ${label}`, '');
    // Split into rows of COLS
    for (let i = 0; i < emojis.length; i += COLS) {
      lines.push(emojis.slice(i, i + COLS).join(' '));
    }
    lines.push('');
  }

  fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');
  const sectionCount = Object.keys(data).length;
  const emojiCount   = Object.values(data).reduce((n, a) => n + a.length, 0);
  console.log(`✓ exported ${sectionCount} sections, ${emojiCount} emoji → ${outputFile}`);
}

// ─── Import: emoji_data.md → emoji_data.json ──────────────────────────────────
function runImport() {
  const inputFile  = flagValue('--input')  || path.join(__dirname, 'emoji_data.md');
  const outputFile = flagValue('--output') || path.join(__dirname, 'emoji_data.json');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: file not found — ${inputFile}`);
    process.exit(1);
  }

  const raw   = fs.readFileSync(inputFile, 'utf8');
  const lines = raw.split('\n');

  // Validate opening header
  const firstNonEmpty = lines.find(l => l.trim());
  if (firstNonEmpty?.trim() !== '# Emoji Data') {
    console.error('Error: file does not start with "# Emoji Data" — is this an emoji_data.md file?');
    process.exit(1);
  }

  const result = {};
  let currentLabel = null;

  // Match complete emoji sequences including:
  // - Regional indicator pairs (flags, e.g. 🇺🇸)
  // - Simple emoji with optional VS16 (U+FE0F)
  // - Emoji + skin tone modifier (U+1F3FB–1F3FF)
  // - ZWJ sequences (e.g. 🦸🏻‍♂️ = base + skintone + ZWJ + gender + VS16)
  // - Keycap sequences (digit + U+FE0F + U+20E3)
  const emojiRe = /\p{Regional_Indicator}\p{Regional_Indicator}|\p{Emoji}(?:\uFE0F|\u20E3|\p{EMod})?(?:\u200D\p{Emoji}(?:\uFE0F|\u20E3|\p{EMod})?)*\uFE0F?/gu;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '# Emoji Data') continue;

    if (trimmed.startsWith('## ')) {
      currentLabel = trimmed.slice(3).trim();
      result[currentLabel] = [];
      continue;
    }

    if (currentLabel) {
      const found = trimmed.match(emojiRe);
      if (found) {
        // Filter out stray lone ASCII/digit matches from the Emoji property
        result[currentLabel].push(...found.filter(e => e.trim().length > 0 && !/^[\x20-\x7E]$/.test(e)));
      }
    }
  }

  const sectionCount = Object.keys(result).length;
  if (!sectionCount) {
    console.error('Error: no sections found — check file format');
    process.exit(1);
  }

  // Write compact arrays
  const jsonLines = ['{'];
  const entries = Object.entries(result);
  entries.forEach(([label, emojis], i) => {
    const comma = i < entries.length - 1 ? ',' : '';
    jsonLines.push(`  ${JSON.stringify(label)}: [${emojis.map(e => JSON.stringify(e)).join(',')}]${comma}`);
  });
  jsonLines.push('}', '');

  fs.writeFileSync(outputFile, jsonLines.join('\n'), 'utf8');
  const emojiCount = Object.values(result).reduce((n, a) => n + a.length, 0);
  console.log(`✓ imported ${sectionCount} sections, ${emojiCount} emoji → ${outputFile}`);
}

// ─── Report: posts.json → emoji-report.md ────────────────────────────────────
function runReport() {
  const inputFile  = flagValue('--input')  || path.join(__dirname, 'posts.json');
  const outputFile = flagValue('--output') || path.join(__dirname, 'emoji-report.md');

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: file not found — ${inputFile}`);
    process.exit(1);
  }

  const data  = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const posts = data.posts || [];

  if (!posts.length) {
    console.error('Error: no posts found in posts.json');
    process.exit(1);
  }

  // Count emoji from the emojis arrays
  const counts = {};
  for (const post of posts) {
    for (const emoji of (post.emojis || [])) {
      counts[emoji] = (counts[emoji] || 0) + 1;
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (!sorted.length) {
    console.error('Error: no emoji found in posts');
    process.exit(1);
  }

  const lines = [
    '# Emoji Report',
    '',
    `${sorted.length} unique emoji across ${posts.length} posts`,
    '',
    '| emoji | count |',
    '|-------|-------|',
    ...sorted.map(([emoji, count]) => `| ${emoji} | ${count} |`),
    '',
  ];

  fs.writeFileSync(outputFile, lines.join('\n'), 'utf8');
  console.log(`✓ ${sorted.length} unique emoji found across ${posts.length} posts → ${outputFile}`);
  console.log(`  top 5: ${sorted.slice(0, 5).map(([e, n]) => `${e} (${n})`).join(', ')}`);
}

// ─── Run ──────────────────────────────────────────────────────────────────────
if (doExport)      runExport();
else if (doImport) runImport();
else               runReport();