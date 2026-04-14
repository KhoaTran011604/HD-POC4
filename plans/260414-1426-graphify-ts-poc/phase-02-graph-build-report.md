# Phase 02 — Graph Build + Report

## Context Links
- Parent plan: [plan.md](./plan.md)
- Depends on: [phase-01](./phase-01-project-setup-ast-extraction.md)
- Research: [graphology + skill](./research/researcher-02-graphology-skill.md)
- Reference: [graphify build.py](../../graphify/graphify/build.py), [report.py](../../graphify/graphify/report.py)

## Overview
- **Date:** 2026-04-14
- **Priority:** P1
- **Status:** pending (blocked by Phase 01)
- **Effort:** ~3h
- **Goal:** `graphify-ts-out/GRAPH_REPORT.md` + `graph.json` generated with top-10 god nodes table

## Key Insights
- graphology `DirectedGraph` — `graph.addNode(id, attrs)` idempotent; `graph.addEdge(src, tgt, attrs)` throws on duplicate → use `graph.mergeEdge()`
- Serialization: `graph.export()` → plain JSON object; `graph.import(json)` to reload — no extra package
- God nodes = top N by `graph.degree(node)` after excluding file-level hub nodes (label === basename)
- Node deduplication: same node ID across files → last write wins (ts-morph EXTRACTED nodes win over inferred)
- Report should be <5KB to fit AI context comfortably

## Requirements
### Functional
- `buildGraph(results: ExtractionResult[]): DirectedGraph` — merge all nodes+edges
- `analyzeBasic(graph)` → `{ godNodes: GodNode[], nodeCount, edgeCount }`
- `renderReport(graph, analysis)` → Markdown string
- Write `graphify-ts-out/graph.json` + `graphify-ts-out/GRAPH_REPORT.md`
- CLI: runs end-to-end after Phase 01 extraction

### Non-functional
- `build.ts` < 80 lines (simple merge)
- `report.ts` < 150 lines
- Report renders in <100ms

## Architecture
```
src/
├── build.ts         # ExtractionResult[] → DirectedGraph
├── analyze.ts       # basic god nodes (degree sort) — extended in Phase 03
└── report.ts        # DirectedGraph + analysis → GRAPH_REPORT.md string
```

## God Node Definition
```typescript
interface GodNode {
  id: string;
  label: string;
  type: string;
  degree: number;
  source_file: string;
}
// Exclude: nodes where label === path.basename(source_file) (file hub nodes)
// Exclude: nodes with degree <= 1 and label ends with "()" (isolated stubs)
```

## Implementation Steps

### Step 1: `build.ts`
```typescript
import { DirectedGraph } from 'graphology';
import type { ExtractionResult } from './types.js';

export function buildGraph(results: ExtractionResult[]): DirectedGraph {
  const graph = new DirectedGraph();
  for (const r of results) {
    for (const node of r.nodes) {
      graph.mergeNode(node.id, { label: node.label, type: node.type,
        source_file: node.source_file, source_location: node.source_location });
    }
    for (const edge of r.edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      graph.mergeEdge(edge.source, edge.target, {
        relation: edge.relation, confidence: edge.confidence });
    }
  }
  return graph;
}
```

### Step 2: `analyze.ts` (basic, extended in Phase 03)
```typescript
export function godNodes(graph: DirectedGraph, topN = 10): GodNode[] {
  return graph.nodes()
    .filter(n => !isFileHub(graph, n))
    .map(n => ({ id: n, ...graph.getNodeAttributes(n), degree: graph.degree(n) }))
    .sort((a, b) => b.degree - a.degree)
    .slice(0, topN);
}

function isFileHub(graph: DirectedGraph, nodeId: string): boolean {
  const { label, source_file } = graph.getNodeAttributes(nodeId);
  return label === path.basename(source_file ?? '');
}
```

### Step 3: `report.ts`
```markdown
# graphify-ts — Graph Report
Generated: {timestamp}

## Summary
- Files: {fileCount} | Nodes: {nodeCount} | Edges: {edgeCount}

## God Nodes (Top 10 by Connections)
| Rank | Node | Type | Connections | File |
|------|------|------|------------|------|
| 1    | ...  | class| 24         | src/auth.ts:L12 |

## Suggested Questions
(Phase 03 will populate — placeholder here)

## Token Benchmark
(Phase 04 will populate)
```

### Step 4: Wire into CLI
```typescript
// cli.ts additions after extraction loop:
import { buildGraph } from './build.js';
import { godNodes } from './analyze.js';
import { renderReport } from './report.js';

const graph = buildGraph(allResults);
const analysis = { godNodes: godNodes(graph), nodeCount: graph.order, edgeCount: graph.size };
const report = renderReport(graph, analysis);
fs.writeFileSync('graphify-ts-out/GRAPH_REPORT.md', report);
fs.writeFileSync('graphify-ts-out/graph.json', JSON.stringify(graph.export(), null, 2));
console.log(`Graph: ${graph.order} nodes, ${graph.size} edges`);
console.log('Report: graphify-ts-out/GRAPH_REPORT.md');
```

## Todo List
- [ ] `build.ts` — merge ExtractionResult[] → DirectedGraph
- [ ] `analyze.ts` — `godNodes()` with file-hub exclusion
- [ ] `report.ts` — Markdown template with god nodes table
- [ ] Wire build + report into `cli.ts`
- [ ] Write `graph.json` to output dir
- [ ] Test: `npx graphify-ts graphify/graphify` produces report with >0 god nodes

## Success Criteria
- `graphify-ts-out/GRAPH_REPORT.md` contains god nodes table with correct degree counts
- `graphify-ts-out/graph.json` is valid JSON, importable back via `graph.import()`
- Report is < 5KB for a 10-file project
- No duplicate node/edge errors

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Dangling edges (missing nodes) | Medium | Skip edges where src/tgt not in graph |
| File hub nodes dominate top-10 | High | Exclude via `isFileHub()` check |
| graph.export() not round-trippable | Low | Write smoke test for import/export |

## Security Considerations
- Sanitize node labels before writing to Markdown (strip `<>` to prevent injection if report is rendered as HTML)
- Validate output dir is inside project root

## Next Steps
→ Phase 03: Add Louvain clustering, cross-community "surprising connections", extend report
