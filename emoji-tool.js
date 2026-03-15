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
    'Usage: node emoji-tool.js <--export|--import> [options]',
    '',
    'Commands:',
    '  --export   Convert emoji_data.json → emoji_data.md',
    '  --import   Convert emoji_data.md  → emoji_data.json',
    '',
    'Options:',
    '  --input <path>   Input file (default: emoji_data.json or emoji_data.md)',
    '  --output <path>  Output file (default: emoji_data.md or emoji_data.json)',
  ].join('\n'));
  process.exit(0);
}

const doExport = args.includes('--export');
const doImport = args.includes('--import');

if (doExport && doImport) {
  console.error('Error: specify either --export or --import, not both');
  process.exit(1);
}
if (!doExport && !doImport) {
  console.error('Error: specify --export or --import');
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
  // - Simple emoji with optional VS16 (U+FE0F)
  // - Emoji + skin tone modifier (U+1F3FB–1F3FF) 
  // - ZWJ sequences (e.g. 🦸🏻‍♂️ = base + skintone + ZWJ + gender + VS16)
  // - Keycap sequences (digit + U+FE0F + U+20E3)
  const emojiRe = /\p{Emoji}(?:\uFE0F|\u20E3|\p{EMod})?(?:\u200D\p{Emoji}(?:\uFE0F|\u20E3|\p{EMod})?)*\uFE0F?/gu;

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

// ─── Run ──────────────────────────────────────────────────────────────────────
if (doExport) runExport();
else          runImport();
