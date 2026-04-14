# Phase 03 — Clustering + Analysis

## Context Links
- Parent plan: [plan.md](./plan.md)
- Depends on: [phase-02](./phase-02-graph-build-report.md)
- Research: [graphology + skill](./research/researcher-02-graphology-skill.md)
- Reference: [graphify cluster.py](../../graphify/graphify/cluster.py), [analyze.py](../../graphify/graphify/analyze.py)

## Overview
- **Date:** 2026-04-14
- **Priority:** P1
- **Status:** complete
- **Effort:** ~3h
- **Goal:** GRAPH_REPORT.md enriched with Louvain communities + surprising cross-community connections + suggested questions

## Key Insights
- `louvain(graph)` from `graphology-communities-louvain` returns `{ [nodeId]: communityId }` (plain object, not Map)
- Community label = most common `source_file` basename within community members
- "Surprising connections" = cross-community edges where `relation` is NOT `imports|contains|method` — these are non-structural links
- Suggested questions generated from: AMBIGUOUS edges (none in Phase 01 — only EXTRACTED/INFERRED), bridge nodes (high betweenness), isolated nodes (degree ≤ 1)
- Louvain is non-deterministic by default → pass `{ randomWalk: false }` or fixed seed for reproducibility

## Requirements
### Functional
- `cluster(graph)` → `CommunityMap` (`{ [nodeId]: communityId }`)
- `communityLabel(graph, communityMap, cid)` → human-readable label string
- `surprisingConnections(graph, communityMap, topN=5)` → list of cross-community non-structural edges
- `suggestQuestions(graph, communityMap)` → list of question strings
- Update `renderReport()` to include: Communities section, Surprising Connections, Suggested Questions
- `cluster.ts` < 80 lines; extend `analyze.ts` (not replace)

### Non-functional
- Louvain output deterministic (fixed seed or `randomWalk: false`)
- Communities section shows member count + cohesion score

## Architecture
```
src/
├── cluster.ts         # louvain wrapper → CommunityMap + communityLabel()
└── analyze.ts         # extend: surprisingConnections(), suggestQuestions()
```

## Key Types
```typescript
export type CommunityMap = { [nodeId: string]: number };

export interface Community {
  id: number;
  label: string;
  memberCount: number;
  members: string[];  // node IDs
}

export interface SurprisingConnection {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  sourceFile: string;
  targetFile: string;
  why: string;
}
```

## Implementation Steps

### Step 1: `cluster.ts`
```typescript
import louvain from 'graphology-communities-louvain';
import { DirectedGraph } from 'graphology';

export function cluster(graph: DirectedGraph): CommunityMap {
  // louvain works on undirected; convert or use undirected copy
  const undirected = toUndirected(graph); // graphology-operators toUndirected
  return louvain(undirected, { randomWalk: false });
}

export function communityLabel(graph: DirectedGraph, map: CommunityMap, cid: number): string {
  const members = Object.entries(map).filter(([, c]) => c === cid).map(([n]) => n);
  // Most common source_file basename among members
  const counts: Record<string, number> = {};
  for (const n of members) {
    const sf = graph.getNodeAttribute(n, 'source_file') ?? '';
    const base = path.basename(sf, path.extname(sf));
    counts[base] = (counts[base] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? `Community ${cid}`;
}
```

### Step 2: Extend `analyze.ts`

**surprisingConnections():**
```typescript
export function surprisingConnections(
  graph: DirectedGraph, communityMap: CommunityMap, topN = 5
): SurprisingConnection[] {
  const results: SurprisingConnection[] = [];
  graph.forEachEdge((edge, attrs, src, tgt) => {
    const rel = attrs.relation as string;
    if (['imports','contains','method'].includes(rel)) return;   // structural — not surprising
    if (isFileHub(graph, src) || isFileHub(graph, tgt)) return;
    const cSrc = communityMap[src], cTgt = communityMap[tgt];
    if (cSrc === undefined || cTgt === undefined || cSrc === cTgt) return;
    const srcFile = graph.getNodeAttribute(src, 'source_file') ?? '';
    const tgtFile = graph.getNodeAttribute(tgt, 'source_file') ?? '';
    results.push({
      source: graph.getNodeAttribute(src, 'label'),
      target: graph.getNodeAttribute(tgt, 'label'),
      relation: rel, confidence: attrs.confidence,
      sourceFile: srcFile, targetFile: tgtFile,
      why: `bridges community ${cSrc} → ${cTgt} (${srcFile} ↔ ${tgtFile})`
    });
  });
  // Sort: INFERRED first, then EXTRACTED
  return results.sort((a, b) =>
    (a.confidence === 'INFERRED' ? 0 : 1) - (b.confidence === 'INFERRED' ? 0 : 1)
  ).slice(0, topN);
}
```

**suggestQuestions():**
```typescript
export function suggestQuestions(graph: DirectedGraph, communityMap: CommunityMap): string[] {
  const qs: string[] = [];
  // Isolated nodes
  const isolated = graph.nodes().filter(n => graph.degree(n) <= 1 && !isFileHub(graph, n));
  if (isolated.length) qs.push(
    `What connects ${isolated.slice(0,3).map(n => `\`${graph.getNodeAttribute(n,'label')}\``).join(', ')} to the rest?`
  );
  // INFERRED edges needing verification
  const inferred = graph.edges().filter(e => graph.getEdgeAttribute(e,'confidence') === 'INFERRED');
  if (inferred.length >= 2) qs.push(
    `Are the ${inferred.length} inferred relationships in the graph correct? Verify the top god node's call edges.`
  );
  return qs;
}
```

### Step 3: Update `report.ts` — add sections
```markdown
## Communities (Louvain)
| ID | Label | Members |
|----|-------|---------|
| 0  | auth  | 12      |
| 1  | models| 8       |

## Surprising Connections
| From | To | Relation | Why |
|------|----|----------|-----|

## Suggested Questions
1. ...
```

### Step 4: Wire into CLI
```typescript
// cli.ts after buildGraph():
import { cluster, communityLabel } from './cluster.js';
import { surprisingConnections, suggestQuestions } from './analyze.js';

const communityMap = cluster(graph);
const surprises = surprisingConnections(graph, communityMap);
const questions = suggestQuestions(graph, communityMap);
// pass all to renderReport()
```

## Todo List
- [x] Install `graphology-operators` (for `toUndirected`)
- [x] `cluster.ts` — louvain wrapper + communityLabel()
- [x] `analyze.ts` — add surprisingConnections() + suggestQuestions()
- [x] Update `report.ts` — Communities + Surprising Connections + Suggested Questions sections
- [x] Wire cluster into `cli.ts`
- [x] Test: communities > 1 on a multi-file project

## Success Criteria
- Louvain produces ≥ 2 communities on a project with > 5 source files
- At least 1 surprising connection found on test corpus
- GRAPH_REPORT.md includes all 3 new sections
- Deterministic output on repeated runs

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Louvain on sparse graph → 1 community | Medium | Fallback: report "insufficient edges for clustering" |
| `toUndirected` loses edge direction info | Low | Only used for clustering; original directed graph retained |
| No surprising connections found | Low | Fall back to "no cross-community edges found" message |

## Security Considerations
- Community labels derived from filenames only — no user input, no injection risk

## Next Steps
→ Phase 04: BFS query engine + token benchmark with visual reduction numbers
