#!/usr/bin/env node
// generate-feed.js — run locally: node generate-feed.js
// Reads posts.json + config.json → writes feed.xml

const fs = require('fs');
const path = require('path');
const { marked } = require('./js/marked.umd.js');

marked.setOptions({ breaks: true, gfm: true });

const posts  = JSON.parse(fs.readFileSync('posts.json',  'utf8')).posts || [];
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const siteUrl   = (config.siteUrl || 'https://yourusername.github.io/yourrepo').replace(/\/$/, '');
const title     = config.title    || 'Microcosm';
const author    = config.author   || '';
const feedLimit = config.feedLimit || null; // null = no limit

// ─── Permalink slug (mirrors generate-archives.js) ────────────────────────────
function postSlug(isoDate) {
  const d   = new Date(isoDate);
  const day = d.getUTCDate();
  const h   = String(d.getUTCHours()).padStart(2, '0');
  const m   = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}T${h}${m}`;
}

function archiveUrl(isoDate) {
  const d = new Date(isoDate);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}/${m}.html`;
}

function postPermalink(post) {
  return `${siteUrl}/${archiveUrl(post.date)}#${postSlug(post.date)}`;
}

// ─── Post title: emoji + [tag] [tag] ─────────────────────────────────────────
function postTitle(post) {
  const emojiStr = (post.emojis || []).join('');
  const tagStr   = (post.tags   || []).map(t => `[${t}]`).join(' ');
  const parts    = [emojiStr, tagStr].filter(Boolean);
  return parts.length ? parts.join(' ') : title;
}

function escapeXml(str) {
  return (str || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

const sorted  = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
const limited = feedLimit ? sorted.slice(0, feedLimit) : sorted;

const items = limited.map(p => {
  const body      = marked.parse(p.body || '');
  const img       = p.image ? `<img src="${p.image}" alt="${escapeXml(p.imageCaption||'')}" />` : '';
  const permalink = postPermalink(p);
  const itemTitle = escapeXml(postTitle(p));
  return `
  <item>
    <title>${itemTitle}</title>
    <guid isPermaLink="true">${permalink}</guid>
    <link>${permalink}</link>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <description><![CDATA[${body}${p.image ? '\n\n' + img : ''}]]></description>
  </item>`;
}).join('');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${siteUrl}</link>
    <description>${escapeXml(config.tagline || '')}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${author ? `<managingEditor>${escapeXml(author)}</managingEditor>` : ''}
    ${items}
  </channel>
</rss>`;

fs.writeFileSync('feed.xml', xml, 'utf8');
console.log(`✓ feed.xml generated with ${limited.length} posts${feedLimit ? ` (limit: ${feedLimit})` : ''}`);