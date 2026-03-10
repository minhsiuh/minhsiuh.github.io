#!/usr/bin/env node
import fs from 'node:fs/promises';

const checkLinks = process.argv.includes('--check-links');
const files = [
  'publications.arxiv.json',
  'publications.books.json',
  'publications.journals.json',
  'publications.conferences.json',
  'publications.talks.json'
];

function extractLinks(html) {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const arxiv = links.find((u) => u.includes('arxiv.org/abs/')) ?? null;
  const doi = links.find((u) => u.includes('doi.org/')) ?? null;
  return { arxiv, doi, links };
}

function extractYear(html) {
  const m = html.match(/(19|20)\d{2}/g);
  if (!m || !m.length) return null;
  return Number(m[m.length - 1]);
}

async function urlStatus(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { ok: res.ok, status: res.status };
  } catch {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow' });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return { ok: false, status: 'ERR', error: String(err) };
    }
  }
}

const errors = [];
const warnings = [];
let total = 0;

for (const file of files) {
  const full = new URL(`../data/${file}`, import.meta.url);
  const raw = await fs.readFile(full, 'utf8');
  const data = JSON.parse(raw);
  const section = data.section || file;
  const items = Array.isArray(data.items) ? data.items : [];
  total += items.length;

  const idSeen = new Set();
  const doiSeen = new Set();
  const arxivSeen = new Set();

  for (const item of items) {
    if (!item?.id) {
      errors.push(`${section}: item missing id`);
      continue;
    }
    if (idSeen.has(item.id)) errors.push(`${section}:${item.id} duplicate id`);
    idSeen.add(item.id);

    const html = item.contentHtml || '';
    const { arxiv, doi, links } = extractLinks(html);
    const year = extractYear(html);

    if (!year) warnings.push(`${section}:${item.id} missing year`);

    if (doi) {
      if (doiSeen.has(doi)) errors.push(`${section}:${item.id} duplicate DOI in same section`);
      doiSeen.add(doi);
    } else if (section === 'journals' || section === 'conferences') {
      warnings.push(`${section}:${item.id} missing DOI`);
    }

    if (arxiv) {
      if (arxivSeen.has(arxiv)) errors.push(`${section}:${item.id} duplicate arXiv in same section`);
      arxivSeen.add(arxiv);
    }

    if (checkLinks) {
      for (const url of links) {
        const status = await urlStatus(url);
        if (!status.ok) errors.push(`${section}:${item.id} broken link ${url} (${status.status})`);
      }
    }
  }
}

if (warnings.length) {
  console.warn('Validation warnings:');
  for (const w of warnings.slice(0, 50)) console.warn(`- ${w}`);
  if (warnings.length > 50) console.warn(`- ... ${warnings.length - 50} more warnings`);
}

if (errors.length) {
  console.error('Validation failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

console.log(`Validation OK (${total} entries checked${checkLinks ? ', with link check' : ''})`);
