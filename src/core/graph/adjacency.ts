import type { RoadGraph } from './types'

/** For every node, the indices of the edges that leave it. */
export function buildAdjacency(graph: RoadGraph): number[][] {
    const outgoing: number[][] = graph.nodes.map(() => [])
    graph.edges.forEach((edge, index) => outgoing[edge.from].push(index))
    return outgoing
}

/** For every node, the indices of the edges that arrive at it. */
export function buildIncoming(graph: RoadGraph): number[][] {
    const incoming: number[][] = graph.nodes.map(() => [])
    graph.edges.forEach((edge, index) => incoming[edge.to].push(index))
    return incoming
}