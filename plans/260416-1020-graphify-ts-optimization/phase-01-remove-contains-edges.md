# Phase 1: Remove `contains` Edges

## Context
- Plan: [plan.md](plan.md)
- Research: [research report](../reports/research-260416-1006-graphify-ts-optimization.md) — P1

## Overview
- **Priority:** P1 (highest impact, lowest effort)
- **Status:** complete
- **Effort:** 20min
- **Description:** Remove `contains` edges from graph. They represent "file X has symbol Y" — trivially derivable from `source_file` attribute on every node. They constitute 76% of all edges and pollute BFS traversal.

## Key Insights
- 25/33 edges (76%) are `contains` — pure noise
- BFS from any matched node follows `contains` back to file, then forward to ALL siblings
- File->symbol relationship already encoded in node's `source_file` attribute
- `method` edges (class->method) are different — they encode class membership, keep those

## Requirements
- Stop emitting `contains` edges in extraction
- Keep `method`, `decorator`, and all other edge types
- Update `EdgeRelation` type to remove `contains`
- No behavioral change to CLI interface

## Architecture
`extract.ts:extractFile()` currently pushes `contains` edges for interfaces (L42), classes (L52), functions (L83), and arrow functions (L92). Remove all four `edges.push()` calls for `relation: 'contains'`.

## Related Code Files
- **Modify:** `graphify-ts/src/extract.ts` — remove 4 `contains` edge pushes (L42, L52, L83, L92)
- **Modify:** `graphify-ts/src/types.ts` — remove `'contains'` from `EdgeRelation` union

## Implementation Steps
1. In `extract.ts`, delete the `edges.push({ ... relation: 'contains' ... })` lines at:
   - L42 (interfaces)
   - L52 (classes)
   - L83 (named functions)
   - L92 (arrow functions)
2. In `types.ts`, remove `| 'contains'` from `EdgeRelation` type (L7)
3. Clear cache: delete `graphify-ts-out/` dir to force re-extraction
4. Run `npx tsx graphify-ts/src/cli.ts .` and verify `contains` edges are gone

## Todo
- [x] Remove contains edge for interfaces in extract.ts
- [x] Remove contains edge for classes in extract.ts
- [x] Remove contains edge for functions in extract.ts
- [x] Remove contains edge for arrow functions in extract.ts
- [x] Remove 'contains' from EdgeRelation type
- [x] Validate: run CLI, confirm 0 contains edges in extraction.json

## Success Criteria
- Zero `contains` edges in extraction.json
- All other edge types preserved
- Node count unchanged
- CLI runs without errors

## Risk Assessment
- **Low risk:** `contains` edges carry no navigational value; removal is purely additive for quality
- If any consumer relies on `contains` edges → unlikely, but check `query.ts` and `analyze.ts`

## Security Considerations
None — no external I/O or auth changes.

## Next Steps
Phase 2: Drop per_file bloat
