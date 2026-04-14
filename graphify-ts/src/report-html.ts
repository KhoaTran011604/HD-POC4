// report-html.ts — render GRAPH_REPORT as HTML with dark/light theme toggle
// Mirrors the same data as report.ts but outputs a self-contained .html file
import type { DirectedGraph } from 'graphology';
import type { BasicAnalysis, GodNode, SurprisingConnection } from './analyze.js';
import type { Community } from './cluster.js';
import type { ReportOptions } from './report.js';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function godNodesTable(nodes: GodNode[]): string {
  if (nodes.length === 0) return '<p><em>No god nodes found.</em></p>';
  const rows = nodes
    .map((n, i) => `<tr><td>${i + 1}</td><td>${escHtml(n.label)}</td><td>${escHtml(n.type)}</td><td>${n.degree}</td><td>${escHtml(n.source_file)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>Rank</th><th>Node</th><th>Type</th><th>Connections</th><th>File</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function communitiesTable(communities: Community[]): string {
  if (communities.length === 0) return '<p><em>Insufficient edges for clustering.</em></p>';
  const rows = communities
    .map((c) => `<tr><td>${c.id}</td><td>${escHtml(c.label)}</td><td>${c.memberCount}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>ID</th><th>Label</th><th>Members</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function surprisesTable(surprises: SurprisingConnection[]): string {
  if (surprises.length === 0) return '<p><em>No cross-community edges found.</em></p>';
  const rows = surprises
    .map((s) => `<tr><td>${escHtml(s.source)}</td><td>${escHtml(s.target)}</td><td>${escHtml(s.relation)}</td><td>${escHtml(s.confidence)}</td><td>${escHtml(s.why)}</td></tr>`)
    .join('');
  return `<table><thead><tr><th>From</th><th>To</th><th>Relation</th><th>Confidence</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function questionsList(questions: string[]): string {
  if (questions.length === 0) return '<p><em>No suggested questions.</em></p>';
  const items = questions.map((q) => `<li>${escHtml(q)}</li>`).join('');
  return `<ol>${items}</ol>`;
}

const STYLES = `
  :root { --bg: #ffffff; --fg: #1a1a1a; --border: #ddd; --accent: #0066cc; --code-bg: #f5f5f5; --th-bg: #f0f0f0; }
  [data-theme="dark"] { --bg: #1e1e1e; --fg: #d4d4d4; --border: #444; --accent: #4da6ff; --code-bg: #2d2d2d; --th-bg: #2a2a2a; }
  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; margin: 0; padding: 24px 32px; transition: background .2s, color .2s; }
  h1 { font-size: 1.6rem; margin-bottom: 4px; }
  h2 { font-size: 1.1rem; margin-top: 32px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  p, li { line-height: 1.6; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 16px; font-size: .9rem; }
  th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
  th { background: var(--th-bg); font-weight: 600; }
  tr:hover td { background: var(--code-bg); }
  code { background: var(--code-bg); padding: 2px 5px; border-radius: 3px; font-size: .9em; }
  .meta { color: #888; font-size: .85rem; margin-bottom: 24px; }
  .toggle-btn {
    position: fixed; top: 16px; right: 20px;
    background: var(--code-bg); border: 1px solid var(--border); color: var(--fg);
    padding: 6px 14px; border-radius: 20px; cursor: pointer; font-size: .85rem;
    transition: background .2s;
  }
  .toggle-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .stat { display: inline-block; margin-right: 20px; }
  .stat strong { color: var(--accent); }
`;

const TOGGLE_SCRIPT = `
  const btn = document.getElementById('theme-toggle');
  const root = document.documentElement;
  const stored = localStorage.getItem('graphify-theme');
  if (stored) { root.setAttribute('data-theme', stored); btn.textContent = stored === 'dark' ? '☀ Light' : '🌙 Dark'; }
  btn.addEventListener('click', () => {
    const isDark = root.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('graphify-theme', next);
    btn.textContent = next === 'dark' ? '☀ Light' : '🌙 Dark';
  });
`;

export function renderReportHtml(
  graph: DirectedGraph,
  analysis: BasicAnalysis,
  opts: ReportOptions = {},
): string {
  const timestamp = new Date().toISOString();
  const { communities = [], surprises = [], questions = [] } = opts;

  const body = `
    <button class="toggle-btn" id="theme-toggle">🌙 Dark</button>
    <h1>graphify-ts — Knowledge Graph Report</h1>
    <p class="meta">Generated: ${escHtml(timestamp)}</p>

    <p>
      <span class="stat">Nodes: <strong>${graph.order}</strong></span>
      <span class="stat">Edges: <strong>${graph.size}</strong></span>
      <span class="stat">Communities: <strong>${communities.length}</strong></span>
    </p>

    <h2>God Nodes</h2>
    ${godNodesTable(analysis.godNodes)}

    <h2>Communities</h2>
    ${communitiesTable(communities)}

    <h2>Surprising Cross-Community Connections</h2>
    ${surprisesTable(surprises)}

    <h2>Suggested Questions</h2>
    ${questionsList(questions)}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>graphify-ts — Graph Report</title>
  <style>${STYLES}</style>
</head>
<body>
${body}
<script>${TOGGLE_SCRIPT}</script>
</body>
</html>`;
}
