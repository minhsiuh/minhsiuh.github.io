#!/usr/bin/env node
import fs from 'node:fs';

const pubsPath = new URL('../data/research-shannon.publications.json', import.meta.url);
const collabPath = new URL('../data/research-shannon.collaborators.json', import.meta.url);
const outGraphPath = new URL('../data/research-shannon.knowledge-graph.json', import.meta.url);
const outCsvPath = new URL('../data/research-shannon.collab-matrix.csv', import.meta.url);

const pubs = JSON.parse(fs.readFileSync(pubsPath, 'utf8'));
const collab = JSON.parse(fs.readFileSync(collabPath, 'utf8'));

const SELF_NAMES = new Set(['Min-Hsiu Hsieh', 'MH Hsieh']);

const normalize = (s = '') =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const splitAuthors = (s = '') => s.split(',').map(x => x.trim()).filter(Boolean);

const paperList = [];
for (const g of pubs.groups || []) {
  for (const p of g.publications || []) {
    const yearMatch = (p.venue || '').match(/(19|20)\d{2}/g);
    const year = yearMatch ? Number(yearMatch[yearMatch.length - 1]) : null;
    const doi = (p.links || []).find(l => (l.label || '').toLowerCase() === 'doi')?.url || null;
    const arxiv = (p.links || []).find(l => (l.label || '').toLowerCase() === 'arxiv')?.url || null;
    paperList.push({ group: g.group, ...p, year, doi, arxiv });
  }
}

const papers = paperList.map((p, i) => ({
  paperId: `P${String(i + 1).padStart(3, '0')}`,
  group: p.group,
  title: p.title,
  year: p.year,
  venue: p.venue,
  doi: p.doi,
  arxiv: p.arxiv
}));

const institutionIdMap = new Map();
const institutions = (collab.institutions || []).map((inst, i) => {
  const institutionId = `I${String(i + 1).padStart(3, '0')}`;
  institutionIdMap.set(inst.name, institutionId);
  return {
    institutionId,
    name: inst.name,
    country: inst.country,
    lat: inst.location?.[0] ?? null,
    lon: inst.location?.[1] ?? null
  };
});

// Build collaborator -> institutions map from collab JSON
const collabToInsts = new Map();
for (const inst of collab.institutions || []) {
  for (const name of inst.collaborators || []) {
    const key = normalize(name);
    if (!collabToInsts.has(key)) collabToInsts.set(key, []);
    collabToInsts.get(key).push(inst);
  }
}

const collaboratorSet = new Set((collab.collaborators || []).map(n => normalize(n)));
const displayNameByNorm = new Map((collab.collaborators || []).map(n => [normalize(n), n]));

const edges = [];
const collaboratorPaperMap = new Map();

for (const p of papers) {
  const sourcePaper = paperList[Number(p.paperId.slice(1)) - 1];
  const authors = splitAuthors(sourcePaper.authors || '');
  for (const a of authors) {
    if (SELF_NAMES.has(a)) continue;
    const na = normalize(a);
    if (!collaboratorSet.has(na)) {
      collaboratorSet.add(na);
      displayNameByNorm.set(na, a);
    }

    const instCandidates = collabToInsts.get(na) || [];
    const primaryInst = instCandidates[0] || null;
    const institutionId = primaryInst ? institutionIdMap.get(primaryInst.name) : null;

    edges.push({
      paperId: p.paperId,
      collaboratorName: displayNameByNorm.get(na) || a,
      institutionId,
      role: 'coauthor'
    });

    if (!collaboratorPaperMap.has(na)) collaboratorPaperMap.set(na, new Set());
    collaboratorPaperMap.get(na).add(p.paperId);
  }
}

const sortedNormNames = [...collaboratorSet].sort((a, b) => {
  const an = displayNameByNorm.get(a) || a;
  const bn = displayNameByNorm.get(b) || b;
  const al = normalize(an.split(' ').slice(-1)[0]);
  const bl = normalize(bn.split(' ').slice(-1)[0]);
  return al === bl ? an.localeCompare(bn) : al.localeCompare(bl);
});

const collaborators = sortedNormNames.map((na, i) => {
  const name = displayNameByNorm.get(na);
  const collaboratorId = `C${String(i + 1).padStart(3, '0')}`;
  const insts = (collabToInsts.get(na) || []).map((inst, idx) => ({
    institutionId: institutionIdMap.get(inst.name) || null,
    institution: inst.name,
    country: inst.country,
    startYear: null,
    endYear: null,
    isPrimary: idx === 0,
    source: 'manual'
  }));
  return {
    collaboratorId,
    name,
    affiliations: insts,
    paperIds: [...(collaboratorPaperMap.get(na) || [])].sort()
  };
});

const collaboratorIdByNameNorm = new Map(collaborators.map(c => [normalize(c.name), c.collaboratorId]));
const finalizedEdges = edges.map(e => ({
  paperId: e.paperId,
  collaboratorId: collaboratorIdByNameNorm.get(normalize(e.collaboratorName)) || null,
  institutionId: e.institutionId,
  role: e.role
}));

const graph = {
  version: '1.0',
  topic: pubs.topic || 'Quantum Shannon Theory',
  lastCurated: new Date().toISOString().slice(0, 10),
  papers,
  collaborators,
  institutions,
  edges: finalizedEdges
};

fs.writeFileSync(outGraphPath, JSON.stringify(graph, null, 2));

// Build matrix CSV: collaborator|affiliation|country|paper_id
const paperById = new Map(papers.map(p => [p.paperId, p]));
const csvRows = [['collaborator_name', 'affiliation', 'country', 'paper_id', 'paper_title', 'year', 'doi']];
for (const c of collaborators) {
  const primary = c.affiliations?.[0] || {};
  for (const pid of c.paperIds || []) {
    const p = paperById.get(pid) || {};
    csvRows.push([
      c.name || '',
      primary.institution || '',
      primary.country || '',
      pid,
      p.title || '',
      p.year ?? '',
      p.doi || ''
    ]);
  }
}

const csv = csvRows
  .map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(','))
  .join('\n');
fs.writeFileSync(outCsvPath, csv + '\n');

console.log('✅ Built knowledge graph and matrix');
console.log(`- ${new URL(outGraphPath).pathname}`);
console.log(`- ${new URL(outCsvPath).pathname}`);
console.log(`papers=${papers.length}, collaborators=${collaborators.length}, institutions=${institutions.length}, edges=${finalizedEdges.length}`);
