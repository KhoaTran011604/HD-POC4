// analyze.ts — graph analysis: god nodes, surprising connections, suggested questions
import type { DirectedGraph } from 'graphology';
import type { CommunityMap } from './cluster.js';

export interface GodNode {
  id: string;
  label: string;
  type: string;
  degree: number;
  source_file: string;
}

export interface BasicAnalysis {
  godNodes: GodNode[];
  nodeCount: number;
  edgeCount: number;
  fileCount: number;
}

// File-type nodes are the file hub nodes — exclude them from god node ranking
function isFileHub(graph: DirectedGraph, nodeId: string): boolean {
  return graph.getNodeAttributes(nodeId).type === 'file';
}

// Isolated stubs: degree <= 1 and label ends with "()" → exclude
function isIsolatedStub(graph: DirectedGraph, nodeId: string): boolean {
  const attrs = graph.getNodeAttributes(nodeId);
  return graph.degree(nodeId) <= 1 && String(attrs.label).endsWith('()');
}

export function godNodes(graph: DirectedGraph, topN = 10): GodNode[] {
  return graph
    .nodes()
    .filter((n) => !isFileHub(graph, n) && !isIsolatedStub(graph, n))
    .map((n) => {
      const attrs = graph.getNodeAttributes(n);
      return {
        id: n,
        label: String(attrs.label ?? n),
        type: String(attrs.type ?? 'unknown'),
        degree: graph.degree(n),
        source_file: String(attrs.source_file ?? ''),
      };
    })
    .sort((a, b) => b.degree - a.degree)
    .slice(0, topN);
}

export function analyzeBasic(graph: DirectedGraph): BasicAnalysis {
  const fileNodes = graph
    .nodes()
    .filter((n) => graph.getNodeAttributes(n).type === 'file');

  return {
    godNodes: godNodes(graph),
    nodeCount: graph.order,
    edgeCount: graph.size,
    fileCount: fileNodes.length,
  };
}

// ─── Phase 03 extensions ───────────────────────────────────────────────────

export interface SurprisingConnection {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  sourceFile: string;
  targetFile: string;
  why: string;
}

const STRUCTURAL_RELATIONS = new Set(['imports', 'method']);
const MIN_INFERRED_FOR_QUESTION = 2;

export function surprisingConnections(
  graph: DirectedGraph,
  communityMap: CommunityMap,
  topN = 5,
): SurprisingConnection[] {
  const results: SurprisingConnection[] = [];

  graph.forEachEdge((_, attrs, src, tgt) => {
    const rel = String(attrs.relation ?? '');
    if (STRUCTURAL_RELATIONS.has(rel)) return;
    if (isFileHub(graph, src) || isFileHub(graph, tgt)) return;

    const cSrc = communityMap[src];
    const cTgt = communityMap[tgt];
    if (cSrc === undefined || cTgt === undefined || cSrc === cTgt) return;

    const srcFile = String(graph.getNodeAttribute(src, 'source_file') ?? '');
    const tgtFile = String(graph.getNodeAttribute(tgt, 'source_file') ?? '');

    results.push({
      source: String(graph.getNodeAttribute(src, 'label') ?? src),
      target: String(graph.getNodeAttribute(tgt, 'label') ?? tgt),
      relation: rel,
      confidence: String(attrs.confidence ?? ''),
      sourceFile: srcFile,
      targetFile: tgtFile,
      why: `bridges community ${cSrc} → ${cTgt} (${srcFile} ↔ ${tgtFile})`,
    });
  });

  // INFERRED edges first (more interesting), then EXTRACTED
  return results
    .sort(
      (a, b) =>
        (a.confidence === 'INFERRED' ? 0 : 1) -
        (b.confidence === 'INFERRED' ? 0 : 1),
    )
    .slice(0, topN);
}

export function suggestQuestions(
  graph: DirectedGraph,
  communityMap: CommunityMap,
): string[] {
  const qs: string[] = [];

  // Isolated non-hub nodes
  const isolated = graph
    .nodes()
    .filter((n) => graph.degree(n) <= 1 && !isFileHub(graph, n));
  if (isolated.length) {
    const sample = isolated
      .slice(0, 3)
      .map((n) => `\`${String(graph.getNodeAttribute(n, 'label') ?? n)}\``)
      .join(', ');
    qs.push(`What connects ${sample} to the rest of the codebase?`);
  }

  // INFERRED edges that may need human verification
  const inferred = graph
    .edges()
    .filter((e) => graph.getEdgeAttribute(e, 'confidence') === 'INFERRED');
  if (inferred.length >= MIN_INFERRED_FOR_QUESTION) {
    qs.push(
      `Are the ${inferred.length} inferred relationships correct? Verify the top god node's call edges.`,
    );
  }

  // Cross-community question
  const communityIds = [...new Set(Object.values(communityMap))];
  if (communityIds.length > 1) {
    qs.push(
      `Why do communities ${communityIds.slice(0, 2).join(' and ')} exist as separate modules — is the split intentional?`,
    );
  }

  return qs;
}
