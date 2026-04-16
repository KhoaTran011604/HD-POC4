# Phase 5: Query Engine Improvements

## Context
- Plan: [plan.md](plan.md)
- Research: [research report](../reports/research-260416-1006-graphify-ts-optimization.md) — P5
- Depends on: Phases 1-4 (graph quality must improve first for query improvements to matter)

## Overview
- **Priority:** P5 (high impact on query precision, medium effort)
- **Status:** pending
- **Effort:** 1.5h
- **Description:** Improve query engine with relevance scoring, edge-type filtering, and ranked output. Current engine does naive substring match + unfiltered BFS.

## Key Insights
- Current: `"auth"` matches `AuthLayout`, `authorize`, `auth.config.ts` equally — no ranking
- BFS traverses ALL edge types equally — after P1 removes `contains`, this improves but still treats `imports` same as `calls`
- No relevance scoring — all matched nodes returned equally
- Start node selection is arbitrary (first N matches)

## Requirements
- Score start nodes: exact > prefix > substring match
- Weight edges: `calls` > `type_reference` > `uses_component` > `imports`
- Sort output nodes by relevance (match quality + subgraph connectivity)
- Keep existing `QueryOptions` and `QueryResult` interfaces backward-compatible

## Architecture
Changes to `query.ts`:
1. **Scored start node selection** — replace flat `filter + slice` with scored ranking
2. **Edge-weighted BFS** — prefer high-signal edges in traversal
3. **Ranked output** — sort nodes by combined score before serializing

```
Current flow:  terms → substring filter → take first 3 → BFS(depth=3) → dump all
New flow:      terms → scored match → top 5 by score → weighted BFS(depth=3) → rank by degree+score → emit
```

## Related Code Files
- **Modify:** `graphify-ts/src/query.ts` — all changes in this file

## Implementation Steps
1. Add match scoring function:
   ```ts
   function scoreMatch(label: string, terms: string[]): number {
     const lower = label.toLowerCase();
     let best = 0;
     for (const t of terms) {
       if (lower === t) best = Math.max(best, 3);        // exact
       else if (lower.startsWith(t)) best = Math.max(best, 2); // prefix
       else if (lower.includes(t)) best = Math.max(best, 1);   // substring
     }
     return best;
   }
   ```
2. Replace start node selection (L72-76):
   ```ts
   const scored = graph.nodes()
     .map(n => ({ n, score: scoreMatch(String(graph.getNodeAttribute(n, 'label') ?? ''), terms) }))
     .filter(x => x.score > 0)
     .sort((a, b) => b.score - a.score);
   const startNodes = scored.slice(0, MAX_START_NODES).map(x => x.n);
   ```
3. Add edge-weight filtering to BFS — skip low-value edges or deprioritize them:
   ```ts
   const HIGH_VALUE_EDGES = new Set(['calls', 'type_reference', 'uses_component', 'inherits', 'implements']);
   ```
   In BFS, prioritize neighbors connected via high-value edges. Add neighbors via `imports` only at current depth (don't follow imports of imports).
4. Add output ranking — sort visited nodes by (match score + degree in subgraph):
   ```ts
   const ranked = [...visited].map(n => ({
     node: n,
     score: (scoreMap.get(n) ?? 0) + graph.degree(n),
   })).sort((a, b) => b.score - a.score);
   ```
5. Update `MAX_START_NODES` from 3 to 5 (more candidates with scoring)
6. Clear cache and test queries

## Todo
- [ ] Add scoreMatch() function
- [ ] Replace start node selection with scored ranking
- [ ] Add edge-type awareness to BFS traversal
- [ ] Add output ranking by relevance
- [ ] Update MAX_START_NODES to 5
- [ ] Test with queries: "auth", "api", "database", "layout"

## Success Criteria
- Exact name matches appear first in results
- BFS prioritizes `calls`/`type_reference` edges over `imports`
- Query results are sorted by relevance
- Backward-compatible: same QueryResult interface
- Token budget trimming still works

## Risk Assessment
- **Low risk:** changes are internal to query.ts, no interface changes
- Edge weighting heuristics may need tuning — start conservative

## Security Considerations
None.

## Next Steps
Phase 6: Graph compaction
