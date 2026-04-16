# Phase 6: Graph Compaction

## Context
- Plan: [plan.md](plan.md)
- Research: [research report](../reports/research-260416-1006-graphify-ts-optimization.md) — P6
- Depends on: Phases 1-5 (apply after all functional changes)

## Overview
- **Priority:** P6 (low impact, low effort — polish)
- **Status:** pending
- **Effort:** 30min
- **Description:** Compact node IDs and flatten graph.json format for smaller AI context consumption. ~40% size reduction.

## Key Insights
- Current IDs: `function::ok::src/lib/utils/api-response.ts` — verbose
- Graphology export wraps every attribute in `{ "key": ..., "attributes": {...} }`
- For AI consumption, flat format is better and smaller
- This is optional polish — lower priority than functional fixes

## Requirements
- Shorten type prefixes: `function` → `fn`, `interface` → `iface`, `method` → `meth`
- Shorten file paths in IDs: drop common `src/` prefix, use basename when unique
- Write compact graph.json format alongside graphology format (or replace)
- Keep graphology format available for tools that depend on it

## Architecture
Two approaches:
1. **Option A:** Change `makeId()` to use short prefixes — affects all downstream
2. **Option B:** Add a post-processing step that writes `graph-compact.json` with shortened IDs

**Recommendation:** Option A (change at source) — simpler, all consumers benefit.

## Related Code Files
- **Modify:** `graphify-ts/src/extract-helpers.ts` — `makeId()` prefix shortening
- **Modify:** `graphify-ts/src/cli.ts` — optional: write compact graph.json format

## Implementation Steps
1. In `extract-helpers.ts:makeId()`, shorten type prefix:
   ```ts
   const SHORT_TYPE: Record<string, string> = {
     function: 'fn', interface: 'iface', method: 'meth', class: 'cls', file: 'file',
   };
   export function makeId(type: string, name: string, filePath: string, root: string): string {
     const rel = relative(root, filePath).replace(/\\/g, '/');
     const prefix = SHORT_TYPE[type] ?? type;
     return `${prefix}::${name}::${rel}`;
   }
   ```
2. In `cli.ts`, write compact graph JSON:
   ```ts
   const compactNodes = graph.nodes().map(n => {
     const a = graph.getNodeAttributes(n);
     return { id: n, t: a.type, f: a.source_file, l: parseInt(a.source_location?.replace('L','') ?? '0') };
   });
   const compactEdges = graph.edges().map(e => {
     const a = graph.getEdgeAttributes(e);
     return { s: graph.source(e), t: graph.target(e), r: a.relation };
   });
   writeFileSync(`${OUT_DIR}/graph-compact.json`, JSON.stringify({ nodes: compactNodes, edges: compactEdges }), 'utf8');
   ```
3. Clear cache (ID format changed)
4. Verify all outputs

## Todo
- [ ] Shorten type prefixes in makeId()
- [ ] Add compact graph.json output
- [ ] Clear cache
- [ ] Verify graph.json size reduction
- [ ] Verify CLI still works end-to-end

## Success Criteria
- Node IDs shorter (e.g., `fn::ok::src/lib/utils/api-response.ts`)
- graph-compact.json ~40% smaller than graph.json
- All downstream tools still work (query, analyze, cluster)

## Risk Assessment
- **Medium risk:** ID format change breaks cache — must clear cache
- **Low risk:** any external tool reading graph.json by ID format — unlikely for internal tool

## Security Considerations
None.

## Next Steps
- Run full validation: `npx tsx graphify-ts/src/cli.ts .`
- Compare before/after metrics
- Commit changes
