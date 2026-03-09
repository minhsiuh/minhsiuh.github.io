# AFFILIATION_PIPELINE.md

Purpose: robust author→affiliation resolution for research pages (Shannon/Simulation).

## Resolution Priority (highest first)
1. **User-provided mapping** (authoritative override)
2. **Manual overrides JSON** (`data/*.affiliation-overrides.json`)
3. **DOI metadata** (OpenAlex/Crossref)
4. **arXiv author page / paper metadata**
5. **Scholar org hints / public profile hints**

If conflicts exist: keep highest-priority source and log conflict.

## Required Output Fields
For each author-affiliation assignment, store:
- `author`
- `institution`
- `country`
- `source` (`user|override|openalex|crossref|arxiv|scholar|inferred`)
- `confidence` (`high|medium|low`)
- `evidence` (URL or note)
- `updatedAt`

## Canonicalization Rules
- Normalize aliases before matching (`Ann Yang` → `Ya-Chu Yang`, etc.)
- Match by full name first, then last-name + initials fallback
- Keep canonical name in data outputs

## Validation Gate (before deploy)
- No known aliases left in publications author strings
- No duplicate people under variant names
- Every collaborator has at least one affiliation OR is explicitly marked `unassigned`
- arXiv/DOI order stays `arXiv` then `DOI`

## Human Review Queue
Generate `needs-review` list when:
- low confidence matches
- conflicting affiliations at same priority
- no source found

## Operational Rule
Never silently overwrite a user-provided affiliation.
Always emit diff summary before deploy.
