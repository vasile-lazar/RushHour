import type { RoadGraph } from './types'

/** For every node, the indices of the edges that leave it. */
export function buildAdjacency(graph: RoadGraph): number[][] {
    const outgoing: number[][] = graph.nodes.map(() => [])
    graph.edges.forEach((edge, index) => outgoing[edge.from].push(index))
    return outgoing
}