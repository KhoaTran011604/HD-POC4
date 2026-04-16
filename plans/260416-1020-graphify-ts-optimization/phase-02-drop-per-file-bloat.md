# Phase 2: Drop `per_file` Bloat

## Context
- Plan: [plan.md](plan.md)
- Research: [research report](../reports/research-260416-1006-graphify-ts-optimization.md) — P4

## Overview
- **Priority:** P4 (medium impact, very low effort)
- **Status:** pending
- **Effort:** 10min
- **Description:** Remove `per_file` array from extraction.json output. It duplicates all data already in top-level `nodes`/`edges` arrays, doubling file size.

## Key Insights
- `per_file` stores the raw `ExtractionResult[]` — same nodes/edges already flattened into top-level arrays
- 38KB → ~18KB after removal
- AI reads extraction.json wastefully due to duplication

## Requirements
- Remove `per_file` key from merged output object in cli.ts
- No other consumers depend on `per_file` (only extraction.json)

## Architecture
In `cli.ts:98-104`, the merged object is built:
```ts
const merged = {
  root,
  files: files.length,
  nodes: allResults.flatMap((r) => r.nodes),
  edges: allResults.flatMap((r) => r.edges),
  per_file: allResults,  // ← remove this
};
```

## Related Code Files
- **Modify:** `graphify-ts/src/cli.ts` — remove `per_file: allResults` from merged object (L103)

## Implementation Steps
1. In `cli.ts`, remove the `per_file: allResults,` line from the merged object (L103)
2. Run CLI and verify extraction.json no longer has `per_file` key
3. Check file size reduction

## Todo
- [ ] Remove `per_file: allResults` from merged object in cli.ts
- [ ] Validate extraction.json structure
- [ ] Confirm ~50% size reduction

## Success Criteria
- extraction.json has no `per_file` key
- `nodes` and `edges` arrays intact
- File size roughly halved

## Risk Assessment
- **Very low risk:** no code reads `per_file` from extraction.json

## Security Considerations
None.

## Next Steps
Phase 3: Resolve path-alias imports
