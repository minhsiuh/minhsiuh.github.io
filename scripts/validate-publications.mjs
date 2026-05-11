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

function extractArxivId(url = '') {
  const m = String(url).match(/arxiv\.org\/abs\/([^#?]+)/i);
  return m ? m[1].replace(/\.$/, '') : '';
}

function extractDoiValue(url = '') {
  const m = String(url).match(/(?:dx\.)?doi\.org\/([^#?]+)/i);
  return m ? m[1].replace(/\.$/, '') : '';
}

function normalizeDoi(value = '') {
  return String(value).replace(/^https:\/\/(?:dx\.)?doi\.org\//i, '').replace(/\.$/, '').toLowerCase();
}

function structuredFields(item = {}) {
  return item.article || item.inproceedings || item.book || null;
}

function extractYear(html) {
  const m = html.match(/(19|20)\d{2}/g);
  if (!m || !m.length) return null;
  return Number(m[m.length - 1]);
}

async function urlStatus(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.ok) return { ok: true, status: res.status };
  } catch {
    // Some publishers do not allow HEAD; retry with GET below.
  }

  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return { ok: res.ok, status: res.status };
  } catch {
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual' });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return { ok: false, status: 'ERR', error: String(err) };
    }
  }
}

const errors = [];
const warnings = [];
let total = 0;
const allowedDuplicateArxiv = new Set([
  // One arXiv preprint covers multiple conference proceedings entries.
  'https://arxiv.org/abs/1701.03195',
  'https://arxiv.org/abs/1404.5012'
]);

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
    const structured = structuredFields(item);

    if (!year) warnings.push(`${section}:${item.id} missing year`);

    if (doi) {
      if (doiSeen.has(doi)) errors.push(`${section}:${item.id} duplicate DOI in same section`);
      doiSeen.add(doi);
    } else if (section === 'journals' || section === 'conferences') {
      warnings.push(`${section}:${item.id} missing DOI`);
    }

    if (arxiv) {
      if (arxivSeen.has(arxiv) && !allowedDuplicateArxiv.has(arxiv)) {
        errors.push(`${section}:${item.id} duplicate arXiv in same section`);
      }
      arxivSeen.add(arxiv);
    }

    if (structured) {
      const htmlArxiv = extractArxivId(arxiv || '');
      const htmlDoi = normalizeDoi(doi || '');
      const structuredArxiv = String(structured.arxiv || '').replace(/\.$/, '');
      const structuredDoi = normalizeDoi(structured.doi || '');
      const urlArxiv = extractArxivId(structured.url || '');
      const urlDoi = normalizeDoi(extractDoiValue(structured.url || ''));

      if (htmlArxiv && !structuredArxiv) {
        errors.push(`${section}:${item.id} contentHtml arXiv missing from structured fields`);
      } else if (htmlArxiv && structuredArxiv && htmlArxiv !== structuredArxiv) {
        errors.push(`${section}:${item.id} contentHtml arXiv ${htmlArxiv} != structured arXiv ${structuredArxiv}`);
      }

      if (htmlDoi && !structuredDoi) {
        errors.push(`${section}:${item.id} contentHtml DOI missing from structured fields`);
      } else if (htmlDoi && structuredDoi && htmlDoi !== structuredDoi) {
        errors.push(`${section}:${item.id} contentHtml DOI ${htmlDoi} != structured DOI ${structuredDoi}`);
      }

      if (urlArxiv && structuredArxiv && urlArxiv !== structuredArxiv) {
        errors.push(`${section}:${item.id} structured url arXiv ${urlArxiv} != structured arXiv ${structuredArxiv}`);
      }

      if (urlDoi && structuredDoi && urlDoi !== structuredDoi) {
        errors.push(`${section}:${item.id} structured url DOI ${urlDoi} != structured DOI ${structuredDoi}`);
      }
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
