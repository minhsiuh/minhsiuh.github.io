# AFFILIATION_PIPELINE.md

Purpose: robust author→affiliation resolution for research pages (Shannon/Simulation/QEC/QML/RB).

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

## Definition of Done (DoD) for any new research topic page
A topic page is **not deployable** unless all items are true:
1. `data/research-<topic>.publications.json` exists and is wired in HTML.
2. `data/research-<topic>.collaborators.json` exists with:
   - non-empty `collaborators`
   - non-empty `institutions`
   - each institution has `country` and valid `location` `[lat, lng]`
3. `scripts/validate-<topic>.mjs` exists and passes.
4. `scripts/build-<topic>-knowledge-graph.mjs` exists and runs.
5. Generated artifacts exist and are refreshed:
   - `data/research-<topic>.knowledge-graph.json`
   - `data/research-<topic>.collab-matrix.csv`
6. Author format passes full-name rule (no short initials unless explicitly whitelisted).
7. Publication links enforce `arXiv` before `DOI` when both present.
8. Page structure matches canonical order:
   - `overview -> collaborators -> publications -> related`
   and side-nav includes `Collaborators`.
9. Map must render at least one marker (unless page explicitly marked `under-construction`).

## Release Gate (pre-push)
Before push, always run this sequence for the target topic:
1. `node scripts/build-<topic>-knowledge-graph.mjs`
2. `node scripts/validate-<topic>.mjs`
3. Check git diff summary and confirm with user
4. Push only after explicit user approval (`yes/ok/push`).

If any step fails, stop and fix before deploy.
