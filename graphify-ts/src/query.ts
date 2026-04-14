// query.ts — BFS query engine: term matching → focused subgraph context with token budget
import type { DirectedGraph } from 'graphology';

const CHARS_PER_TOKEN = 4;
const MAX_VISITED = 200;
const MAX_START_NODES = 3;

export interface QueryOptions {
  depth?: number;
  budgetTokens?: number;
  communityFilter?: boolean;
}

export interface QueryResult {
  question: string;
  nodes: Array<{ label: string; type: string; source_file: string; source_location: string }>;
  edges: Array<{ from: string; to: string; relation: string; confidence: string }>;
  tokenEstimate: number;
  contextBlock: string; // pre-formatted text for LLM injection (budget-trimmed)
}

function emptyResult(question: string): QueryResult {
  return { question, nodes: [], edges: [], tokenEstimate: 0, contextBlock: '' };
}

// Trim lines so total chars / CHARS_PER_TOKEN <= budgetTokens
function trimToTokenBudget(lines: string[], budgetTokens: number): string[] {
  const out: string[] = [];
  let chars = 0;
  for (const line of lines) {
    const added = line.length + 1; // +1 for newline
    if (Math.ceil((chars + added) / CHARS_PER_TOKEN) > budgetTokens) break;
    out.push(line);
    chars += added;
  }
  return out;
}

// Manual BFS — traverses both directions (callers + callees) for richer context
function bfsFromNode(
  graph: DirectedGraph,
  startNode: string,
  maxDepth: number,
  visited: Set<string>,
): void {
  // queue entries: [nodeId, depth]
  const queue: Array<[string, number]> = [[startNode, 0]];

  while (queue.length > 0) {
    const [node, depth] = queue.shift()!;
    if (visited.has(node) || visited.size >= MAX_VISITED) continue;
    visited.add(node);
    if (depth >= maxDepth) continue;

    for (const neighbor of graph.neighbors(node)) {
      if (!visited.has(neighbor)) {
        queue.push([neighbor, depth + 1]);
      }
    }
  }
}

export function query(
  question: string,
  graph: DirectedGraph,
  opts: QueryOptions = {},
): QueryResult {
  const { depth = 3, budgetTokens = 2000 } = opts;
  const terms = question.toLowerCase().split(/\s+/).filter((t) => t.length > 2);

  // Find start nodes whose label contains any query term
  const startNodes = graph.nodes().filter((n) => {
    const label = String(graph.getNodeAttribute(n, 'label') ?? '').toLowerCase();
    return terms.some((t) => label.includes(t));
  });

  if (startNodes.length === 0) return emptyResult(question);

  const visited = new Set<string>();

  for (const start of startNodes.slice(0, MAX_START_NODES)) {
    if (visited.size >= MAX_VISITED) break;
    bfsFromNode(graph, start, depth, visited);
  }

  // Collect edges where both endpoints are in visited (deduplicated by edge key)
  const seenEdges = new Set<string>();
  const visitedEdges: Array<{ edgeKey: string; src: string; tgt: string }> = [];

  graph.forEachEdge((edgeKey, _attrs, src, tgt) => {
    if (visited.has(src) && visited.has(tgt) && !seenEdges.has(edgeKey)) {
      seenEdges.add(edgeKey);
      visitedEdges.push({ edgeKey, src, tgt });
    }
  });

  // Serialize to compact text lines
  const lines: string[] = [];
  for (const n of visited) {
    const a = graph.getNodeAttributes(n);
    lines.push(`NODE ${a.label} [${a.type}] ${a.source_file}:${a.source_location}`);
  }
  for (const { edgeKey, src, tgt } of visitedEdges) {
    const attrs = graph.getEdgeAttributes(edgeKey);
    const srcLabel = graph.getNodeAttribute(src, 'label');
    const tgtLabel = graph.getNodeAttribute(tgt, 'label');
    lines.push(`EDGE ${srcLabel} --${attrs.relation}--> ${tgtLabel}`);
  }

  // tokenEstimate = full unrimmed size (useful for benchmark)
  const fullBlock = lines.join('\n');
  const tokenEstimate = Math.ceil(fullBlock.length / CHARS_PER_TOKEN);

  // contextBlock = budget-trimmed for actual LLM injection
  const trimmedLines = trimToTokenBudget(lines, budgetTokens);

  const nodeAttrs = [...visited].map((n) => {
    const a = graph.getNodeAttributes(n);
    return {
      label: String(a.label ?? n),
      type: String(a.type ?? ''),
      source_file: String(a.source_file ?? ''),
      source_location: String(a.source_location ?? ''),
    };
  });

  const edgeAttrs = visitedEdges.map(({ edgeKey, src, tgt }) => {
    const attrs = graph.getEdgeAttributes(edgeKey);
    return {
      from: String(graph.getNodeAttribute(src, 'label') ?? src),
      to: String(graph.getNodeAttribute(tgt, 'label') ?? tgt),
      relation: String(attrs.relation ?? ''),
      confidence: String(attrs.confidence ?? ''),
    };
  });

  return {
    question,
    nodes: nodeAttrs,
    edges: edgeAttrs,
    tokenEstimate,
    contextBlock: trimmedLines.join('\n'),
  };
}
