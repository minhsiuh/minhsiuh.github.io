#!/usr/bin/env node
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../research-rb.html', import.meta.url), 'utf8');
const pubs = JSON.parse(fs.readFileSync(new URL('../data/research-rb.publications.json', import.meta.url), 'utf8'));
const collab = JSON.parse(fs.readFileSync(new URL('../data/research-rb.collaborators.json', import.meta.url), 'utf8'));

const errors = [];

for (const g of pubs.groups || []) {
  for (const p of g.publications || []) {
    const labels = (p.links || []).map(l => (l.label || '').toLowerCase());
    const ai = labels.indexOf('arxiv');
    const di = labels.indexOf('doi');
    if (ai !== -1 && di !== -1 && ai > di) {
      errors.push(`Link order wrong (arXiv should be before DOI): ${p.title}`);
    }

    const authorParts = String(p.authors || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s.toLowerCase() !== 'et al.');
    for (const a of authorParts) {
      if (/^[A-Z]{1,3}\s+[A-Z][a-zA-Z\-'.]+$/.test(a)) {
        errors.push(`Author not in full-name format (${a}) in: ${p.title}`);
      }
    }
  }
}

if (!html.includes('data/research-rb.publications.json')) errors.push('HTML not wired to rb publications JSON');
if (!html.includes('data/research-rb.collaborators.json')) errors.push('HTML not wired to rb collaborators JSON');
if (!html.includes('id="last-curated"')) errors.push('Missing Last curated label');
if (!html.includes('id="collab-map"')) errors.push('Missing collaborator map container');
if (!html.includes('id="pub-groups"')) errors.push('Missing dynamic publications container');
if (!html.includes('id="complete-collaborators-list"')) errors.push('Missing complete collaborators list container');

const requiredSections = ['id="overview"', 'id="collaborators"', 'id="publications"', 'id="related"'];
for (const sec of requiredSections) {
  if (!html.includes(sec)) errors.push(`Missing required section: ${sec}`);
}
const posOverview = html.indexOf('id="overview"');
const posCollaborators = html.indexOf('id="collaborators"');
const posPublications = html.indexOf('id="publications"');
const posRelated = html.indexOf('id="related"');
if (!(posOverview < posCollaborators && posCollaborators < posPublications && posPublications < posRelated)) {
  errors.push('Section order must be overview -> collaborators -> publications -> related');
}
if (!html.includes('<li><a href="#collaborators">Collaborators</a></li>')) {
  errors.push('Side-nav missing Collaborators anchor');
}

const allNames = new Set((collab.collaborators || []).map(n => n.trim()));
if (!collab.collaborators?.length) errors.push('Collaborators list is empty');
if (!collab.institutions?.length) errors.push('Institutions list is empty (map cannot render markers)');

for (const inst of collab.institutions || []) {
  if (!inst.country) errors.push(`Institution missing country: ${inst.name}`);
  if (!Array.isArray(inst.location) || inst.location.length !== 2 || !inst.location.every(Number.isFinite)) {
    errors.push(`Institution missing/invalid location: ${inst.name}`);
  }
  for (const name of inst.collaborators || []) {
    if (!allNames.has(name.trim())) {
      errors.push(`Institution collaborator missing from master list: ${name} (${inst.name})`);
    }
  }
}

if (errors.length) {
  console.error('❌ validate-rb failed');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('✅ validate-rb passed');
