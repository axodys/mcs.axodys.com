#!/usr/bin/env node
// generate-feed.js — run locally: node generate-feed.js
// Reads posts.json + config.json → writes feed.xml

const fs = require('fs');
const path = require('path');

const posts = JSON.parse(fs.readFileSync('posts.json', 'utf8')).posts || [];
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

const siteUrl = config.siteUrl || 'https://yourusername.github.io/yourrepo';
const title = config.title || 'Microcosm';
const author = config.author || '';

const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));

const items = sorted.map(p => {
  const body = (p.body || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const img = p.image ? `<img src="${p.image}" alt="${p.imageCaption||''}" />` : '';
  return `
  <item>
    <guid>${siteUrl}/index.html#${p.id}</guid>
    <link>${siteUrl}/index.html#${p.id}</link>
    <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    <description><![CDATA[${p.body}${p.image ? '\n\n' + img : ''}]]></description>
  </item>`;
}).join('');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${title}</title>
    <link>${siteUrl}</link>
    <description>${config.tagline || ''}</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${author ? `<managingEditor>${author}</managingEditor>` : ''}
    ${items}
  </channel>
</rss>`;

fs.writeFileSync('feed.xml', xml, 'utf8');
console.log('✓ feed.xml generated with', sorted.length, 'posts');
