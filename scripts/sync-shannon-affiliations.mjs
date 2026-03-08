#!/usr/bin/env node
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const pubsPath = new URL('../data/research-shannon.publications.json', import.meta.url);
const collabPath = new URL('../data/research-shannon.collaborators.json', import.meta.url);

const overwrite = process.argv.includes('--overwrite');

const pubs = JSON.parse(fs.readFileSync(pubsPath, 'utf8'));
const collab = JSON.parse(fs.readFileSync(collabPath, 'utf8'));

const CANON = new Map([
  ['MH Hsieh', 'Min-Hsiu Hsieh'],
  ['MM Wilde', 'Mark M. Wilde'],
  ['Mark Wilde', 'Mark M. Wilde'],
  ['N Datta', 'Nilanjana Datta'],
  ['A Winter', 'Andreas Winter'],
  ['I Devetak', 'Igor Devetak'],
  ['HC Cheng', 'Hao-Chung Cheng'],
  ['EP Hanson', 'Eric P. Hanson'],
  ['S Watanabe', 'Shun Watanabe'],
  ['T Matsuura', 'Takaya Matsuura'],
  ['M Hayashi', 'Masahito Hayashi'],
  ['H Shi', 'Haowei Shi'],
  ['S Guha', 'Saikat Guha'],
  ['Z Zhang', 'Zheshen Zhang'],
  ['Q Zhuang', 'Quntao Zhuang']
]);
const normalizeName = (n) => {
  const base = (n || '').replace(/\s+/g, ' ').trim();
  return CANON.get(base) || base;
};
const normName = (n) => normalizeName(n);
const nameEq = (a, b) => normName(a).toLowerCase() === normName(b).toLowerCase();
const isSelf = (n) => nameEq(n, 'Min-Hsiu Hsieh');

function splitAuthors(s) {
  return (s || '').split(',').map(x => normalizeName(x)).filter(Boolean);
}

function extractDoiFromLinks(links = []) {
  for (const l of links) {
    const url = l?.url || '';
    const m = url.match(/10\.\d{4,9}\/[A-Za-z0-9._;()/:+-]+/i);
    if (m) return m[0].replace(/[).,]+$/, '');
  }
  return null;
}

function findInstByName(name) {
  return collab.institutions.find(i => i.name === name);
}

function ensureInstitution(instName, country, lat = null, lon = null) {
  let inst = findInstByName(instName);
  if (!inst) {
    inst = {
      name: instName,
      country: country || 'Unknown',
      location: [lat ?? 0, lon ?? 0],
      collaborators: [],
      papers: []
    };
    collab.institutions.push(inst);
  }
  return inst;
}

function hasCollaboratorAssigned(name) {
  return collab.institutions.some(i => (i.collaborators || []).some(c => nameEq(c, name)));
}

async function openalexByDoi(doi) {
  const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.json();
}

const allPubs = (pubs.groups || []).flatMap(g => g.publications || []);
const report = { scanned: 0, doiFound: 0, affiliationsAdded: 0, unresolved: [] };

for (const p of allPubs) {
  report.scanned += 1;
  const doi = extractDoiFromLinks(p.links);
  if (!doi) continue;
  report.doiFound += 1;

  const work = await openalexByDoi(doi);
  if (!work) {
    report.unresolved.push({ title: p.title, reason: `OpenAlex not found for DOI ${doi}` });
    continue;
  }

  const knownAuthors = splitAuthors(p.authors).filter(a => !isSelf(a));

  for (const auth of work.authorships || []) {
    const authorName = normalizeName(auth?.author?.display_name || '');
    if (!authorName || isSelf(authorName)) continue;

    const matchInPaper = knownAuthors.find(a => nameEq(a, authorName));
    if (!matchInPaper) continue;

    const inst = (auth.institutions || [])[0];
    if (!inst?.display_name) {
      report.unresolved.push({ title: p.title, author: authorName, reason: 'No institution in OpenAlex authorship' });
      continue;
    }

    const alreadyAssigned = hasCollaboratorAssigned(matchInPaper);
    if (alreadyAssigned && !overwrite) continue;

    if (overwrite) {
      for (const i of collab.institutions) {
        i.collaborators = (i.collaborators || []).filter(c => !nameEq(c, matchInPaper));
      }
    }

    const country = inst.country_code || 'Unknown';
    const lat = typeof inst.latitude === 'number' ? inst.latitude : 0;
    const lon = typeof inst.longitude === 'number' ? inst.longitude : 0;
    const target = ensureInstitution(inst.display_name, country, lat, lon);

    if (!(target.collaborators || []).some(c => nameEq(c, matchInPaper))) {
      target.collaborators.push(matchInPaper);
      report.affiliationsAdded += 1;
    }
    const paperTag = `${p.title} (${doi})`;
    if (!(target.papers || []).includes(paperTag)) target.papers.push(paperTag);
  }
}

// rebuild collaborators list from publications authors (excluding self)
const allNames = new Set();
for (const p of allPubs) {
  for (const a of splitAuthors(p.authors)) {
    if (!isSelf(a)) allNames.add(a);
  }
}
collab.collaborators = [...allNames].sort((a, b) => {
  const la = a.split(/\s+/).slice(-1)[0].toLowerCase();
  const lb = b.split(/\s+/).slice(-1)[0].toLowerCase();
  if (la !== lb) return la.localeCompare(lb);
  return a.localeCompare(b);
});

// remove empty institutions
collab.institutions = collab.institutions.filter(i => (i.collaborators || []).length > 0);

fs.writeFileSync(collabPath, JSON.stringify(collab, null, 2));

console.log('✅ sync-shannon-affiliations done');
console.log(JSON.stringify(report, null, 2));
if (report.unresolved.length) {
  console.log('\nNeeds review:');
  for (const u of report.unresolved.slice(0, 20)) {
    console.log('-', u.author ? `${u.author}: ` : '', u.reason, '|', u.title);
  }
}
