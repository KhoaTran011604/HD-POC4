// report.ts — render DirectedGraph + BasicAnalysis → GRAPH_REPORT.md string
import type { DirectedGraph } from 'graphology';
import type { BasicAnalysis, GodNode } from './analyze.js';

// Sanitize labels to prevent Markdown/HTML injection
function sanitize(value: string): string {
  return value.replace(/[<>|]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '|': '\\|' }[c] ?? c));
}

function formatGodNodesTable(nodes: GodNode[]): string {
  if (nodes.length === 0) return '_No god nodes found._\n';

  const header = '| Rank | Node | Type | Connections | File |';
  const sep    = '|------|------|------|-------------|------|';
  const rows = nodes.map((n, i) => {
    const rank  = String(i + 1).padStart(4);
    const label = sanitize(n.label);
    const type  = sanitize(n.type);
    const file  = sanitize(n.source_file);
    return `| ${rank} | ${label} | ${type} | ${n.degree} | ${file} |`;
  });

  return [header, sep, ...rows].join('\n') + '\n';
}

export function renderReport(graph: DirectedGraph, analysis: BasicAnalysis): string {
  const timestamp = new Date().toISOString();
  const table = formatGodNodesTable(analysis.godNodes);

  return [
    '# graphify-ts — Graph Report',
    `Generated: ${timestamp}`,
    '',
    '## Summary',
    `- Files: ${analysis.fileCount} | Nodes: ${analysis.nodeCount} | Edges: ${analysis.edgeCount}`,
    '',
    '## God Nodes (Top 10 by Connections)',
    table,
    '## Suggested Questions',
    '_Phase 03 will populate — placeholder._',
    '',
    '## Token Benchmark',
    '_Phase 04 will populate._',
    '',
  ].join('\n');
}
