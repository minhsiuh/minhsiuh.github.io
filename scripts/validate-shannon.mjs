#!/usr/bin/env node
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('../research-shannon.html', import.meta.url), 'utf8');
const pubs = JSON.parse(fs.readFileSync(new URL('../data/research-shannon.publications.json', import.meta.url), 'utf8'));
const collab = JSON.parse(fs.readFileSync(new URL('../data/research-shannon.collaborators.json', import.meta.url), 'utf8'));

let errors = [];
let warnings = [];

// 1) link order in page: arXiv before DOI
const liBlocks = [...html.matchAll(/<li>[\s\S]*?<\/li>/g)].map(m => m[0]);
for (const li of liBlocks) {
  if (!li.includes('arXiv') || !li.includes('DOI')) continue;
  if (li.indexOf('arXiv') > li.indexOf('DOI')) {
    errors.push('Found a publication where DOI appears before arXiv.');
    break;
  }
}

// 2) duplicate DOI links within same list item
for (const li of liBlocks) {
  const dois = [...li.matchAll(/href="([^"]*(?:doi\.org|dx\.doi\.org|journals\.aps\.org|link\.springer\.com\/article)[^"]*)"/gi)].map(m => m[1]);
  const norm = dois.map(d => {
    const m = d.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:-]+/);
    return m ? m[0].replace(/[).,]+$/, '') : d;
  });
  if (new Set(norm).size !== norm.length) {
    errors.push('Found duplicate DOI links in one publication item.');
    break;
  }
}

// 3) JSON sanity: every publication has at least one link
for (const g of pubs.groups) {
  for (const p of g.publications) {
    if (!p.links?.length) warnings.push(`No links: ${p.title}`);
  }
}

// 4) Stats consistency checks from JSON
const totalPubs = pubs.groups.reduce((n, g) => n + g.publications.length, 0);
const collabCount = collab.collaborators.length;

if (!html.includes(`Papers in This Topic</div></div>`)) {
  warnings.push('Could not locate publications stats block in HTML.');
}

const pubStat = html.match(/<div class="topic-stat-number">(\d+)<\/div><div class="topic-stat-label">Papers in This Topic<\/div>/);
if (pubStat && Number(pubStat[1]) !== totalPubs) {
  warnings.push(`Papers stat mismatch: html=${pubStat[1]} json=${totalPubs}`);
}

const collabStat = html.match(/<div class="collab-stat-number">(\d+)<\/div>\s*\n\s*<div class="collab-stat-label">Named Collaborators<\/div>/);
if (collabStat && Number(collabStat[1]) !== collabCount) {
  warnings.push(`Collaborator stat mismatch: html=${collabStat[1]} json=${collabCount}`);
}

if (errors.length) {
  console.error('❌ validate-shannon failed');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('✅ validate-shannon passed');
if (warnings.length) {
  console.log('⚠ warnings:');
  warnings.forEach(w => console.log(' -', w));
}
