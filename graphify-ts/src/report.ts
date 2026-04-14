// report.ts — render DirectedGraph + analysis → GRAPH_REPORT.md string
import type { DirectedGraph } from 'graphology';
import type { BasicAnalysis, GodNode, SurprisingConnection } from './analyze.js';
import type { Community } from './cluster.js';

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

export interface ReportOptions {
  communities?: Community[];
  surprises?: SurprisingConnection[];
  questions?: string[];
}

function formatCommunitiesTable(communities: Community[]): string {
  if (communities.length === 0) return '_Insufficient edges for clustering._\n';
  if (communities.length === 1)
    return '_Single community detected — graph may be too sparse for meaningful clustering._\n';

  const header = '| ID | Label | Members |';
  const sep    = '|----|-------|---------|';
  const rows = communities.map((c) =>
    `| ${c.id} | ${sanitize(c.label)} | ${c.memberCount} |`,
  );
  return [header, sep, ...rows].join('\n') + '\n';
}

function formatSurprisesTable(surprises: SurprisingConnection[]): string {
  if (surprises.length === 0) return '_No cross-community edges found._\n';

  const header = '| From | To | Relation | Confidence | Why |';
  const sep    = '|------|----|----------|------------|-----|';
  const rows = surprises.map((s) =>
    `| ${sanitize(s.source)} | ${sanitize(s.target)} | ${sanitize(s.relation)} | ${sanitize(s.confidence)} | ${sanitize(s.why)} |`,
  );
  return [header, sep, ...rows].join('\n') + '\n';
}

function formatQuestions(questions: string[]): string {
  if (questions.length === 0) return '_No suggested questions._\n';
  return questions.map((q, i) => `${i + 1}. ${q}`).join('\n') + '\n';
}

export function renderReport(
  graph: DirectedGraph,
  analysis: BasicAnalysis,
  opts: ReportOptions = {},
): string {
  const timestamp = new Date().toISOString();
  const godTable = formatGodNodesTable(analysis.godNodes);
  const communitySection = opts.communities
    ? formatCommunitiesTable(opts.communities)
    : '_Phase 03 will populate._\n';
  const surprisesSection = opts.surprises
    ? formatSurprisesTable(opts.surprises)
    : '_Phase 03 will populate._\n';
  const questionsSection = opts.questions
    ? formatQuestions(opts.questions)
    : '_Phase 03 will populate._\n';

  return [
    '# graphify-ts — Graph Report',
    `Generated: ${timestamp}`,
    '',
    '## Summary',
    `- Files: ${analysis.fileCount} | Nodes: ${analysis.nodeCount} | Edges: ${analysis.edgeCount}`,
    '',
    '## God Nodes (Top 10 by Connections)',
    godTable,
    '## Communities (Louvain)',
    communitySection,
    '## Surprising Connections',
    surprisesSection,
    '## Suggested Questions',
    questionsSection,
    '## Token Benchmark',
    '_Phase 04 will populate._',
    '',
  ].join('\n');
}
