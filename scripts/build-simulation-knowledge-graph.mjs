#!/usr/bin/env node
import fs from 'node:fs';

const pubsPath = new URL('../data/research-simulation.publications.json', import.meta.url);
const collabPath = new URL('../data/research-simulation.collaborators.json', import.meta.url);
const aliasPath = new URL('../data/research-simulation.name-aliases.json', import.meta.url);
const outGraphPath = new URL('../data/research-simulation.knowledge-graph.json', import.meta.url);
const outCsvPath = new URL('../data/research-simulation.collab-matrix.csv', import.meta.url);

const pubs = JSON.parse(fs.readFileSync(pubsPath, 'utf8'));
const collab = JSON.parse(fs.readFileSync(collabPath, 'utf8'));
const aliases = JSON.parse(fs.readFileSync(aliasPath, 'utf8'));

const SELF_NAME = 'Min-Hsiu Hsieh';

const norm = (s = '') =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const canonicalName = (name = '') => aliases[name] || name;
const splitAuthors = (s = '') => s.split(',').map(x => canonicalName(x.trim())).filter(Boolean);

// Build normalized paper list
const paperList = [];
for (const g of pubs.groups || []) {
  for (const p of g.publications || []) {
    const links = (p.links || []).sort((a, b) => {
      const la = (a.label || '').toLowerCase();
      const lb = (b.label || '').toLowerCase();
      const pa = la === 'arxiv' ? 0 : la === 'doi' ? 1 : 2;
      const pb = lb === 'arxiv' ? 0 : lb === 'doi' ? 1 : 2;
      return pa - pb;
    });
    const yearMatch = (p.venue || '').match(/(19|20)\d{2}/g);
    const year = yearMatch ? Number(yearMatch[yearMatch.length - 1]) : null;
    const citeMatch = (p.venue || '').match(/·\s*(\d+)\s+citations/i);
    const citations = citeMatch ? Number(citeMatch[1]) : null;
    const doi = links.find(l => (l.label || '').toLowerCase() === 'doi')?.url || null;
    const arxiv = links.find(l => (l.label || '').toLowerCase() === 'arxiv')?.url || null;

    paperList.push({
      group: g.group,
      title: p.title,
      authors: splitAuthors(p.authors),
      venue: p.venue,
      links,
      year,
      citations,
      doi,
      arxiv
    });
  }
}

// Sync collaborators master list from publications
const collabSet = new Set();
for (const p of paperList) {
  for (const a of p.authors) {
    if (a !== SELF_NAME) collabSet.add(a);
  }
}
collab.collaborators = [...collabSet].sort((a, b) => {
  const al = a.split(/\s+/).slice(-1)[0].toLowerCase();
  const bl = b.split(/\s+/).slice(-1)[0].toLowerCase();
  return al === bl ? a.localeCompare(b) : al.localeCompare(bl);
});

// Canonicalize institution collaborator names, remove stale names not in master
const masterNorm = new Set(collab.collaborators.map(norm));
for (const inst of collab.institutions || []) {
  const seen = new Set();
  const normalized = [];
  for (const n of inst.collaborators || []) {
    const c = canonicalName(n);
    const nn = norm(c);
    if (!masterNorm.has(nn)) continue;
    if (seen.has(nn)) continue;
    seen.add(nn);
    normalized.push(c);
  }
  inst.collaborators = normalized;
}

// Build institution and collaborator indexes
const institutionIdMap = new Map();
const institutions = (collab.institutions || []).map((i, idx) => {
  const institutionId = `I${String(idx + 1).padStart(3, '0')}`;
  institutionIdMap.set(i.name, institutionId);
  return {
    institutionId,
    name: i.name,
    country: i.country,
    lat: Array.isArray(i.location) ? i.location[0] ?? null : null,
    lon: Array.isArray(i.location) ? i.location[1] ?? null : null
  };
});

const collabToInstitutions = new Map();
for (const i of collab.institutions || []) {
  for (const c of i.collaborators || []) {
    const key = norm(c);
    if (!collabToInstitutions.has(key)) collabToInstitutions.set(key, []);
    collabToInstitutions.get(key).push(i);
  }
}

const papers = paperList.map((p, i) => ({
  paperId: `P${String(i + 1).padStart(3, '0')}`,
  group: p.group,
  title: p.title,
  year: p.year,
  citations: p.citations,
  venue: p.venue,
  doi: p.doi,
  arxiv: p.arxiv
}));

const paperById = new Map(papers.map((p, i) => [p.paperId, paperList[i]]));

const collaborators = collab.collaborators.map((name, idx) => {
  const key = norm(name);
  const insts = collabToInstitutions.get(key) || [];
  return {
    collaboratorId: `C${String(idx + 1).padStart(3, '0')}`,
    name,
    affiliations: insts.map((i, iidx) => ({
      institutionId: institutionIdMap.get(i.name) || null,
      institution: i.name,
      country: i.country,
      startYear: null,
      endYear: null,
      isPrimary: iidx === 0,
      source: 'manual'
    })),
    paperIds: []
  };
});

const collabIdByNorm = new Map(collaborators.map(c => [norm(c.name), c.collaboratorId]));
const collabObjByNorm = new Map(collaborators.map(c => [norm(c.name), c]));

const edges = [];
for (const p of papers) {
  const src = paperById.get(p.paperId);
  for (const a of src.authors) {
    if (a === SELF_NAME) continue;
    const an = norm(a);
    const cid = collabIdByNorm.get(an) || null;
    const inst = (collabToInstitutions.get(an) || [])[0];
    const iid = inst ? institutionIdMap.get(inst.name) : null;
    edges.push({
      paperId: p.paperId,
      collaboratorId: cid,
      institutionId: iid,
      role: 'coauthor'
    });
    if (cid) {
      const c = collabObjByNorm.get(an);
      if (c && !c.paperIds.includes(p.paperId)) c.paperIds.push(p.paperId);
    }
  }
}
for (const c of collaborators) c.paperIds.sort();

const graph = {
  version: '1.0',
  topic: pubs.topic || 'Quantum Simulation',
  lastCurated: new Date().toISOString().slice(0, 10),
  papers,
  collaborators,
  institutions,
  edges
};

fs.writeFileSync(collabPath, JSON.stringify(collab, null, 2));
fs.writeFileSync(outGraphPath, JSON.stringify(graph, null, 2));

// CSV matrix
const rows = [['collaborator_name', 'affiliation', 'country', 'paper_id', 'paper_title', 'year', 'citations', 'doi']];
for (const c of collaborators) {
  const primary = c.affiliations?.[0] || {};
  for (const pid of c.paperIds || []) {
    const p = papers.find(x => x.paperId === pid) || {};
    rows.push([
      c.name || '',
      primary.institution || '',
      primary.country || '',
      pid,
      p.title || '',
      p.year ?? '',
      p.citations ?? '',
      p.doi || ''
    ]);
  }
}
const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n') + '\n';
fs.writeFileSync(outCsvPath, csv);

console.log('✅ Built simulation knowledge graph + matrix + collaborator sync');
console.log(`papers=${papers.length}, collaborators=${collaborators.length}, institutions=${institutions.length}, edges=${edges.length}`);
