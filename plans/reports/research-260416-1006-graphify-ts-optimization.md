# Research Report: graphify-ts Knowledge Graph & Query Optimization

**Date:** 2026-04-16  
**Scope:** Audit current data quality, identify noise sources, propose concrete fixes

---

## Executive Summary

graphify-ts produces a graph that is **88% noise**. Of 25 non-file nodes, 22 have degree=1 (connected only to parent file via `contains`). 76% of edges are trivial `contains` relations. The query engine does naive substring matching on this noisy graph, so BFS mostly hits dead ends or pulls irrelevant file contents. The import resolver misses path aliases (`@/...`), leaving 67% of files as isolated islands.

**Root causes:** (1) `contains` edges dominate and provide zero navigational value, (2) path-alias imports not resolved, (3) no JSX/component-usage edges, (4) extraction.json stores redundant `per_file` data, (5) query engine lacks semantic awareness.

---

## Problem Analysis

### P1: Contains Edge Pollution (76% of all edges)

```
Edge distribution:
  contains:       25/33  (76%)  ← NOISE
  imports:         6/33  (18%)  ← useful but incomplete
  calls:           1/33  ( 3%)  ← useful
  type_reference:  1/33  ( 3%)  ← useful
```

`contains` edges just say "file X has function Y" — trivially derivable from `source_file` attribute on every node. They pollute BFS traversal: a query for "auth" finds `requireRole`, BFS follows the `contains` edge back to `rbac.ts` file node, then forward through ALL other `contains` edges to every sibling function. Net effect: query returns the entire file's symbols instead of the relevant subgraph.

**Fix:** Remove `contains` edges from graph entirely. File→symbol relationship is implicit via `source_file` attribute. Only store edges with navigational value: `imports`, `calls`, `inherits`, `implements`, `type_reference`, `uses_component`.

### P2: Broken Import Resolution (67% files isolated)

16 of 24 files have zero import edges. The import extractor skips non-relative imports:

```ts
// extract-helpers.ts:44
if (!specifier.startsWith('.')) continue;  // ← kills @/... aliases
```

In Next.js projects, most imports use `@/` path alias. This single line makes the graph lose most inter-file connections.

**Fix:** Resolve `tsconfig.json` `paths` aliases. ts-morph's `getModuleSpecifierSourceFile()` already resolves aliases if the Project loads tsconfig — the skip is premature.

### P3: Missing JSX Component Usage Edges

React/Next.js codebases communicate via JSX: `<Header />` in layout.tsx means layout uses Header component. Current extractor has zero JSX awareness. This is a critical gap for frontend codebases.

**Fix:** Extract `JsxOpeningElement` / `JsxSelfClosingElement` tags, resolve their symbols, create `uses_component` edges.

### P4: extraction.json Bloat

- `per_file` array duplicates all data already in top-level `nodes`/`edges` — 2x storage
- 38KB for 24 files and 49 nodes — should be ~15KB after dedup
- AI reads this file wastefully

**Fix:** Drop `per_file` from extraction.json. If per-file provenance needed, it's already encoded in node's `source_file` attribute.

### P5: Query Engine Weaknesses

1. **Substring matching only** — `"auth"` matches `AuthLayout`, `authorize`, `auth.config.ts` equally, no ranking
2. **BFS on sparse graph** — depth=3 is useless when 88% of nodes are dead-end degree-1 leaves
3. **No edge-type weighting** — `contains` (noise) weighted same as `calls` (signal)
4. **No relevance scoring** — all matched nodes returned equally

**Fixes:**
- Filter out `contains` edges from BFS traversal (or remove them entirely per P1)
- Add TF-IDF or keyword frequency scoring to rank start nodes
- Weight edges: `calls` > `imports` > `type_reference` > `uses_component`
- Return nodes sorted by relevance (degree in subgraph + match quality)

### P6: Over-Fragmented Communities (20 clusters for 49 nodes)

Louvain produces 20 communities because the graph is too sparse (most nodes only connected by `contains` to their file). After fixing P1-P3, community detection will produce meaningful clusters.

### P7: graph.json Verbosity

Graphology's export format wraps every attribute in `{ "key": ..., "attributes": {...} }`. For AI consumption, a flat format is better:

```json
// Current: 19KB
{ "key": "function::ok::src/lib/utils/api-response.ts", "attributes": { "label": "ok", "type": "function", "source_file": "src/lib/utils/api-response.ts", "source_location": "L6" } }

// Proposed: ~11KB (40% smaller)  
{ "id": "fn::ok::api-response.ts", "t": "fn", "f": "src/lib/utils/api-response.ts", "l": 6 }
```

---

## Prioritized Fix Plan

| Priority | Fix | Impact | Effort |
|----------|-----|--------|--------|
| P1 | Remove `contains` edges from graph | High — eliminates 76% noise | Low |
| P2 | Resolve path-alias imports (`@/...`) | High — connects 67% isolated files | Medium |
| P3 | Add JSX component usage edges | High — captures frontend relationships | Medium |
| P4 | Drop `per_file` from extraction.json | Medium — halves output size | Low |
| P5 | Improve query: edge-type filtering + relevance scoring | High — reduces false positives | Medium |
| P6 | Compact node IDs / graph.json format | Low — smaller AI context | Low |
| P7 | Re-tune Louvain after P1-P3 | Auto — will self-correct with better edges | None |

### Quick Wins (P1 + P4 — 30 min)

**P1 — Remove `contains` edges:**
- In `build.ts`: skip edges where `relation === 'contains'`
- OR in `extract.ts` / `extract-helpers.ts`: stop emitting `contains` edges entirely
- File→symbol association preserved via `source_file` attribute on every node

**P4 — Drop `per_file`:**
- In `cli.ts:98-104`: remove `per_file` from merged object

### Medium Fixes (P2 + P3 + P5 — 2-4 hours)

**P2 — Path alias resolution:**
- In `collect.ts` or `cli.ts`: load tsconfig's `compilerOptions.paths`
- Pass tsconfig path to ts-morph `Project` constructor:
  ```ts
  const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.json') });
  ```
- Remove the `if (!specifier.startsWith('.')) continue;` guard in `extract-helpers.ts:44`
- Instead filter: skip only `node_modules` imports (no resolved source file = external)

**P3 — JSX usage edges:**
- In `extract.ts` or `extract-helpers.ts`, add JSX extraction:
  ```ts
  for (const jsx of sf.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
    const tagName = jsx.getTagNameNode();
    const sym = tagName.getSymbol();
    // resolve to imported component → create uses_component edge
  }
  ```

**P5 — Query improvements:**
- Remove `contains` traversal (done by P1)
- Score start nodes by: exact match > prefix match > substring match
- Limit BFS to semantically rich edges: `calls`, `imports`, `type_reference`, `uses_component`
- Sort output nodes by subgraph degree (more connected = more relevant)

---

## Expected Impact After Fixes

| Metric | Before | After (estimated) |
|--------|--------|-------------------|
| Useful edges | 8/33 (24%) | ~30/35 (86%) |
| Connected files | 8/24 (33%) | ~22/24 (92%) |
| Noise nodes in query | 22/25 (88%) | ~5/30 (17%) |
| extraction.json size | 38KB | ~18KB |
| graph.json size | 19KB | ~12KB |
| Query precision | low (substring + BFS on noise) | high (scored + filtered BFS) |
| Communities | 20 (meaningless) | ~5-8 (semantic) |

---

## Unresolved Questions

1. Should `method` edges (class→method) also be removed like `contains`? They're structural but slightly more useful since they encode class membership.
2. Should the graph store `exports` edges? Knowing what a file exports helps narrow query results but adds complexity.
3. Should `*.test.ts` and `*.spec.ts` files be excluded from the graph by default? Test files add noise for architecture questions but are useful for "how is X tested?" queries.
