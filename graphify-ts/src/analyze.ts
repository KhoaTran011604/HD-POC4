// analyze.ts — basic graph analysis: god nodes by degree (extended in Phase 03)
import type { DirectedGraph } from 'graphology';

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
