// benchmark.ts — corpus vs query token comparison, formatted console output, GRAPH_REPORT.md append
import { statSync, readFileSync, writeFileSync } from 'fs';
import type { DirectedGraph } from 'graphology';
import { query } from './query.js';

const CHARS_PER_TOKEN = 4;

const SAMPLE_QUESTIONS = [
  'how does authentication work',
  'what is the main entry point',
  'how are errors handled',
  'what connects the data layer to the api',
  'what are the core abstractions',
];

export interface BenchmarkResult {
  corpusTokens: number;
  corpusFiles: number;
  graphNodes: number;
  graphEdges: number;
  avgQueryTokens: number;
  reductionRatio: number;
  perQuestion: Array<{ question: string; queryTokens: number; reduction: number }>;
}

export function benchmark(graph: DirectedGraph, corpusFiles: string[]): BenchmarkResult {
  const corpusChars = corpusFiles.reduce((sum, f) => {
    try {
      return sum + statSync(f).size;
    } catch {
      return sum;
    }
  }, 0);
  const corpusTokens = Math.ceil(corpusChars / CHARS_PER_TOKEN);

  // Run all sample questions with no budget cap (get real token estimates)
  const perQuestion = SAMPLE_QUESTIONS.map((q) => {
    const result = query(q, graph, { depth: 3, budgetTokens: 99_999 });
    const qt = result.tokenEstimate;
    return {
      question: q,
      queryTokens: qt,
      reduction: qt > 0 ? Math.round(corpusTokens / qt) : 0,
    };
  }).filter((p) => p.queryTokens > 0);

  const avgQueryTokens =
    perQuestion.length > 0
      ? Math.round(perQuestion.reduce((s, p) => s + p.queryTokens, 0) / perQuestion.length)
      : 0;
  const reductionRatio = avgQueryTokens > 0 ? Math.round(corpusTokens / avgQueryTokens) : 0;

  return {
    corpusTokens,
    corpusFiles: corpusFiles.length,
    graphNodes: graph.order,
    graphEdges: graph.size,
    avgQueryTokens,
    reductionRatio,
    perQuestion,
  };
}

export function printBenchmark(r: BenchmarkResult): void {
  console.log('\ngraphify-ts token reduction benchmark');
  console.log('─'.repeat(50));
  console.log(`  Corpus:         ${r.corpusFiles} files → ~${r.corpusTokens.toLocaleString()} tokens (naive)`);
  console.log(`  Graph:          ${r.graphNodes} nodes, ${r.graphEdges} edges`);
  console.log(`  Avg query cost: ~${r.avgQueryTokens.toLocaleString()} tokens`);
  console.log(`  Reduction:      ${r.reductionRatio}x fewer tokens per query`);

  if (r.perQuestion.length > 0) {
    console.log('\n  Per question:');
    r.perQuestion.forEach((p) => console.log(`    [${p.reduction}x] ${p.question}`));
  } else {
    console.log('\n  No matching nodes found for sample questions on this corpus.');
  }
  console.log();
}

// appendBenchmark replaces the Phase 04 placeholder in GRAPH_REPORT.md with real numbers
export function appendBenchmark(reportPath: string, r: BenchmarkResult): void {
  const tableRows = r.perQuestion.map(
    (p) => `| ${p.question} | ~${p.queryTokens.toLocaleString()} | ${p.reduction}x |`,
  );
  const table = [
    '| Question | Query Tokens | Reduction |',
    '|----------|-------------|-----------|',
    ...tableRows,
  ].join('\n');

  const section = [
    '## Token Benchmark',
    `- Corpus: ${r.corpusFiles} files → ~${r.corpusTokens.toLocaleString()} tokens (naive full read)`,
    `- Graph: ${r.graphNodes} nodes, ${r.graphEdges} edges`,
    `- Avg query: ~${r.avgQueryTokens.toLocaleString()} tokens`,
    `- **Reduction: ${r.reductionRatio}x fewer tokens per query**`,
    '',
    table,
    '',
  ].join('\n');

  const existing = readFileSync(reportPath, 'utf8');
  // Replace any existing ## Token Benchmark block (placeholder or prior run) for idempotency
  if (existing.includes('## Token Benchmark')) {
    const updated = existing.replace(/## Token Benchmark[\s\S]*$/, section);
    writeFileSync(reportPath, updated, 'utf8');
    return;
  }
  // No benchmark section yet — append
  writeFileSync(reportPath, existing + '\n' + section, 'utf8');
}
