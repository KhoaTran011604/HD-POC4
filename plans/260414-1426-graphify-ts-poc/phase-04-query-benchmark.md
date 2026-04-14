# Phase 04 — Query Engine + Benchmark

## Context Links
- Parent plan: [plan.md](./plan.md)
- Depends on: [phase-03](./phase-03-clustering-analysis.md)
- Research: [graphology + skill](./research/researcher-02-graphology-skill.md)
- Reference: [graphify benchmark.py](../../graphify/graphify/benchmark.py)

## Overview
- **Date:** 2026-04-14
- **Priority:** P1
- **Status:** complete
- **Effort:** ~3h
- **Goal:** `graphify-ts --query "how does auth work"` returns focused subgraph context; benchmark prints reduction ratio

## Key Insights
- BFS via `graphology-traversal` `bfsFromNode(graph, start, callback)` — callback `(node, attrs, depth) => true` to stop
- Token budget enforcement: serialize visited nodes+edges to text → count chars/4 → stop BFS when over budget
- Corpus tokens = sum of all file sizes / 4 (char-per-token heuristic, same as graphify Python)
- Query matching: tokenize question → find nodes whose `label` contains any term → use as BFS start nodes
- Output format for LLM: compact text block (not JSON) for copy-paste into prompt

## Requirements
### Functional
- `query(question, graph, opts)` → `QueryResult` (focused subgraph as text + metadata)
- `QueryOptions`: `{ depth?: number; budgetTokens?: number; communityFilter?: boolean }`
- `benchmark(graph, corpusFiles)` → `BenchmarkResult` with per-question token counts + reduction ratio
- CLI: `graphify-ts --query "..."` prints compact context block
- CLI: benchmark printed automatically after every full run
- Benchmark uses 5 default sample questions (same pattern as graphify Python)

### Non-functional
- query() must be synchronous (no I/O)
- BFS respects `budgetTokens` to avoid returning more than caller expects
- Benchmark reproducible: same graph → same numbers

## Architecture
```
src/
├── query.ts       # BFS query engine → QueryResult
└── benchmark.ts   # corpus vs query token comparison → BenchmarkResult
```

## Key Types
```typescript
export interface QueryResult {
  question: string;
  nodes: Array<{ label: string; type: string; source_file: string; source_location: string }>;
  edges: Array<{ from: string; to: string; relation: string; confidence: string }>;
  tokenEstimate: number;
  contextBlock: string;  // pre-formatted text for LLM injection
}

export interface BenchmarkResult {
  corpusTokens: number;
  corpusFiles: number;
  graphNodes: number;
  graphEdges: number;
  avgQueryTokens: number;
  reductionRatio: number;
  perQuestion: Array<{ question: string; queryTokens: number; reduction: number }>;
}
```

## Implementation Steps

### Step 1: `query.ts`
```typescript
import { bfsFromNode } from 'graphology-traversal';
import type { DirectedGraph } from 'graphology';

const CHARS_PER_TOKEN = 4;

export function query(
  question: string,
  graph: DirectedGraph,
  opts: QueryOptions = {}
): QueryResult {
  const { depth = 3, budgetTokens = 2000 } = opts;
  const terms = question.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  // Find start nodes: label contains any query term
  const startNodes = graph.nodes().filter(n => {
    const label = (graph.getNodeAttribute(n, 'label') ?? '').toLowerCase();
    return terms.some(t => label.includes(t));
  });

  if (startNodes.length === 0) return emptyResult(question);

  const visited = new Set<string>();
  const visitedEdges: Array<[string, string]> = [];

  for (const start of startNodes.slice(0, 3)) {  // max 3 start nodes
    bfsFromNode(graph, start, (node, _attrs, d) => {
      if (d > depth) return true;  // stop this branch
      if (visited.size > 200) return true;  // hard cap
      visited.add(node);
      return false;
    });
    // Collect edges within visited set
    graph.forEachEdge((e, attrs, src, tgt) => {
      if (visited.has(src) && visited.has(tgt)) visitedEdges.push([src, tgt]);
    });
  }

  // Serialize to compact text block
  const lines: string[] = [];
  for (const n of visited) {
    const a = graph.getNodeAttributes(n);
    lines.push(`NODE ${a.label} [${a.type}] ${a.source_file}:${a.source_location}`);
  }
  for (const [src, tgt] of visitedEdges) {
    const e = graph.getEdgeAttributes(src, tgt);
    lines.push(`EDGE ${graph.getNodeAttribute(src,'label')} --${e.relation}--> ${graph.getNodeAttribute(tgt,'label')}`);
  }

  const contextBlock = lines.join('\n');
  const tokenEstimate = Math.ceil(contextBlock.length / CHARS_PER_TOKEN);

  // Trim if over budget
  const trimmedLines = trimToTokenBudget(lines, budgetTokens);

  return {
    question, nodes: [...visited].map(n => graph.getNodeAttributes(n) as any),
    edges: visitedEdges.map(([s,t]) => ({ from: s, to: t, ...graph.getEdgeAttributes(s,t) })),
    tokenEstimate,
    contextBlock: trimmedLines.join('\n'),
  };
}
```

### Step 2: `benchmark.ts`
```typescript
const SAMPLE_QUESTIONS = [
  'how does authentication work',
  'what is the main entry point',
  'how are errors handled',
  'what connects the data layer to the api',
  'what are the core abstractions',
];

export function benchmark(graph: DirectedGraph, corpusFiles: string[]): BenchmarkResult {
  const corpusChars = corpusFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  const corpusTokens = Math.ceil(corpusChars / CHARS_PER_TOKEN);

  const perQuestion = SAMPLE_QUESTIONS.map(q => {
    const result = query(q, graph, { depth: 3, budgetTokens: 99999 });
    const qt = result.tokenEstimate;
    return { question: q, queryTokens: qt, reduction: qt > 0 ? Math.round(corpusTokens / qt) : 0 };
  }).filter(p => p.queryTokens > 0);

  const avgQueryTokens = Math.round(perQuestion.reduce((s,p) => s + p.queryTokens, 0) / perQuestion.length);
  const reductionRatio = avgQueryTokens > 0 ? Math.round(corpusTokens / avgQueryTokens) : 0;

  return {
    corpusTokens, corpusFiles: corpusFiles.length,
    graphNodes: graph.order, graphEdges: graph.size,
    avgQueryTokens, reductionRatio, perQuestion
  };
}

export function printBenchmark(r: BenchmarkResult): void {
  console.log('\ngraphify-ts token reduction benchmark');
  console.log('─'.repeat(50));
  console.log(`  Corpus:         ${r.corpusFiles} files → ~${r.corpusTokens.toLocaleString()} tokens (naive)`);
  console.log(`  Graph:          ${r.graphNodes} nodes, ${r.graphEdges} edges`);
  console.log(`  Avg query cost: ~${r.avgQueryTokens.toLocaleString()} tokens`);
  console.log(`  Reduction:      ${r.reductionRatio}x fewer tokens per query`);
  console.log('\n  Per question:');
  r.perQuestion.forEach(p => console.log(`    [${p.reduction}x] ${p.question}`));
  console.log();
}
```

### Step 3: Wire into CLI
```typescript
// cli.ts — add --query flag + auto-benchmark
program
  .option('-q, --query <question>', 'query the graph for focused context')
  .action(async (root, opts) => {
    // ... extract + build + cluster as before ...
    if (opts.query) {
      const result = query(opts.query, graph);
      console.log('\n--- Graph Context ---');
      console.log(result.contextBlock);
      console.log(`\n(~${result.tokenEstimate} tokens vs ~${benchResult.corpusTokens} corpus tokens)`);
    }
    const benchResult = benchmark(graph, files);
    printBenchmark(benchResult);
    // Append benchmark to GRAPH_REPORT.md
    appendBenchmarkToReport(benchResult);
  });
```

### Step 4: Append benchmark to GRAPH_REPORT.md
Add to `report.ts` a `appendBenchmark(reportPath, result)` function that writes:
```markdown
## Token Benchmark
- Corpus: {N} files → ~{X,XXX} tokens (naive full read)
- Graph: {N} nodes, {N} edges
- Avg query: ~{XXX} tokens
- **Reduction: {N}x fewer tokens per query**

| Question | Query Tokens | Reduction |
|----------|-------------|-----------|
```

## Todo List
- [x] `query.ts` — BFS engine with term matching + token budget
- [x] `benchmark.ts` — corpus vs query token comparison
- [x] `printBenchmark()` — formatted console output
- [x] Wire `--query` flag into CLI
- [x] Auto-run benchmark after every full build
- [x] Append benchmark section to GRAPH_REPORT.md
- [x] Test on graphify source: verify reduction > 5x

## Success Criteria
- `npx graphify-ts graphify/graphify --query "how does extraction work"` returns relevant nodes
- Benchmark prints reduction ratio ≥ 5x on a 10+ file project
- Numbers are reproducible (same graph → same benchmark output)
- contextBlock fits within stated `budgetTokens`

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| Query returns 0 nodes (no term match) | Medium | Fallback: return top-3 god nodes + their neighbors |
| BFS explosion on dense graph | Medium | Hard cap at 200 visited nodes |
| Reduction ratio < 2x on small project | Low | Document: "scales with corpus size"; demo on 20+ file project |
| char/4 heuristic inaccurate | Low | Add note: "approximate; swap for tiktoken for precision" |

## Security Considerations
- `query()` input from CLI — no eval, no filesystem ops inside query()
- BFS depth + node cap prevent resource exhaustion from crafted inputs

## Next Steps
→ Phase 05: Claude Code skill (`/graphify-ts`), PreToolUse hook, `install` command, demo validation
