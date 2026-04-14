// build.ts — merge ExtractionResult[] into a graphology DirectedGraph
import { DirectedGraph } from 'graphology';
import type { ExtractionResult } from './types.js';

export function buildGraph(results: ExtractionResult[]): DirectedGraph {
  const graph = new DirectedGraph();

  for (const r of results) {
    for (const node of r.nodes) {
      graph.mergeNode(node.id, {
        label: node.label,
        type: node.type,
        source_file: node.source_file,
        source_location: node.source_location,
      });
    }
    for (const edge of r.edges) {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
      graph.mergeEdge(edge.source, edge.target, {
        relation: edge.relation,
        confidence: edge.confidence,
      });
    }
  }

  return graph;
}
