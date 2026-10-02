import type { RoadGraph, GraphEdge } from './types'

/** Drivable edges shorter than this join their two nodes into one junction (m). */
export const LINK_MAX_M = 20

/**
 * Groups nodes that OpenStreetMap split into several close nodes (dual carriageways,
 * offset crossings) into one logical junction. Returns, per node, the id of its cluster:
 * the lowest-numbered-root node of the group, so a lone node is its own cluster.
 * Roundabout rings are never merged: their short edges are the ring itself.
 */
export function buildClusters(
    graph: RoadGraph,
    canDrive: (edge: GraphEdge) => boolean,
    maxLinkM = LINK_MAX_M
): Int32Array {
    const parent = Int32Array.from(graph.nodes, (_, index) => index)
    const find = (node: number): number => {
        let root = node
        while (parent[root] !== root) root = parent[root]
        while (parent[node] !== root) {
            const next = parent[node]
            parent[node] = root
            node = next
        }
        return root
    }
    
    const ring = new Set<number>()
    for (const edge of graph.edges) {
        if (edge.roundabout) {
            ring.add(edge.from)
            ring.add(edge.to)
        }
    }
    
    for (const edge of graph.edges) {
        if (!canDrive(edge) || edge.roundabout || edge.length > maxLinkM) continue
        if (ring.has(edge.from) || ring.has(edge.to)) continue
        const a = find(edge.from)
        const b = find(edge.to)
        if (a !== b) parent[Math.max(a, b)] = Math.min(a, b)
    }
    return Int32Array.from(graph.nodes, (_, index) => find(index))
}