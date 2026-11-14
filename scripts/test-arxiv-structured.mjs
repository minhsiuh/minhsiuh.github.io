#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const current = JSON.parse(fs.readFileSync(new URL('../data/publications.arxiv.json', import.meta.url), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(new URL('../backups/publications.arxiv.2026-10-12.json', import.meta.url), 'utf8'));
const page = fs.readFileSync(new URL('../publications.html', import.meta.url), 'utf8');
assert.ok(current.items.length >= baseline.items.length, 'baseline records were removed');
assert.deepEqual(
  current.items.filter(x => baseline.items.some(b => b.id === x.id)).map(x => x.id),
  baseline.items.map(x => x.id),
  'baseline stable ID/order changed'
);
assert.equal(new Set(current.items.map(x => x.id)).size, current.items.length, 'duplicate IDs');

function original(item) {
  const raw = item.contentHtml;
  const text = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const mark = text.match(/\[\s*arXiv\s*:\s*([^\]\s]+)\s*\]/i);
  assert.ok(mark, `${item.id} missing source ID`);
  const prefix = text.slice(0, text.indexOf(mark[0])).trim().replace(/\.$/, '');
  const boundaries = [...prefix.matchAll(/\. (?=[A-Z])/g)];
  assert.ok(boundaries.length, `${item.id} title/author boundary missing`);
  const b = boundaries.at(-1).index;
  const ym = text.match(/\(((?:19|20)\d{2})\)/);
  const href = raw.match(/href="([^"]*arxiv\.org\/abs\/[^\"]+)"/i)?.[1];
  return {
    title: prefix.slice(b + 2).replace(/\.$/, ''),
    authors: prefix.slice(0, b).replace(/\s+,/g, ',').split(',').map(x => x.trim()),
    year: ym ? Number(ym[1]) : null,
    id: mark[1], href
  };
}

for (const old of baseline.items) {
  const item = current.items.find(x => x.id === old.id);
  assert.ok(item, `baseline item ${old.id} missing`);
  const a = item.arxiv;
  const before = original(old);
  assert.ok(a && !('contentHtml' in item), `${item.id} not fully structured`);
  assert.equal(a.title, before.title, `${item.id} title changed`);
  assert.deepEqual(a.authors, before.authors, `${item.id} author order/content changed`);
  assert.equal(a.year, before.year, `${item.id} year changed`);
  assert.equal(a.url, `https://arxiv.org/abs/${a.id}`, `${item.id} URL/ID mismatch`);
  assert.equal(a.version ? a.id.endsWith(a.version) : !/v\d+$/.test(a.id), true, `${item.id} version mismatch`);
  if (item.id !== 'arxiv-26') assert.equal(a.url, before.href, `${item.id} URL changed`);
}
const added = current.items.filter(x => !baseline.items.some(b => b.id === x.id));
for (const item of added) {
  const a = item.arxiv;
  assert.ok(a && !('contentHtml' in item), `${item.id} not fully structured`);
  assert.equal(a.url, `https://arxiv.org/abs/${a.id}`, `${item.id} URL/ID mismatch`);
  assert.equal(a.version ? a.id.endsWith(a.version) : !/v\\d+$/.test(a.id), true, `${item.id} version mismatch`);
}
const corrected = current.items.find(x => x.id === 'arxiv-26').arxiv;
assert.equal(corrected.id, '2112.15002', 'known wrong link must point to the official matching record');
assert.match(page, /const a = item\.arxiv \|\| \{\}/, 'renderer does not read structured arXiv fields');
const cardBranch = page.split("if (mode === 'card')")[1]?.split("} else if (mode === 'journal-card')")[0] || '';
assert.ok(cardBranch && !cardBranch.includes('parseItem(') && !cardBranch.includes('contentHtml'), 'arXiv renderer still parses contentHtml');

function extractFunction(name) {
  const start = page.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found in publications renderer`);
  const end = page.indexOf('\n            }\n\n            function', start);
  assert.notEqual(end, -1, `${name} function boundary not found`);
  return page.slice(start, end + '\n            }'.length);
}

const escapeBib = value => String(value ?? '').replace(/[\\{}]/g, '\\$&');
const realExtractArxivId = href => String(href || '').match(/arxiv\.org\/abs\/([^/?#]+)/i)?.[1] || '';
const buildBibtex = new Function('bibEscape', 'extractArxivId', `return (${extractFunction('buildBibtex')});`)(escapeBib, realExtractArxivId);
const callStart = cardBranch.indexOf("buildBibtex('arxiv',");
assert.notEqual(callStart, -1, 'renderer does not call the arXiv BibTeX builder');
let callEnd = callStart, depth = 0, quote = null, escaped = false;
for (; callEnd < cardBranch.length; callEnd++) {
  const ch = cardBranch[callEnd];
  if (quote) {
    if (escaped) escaped = false;
    else if (ch === '\\') escaped = true;
    else if (ch === quote) quote = null;
    continue;
  }
  if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
  if (ch === '(') depth++;
  if (ch === ')' && --depth === 0) { callEnd++; break; }
}
assert.equal(depth, 0, 'could not isolate actual renderer call');
const rendererCall = cardBranch.slice(callStart, callEnd);
const renderBibtex = new Function('buildBibtex', 'item', 'a', 'titleText', 'authorText', `return ${rendererCall};`);
const versionedItem = current.items.find(x => x.arxiv.version);
const versioned = versionedItem.arxiv;
const output = renderBibtex(buildBibtex, versionedItem, versioned, versioned.title, versioned.authors.join(', '));
for (const expected of [
  `@misc{${versionedItem.id}Arxiv,`,
  `author = {${versioned.authors.join(' and ')}}`,
  `title = {${versioned.title}}`,
  `year = {${versioned.year}}`,
  `eprint = {${versioned.id}}`,
  'archivePrefix = {arXiv}',
  `note = {${versioned.version}}`,
  `url = {${versioned.url}}`
]) assert.ok(output.includes(expected), `renderer BibTeX missing: ${expected}`);
const nonVersionedItem = current.items.find(x => !x.arxiv.version);
const nonVersioned = nonVersionedItem.arxiv;
const outputWithoutVersion = renderBibtex(buildBibtex, nonVersionedItem, nonVersioned, nonVersioned.title, nonVersioned.authors.join(', '));
assert.ok(!outputWithoutVersion.includes('note = {'), 'BibTeX must not invent a version note');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arxiv-validator-duplicate-'));
try {
  fs.mkdirSync(path.join(temp, 'scripts'));
  fs.mkdirSync(path.join(temp, 'data'));
  fs.copyFileSync(new URL('./validate-publications.mjs', import.meta.url), path.join(temp, 'scripts/validate-publications.mjs'));
  for (const section of ['arxiv', 'books', 'journals', 'conferences', 'talks']) {
    const items = section === 'arxiv' ? [1, 2].map(n => ({
      id: `unique-item-${n}`,
      arxiv: { title: `Test ${n}`, authors: [`Author ${n}`], year: 2024, id: '9999.00001', url: 'https://arxiv.org/abs/9999.00001' }
    })) : [];
    fs.writeFileSync(path.join(temp, `data/publications.${section}.json`), JSON.stringify({ section, items }));
  }
  const result = spawnSync(process.execPath, [path.join(temp, 'scripts/validate-publications.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 1, 'validator must reject duplicate structured arXiv IDs');
  assert.match(result.stderr, /duplicate arXiv ID in same section \(9999\.00001\)/);
  assert.doesNotMatch(result.stderr, /duplicate id$/, 'fixture outer item IDs must remain unique');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

console.log(`Structured arXiv regression passed: ${current.items.length} records; actual renderer BibTeX call includes author/title/year/eprint/archivePrefix/version/url; validator rejects duplicate structured arXiv IDs`);
