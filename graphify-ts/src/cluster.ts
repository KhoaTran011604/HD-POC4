// cluster.ts — Louvain community detection wrapper
import path from 'path';
import louvain from 'graphology-communities-louvain';
import { toUndirected } from 'graphology-operators';
import type { DirectedGraph } from 'graphology';

export type CommunityMap = { [nodeId: string]: number };

export interface Community {
  id: number;
  label: string;
  memberCount: number;
  members: string[];
}

export function cluster(graph: DirectedGraph): CommunityMap {
  if (graph.order === 0) return {};
  const undirected = toUndirected(graph);
  return louvain(undirected, { randomWalk: false });
}

// Derive a human-readable label from the most common source_file basename in members
function labelFromMembers(graph: DirectedGraph, members: string[], cid: number): string {
  const counts: Record<string, number> = {};
  for (const n of members) {
    const sf = String(graph.getNodeAttribute(n, 'source_file') ?? '');
    const base = path.basename(sf, path.extname(sf));
    if (base) counts[base] = (counts[base] ?? 0) + 1;
  }
  return (
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    `Community ${cid}`
  );
}

export function buildCommunities(
  graph: DirectedGraph,
  map: CommunityMap,
): Community[] {
  const ids = [...new Set(Object.values(map))].sort((a, b) => a - b);
  return ids.map((id) => {
    const members = Object.entries(map)
      .filter(([, c]) => c === id)
      .map(([n]) => n);
    return {
      id,
      label: labelFromMembers(graph, members, id),
      memberCount: members.length,
      members,
    };
  });
}
