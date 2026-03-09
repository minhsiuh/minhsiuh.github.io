#!/usr/bin/env node
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../research-qml.html', import.meta.url), 'utf8');
const pubs = JSON.parse(fs.readFileSync(new URL('../data/research-qml.publications.json', import.meta.url), 'utf8'));
const collab = JSON.parse(fs.readFileSync(new URL('../data/research-qml.collaborators.json', import.meta.url), 'utf8'));

const errors = [];

for (const g of pubs.groups || []) {
  for (const p of g.publications || []) {
    const labels = (p.links || []).map(l => (l.label || '').toLowerCase());
    const ai = labels.indexOf('arxiv');
    const di = labels.indexOf('doi');
    if (ai !== -1 && di !== -1 && ai > di) {
      errors.push(`Link order wrong (arXiv should be before DOI): ${p.title}`);
    }
  }
}

if (!html.includes('data/research-qml.publications.json')) errors.push('HTML not wired to qml publications JSON');
if (!html.includes('data/research-qml.collaborators.json')) errors.push('HTML not wired to qml collaborators JSON');
if (!html.includes('id="last-curated"')) errors.push('Missing Last curated label');
if (!html.includes('id="collab-map"')) errors.push('Missing collaborator map container');
if (!html.includes('id="pub-groups"')) errors.push('Missing dynamic publications container');

const allNames = new Set((collab.collaborators || []).map(n => n.trim()));
for (const inst of collab.institutions || []) {
  for (const name of inst.collaborators || []) {
    if (!allNames.has(name.trim())) {
      errors.push(`Institution collaborator missing from master list: ${name} (${inst.name})`);
    }
  }
}

if (errors.length) {
  console.error('❌ validate-qml failed');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('✅ validate-qml passed');
