#!/usr/bin/env node
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../research-simulation.html', import.meta.url), 'utf8');
const pubs = JSON.parse(fs.readFileSync(new URL('../data/research-simulation.publications.json', import.meta.url), 'utf8'));
const collab = JSON.parse(fs.readFileSync(new URL('../data/research-simulation.collaborators.json', import.meta.url), 'utf8'));
const aliases = JSON.parse(fs.readFileSync(new URL('../data/research-simulation.name-aliases.json', import.meta.url), 'utf8'));

const errors = [];

const venueAbbrevRules = [
  { pattern: /\bPhys\.\s*Rev\.\s*A\b/i, expected: 'Physical Review A' },
  { pattern: /\bPhys\.\s*Rev\.\s*Lett\.\b/i, expected: 'Physical Review Letters' },
  { pattern: /\bJ\.\s*Chem\.\s*Inf\.\s*Model\.\b/i, expected: 'Journal of Chemical Information and Modeling' }
];

for (const g of pubs.groups || []) {
  for (const p of g.publications || []) {
    const labels = (p.links || []).map(l => (l.label || '').toLowerCase());
    const ai = labels.indexOf('arxiv');
    const di = labels.indexOf('doi');
    if (ai !== -1 && di !== -1 && ai > di) {
      errors.push(`Link order wrong (arXiv should be before DOI): ${p.title}`);
    }

    // enforce alias normalization for known names
    const authorStr = p.authors || '';
    for (const shortName of Object.keys(aliases)) {
      if (authorStr.includes(shortName)) {
        errors.push(`Author alias not normalized (${shortName}) in: ${p.title}`);
      }
    }

    // enforce full journal names (no short abbreviation forms)
    const venue = p.venue || '';
    for (const rule of venueAbbrevRules) {
      if (rule.pattern.test(venue)) {
        errors.push(`Venue abbreviation detected in \"${p.title}\". Use full name: ${rule.expected}`);
      }
    }
  }
}

if (!html.includes('data/research-simulation.publications.json')) errors.push('HTML not wired to simulation publications JSON');
if (!html.includes('data/research-simulation.collaborators.json')) errors.push('HTML not wired to simulation collaborators JSON');
if (!html.includes('id="last-curated"')) errors.push('Missing Last curated label');
if (!html.includes('id="collab-map"')) errors.push('Missing collaborator map container');

const allNames = new Set((collab.collaborators || []).map(n => n.trim()));
for (const inst of collab.institutions || []) {
  for (const name of inst.collaborators || []) {
    if (!allNames.has(name.trim())) {
      errors.push(`Institution collaborator missing from master list: ${name} (${inst.name})`);
    }
  }
}

if (errors.length) {
  console.error('❌ validate-simulation failed');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('✅ validate-simulation passed');
