#!/usr/bin/env node
import fs from 'node:fs/promises';

const dataPath = new URL('../data/publications.arxiv.json', import.meta.url);

function extractLinks(html) {
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const arxiv = links.find((u) => u.includes('arxiv.org/abs/')) ?? null;
  const doi = links.find((u) => u.includes('doi.org/')) ?? null;
  return { arxiv, doi, links };
}

function extractYear(html) {
  const years = [...html.matchAll(/\((19|20)\d{2}\)/g)].map((m) => Number(m[0].slice(1, -1)));
  return years.length ? years[years.length - 1] : null;
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

const raw = await fs.readFile(dataPath, 'utf8');
const data = JSON.parse(raw);
const items = Array.isArray(data.items) ? data.items : [];

const issues = [];
const doiSeen = new Map();
const arxivSeen = new Map();
const badLinks = [];

for (const item of items) {
  const html = item.contentHtml || '';
  const { arxiv, doi, links } = extractLinks(html);
  const year = extractYear(html);

  if (!year) issues.push(`${item.id}: missing year`);
  if (!arxiv) issues.push(`${item.id}: missing arXiv link`);

  if (doi) {
    if (doiSeen.has(doi)) issues.push(`${item.id}: duplicate DOI with ${doiSeen.get(doi)}`);
    else doiSeen.set(doi, item.id);
  }
  if (arxiv) {
    if (arxivSeen.has(arxiv)) issues.push(`${item.id}: duplicate arXiv with ${arxivSeen.get(arxiv)}`);
    else arxivSeen.set(arxiv, item.id);
  }

  for (const url of links) {
    const status = await urlStatus(url);
    if (!status.ok) badLinks.push({ id: item.id, url, status });
  }
}

if (badLinks.length) {
  for (const b of badLinks) {
    issues.push(`${b.id}: broken link ${b.url} (${b.status.status})`);
  }
}

if (issues.length) {
  console.error('Validation failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log(`Validation OK (${items.length} arXiv entries checked)`);
