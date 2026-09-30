import { buildAdjacency } from '../../graph/adjacency'
import type { RoadGraph } from '../../graph/types'
import type { EdgeFilter, Rng, RoutePlanner } from '../ports'

export class RandomWalkPlanner implements RoutePlanner {
    private readonly graph: RoadGraph
    private readonly maxEdges: number
    /** Per node: the drivable edges leaving it */
    private readonly outgoing: number[][]
    private readonly startEdges: number[]
    /** cumulativeLength[i] = total length of startEdges[0..i], for picking edges in proportion to length */
    private readonly cumulativeLength: number[] = []

    constructor(graph: RoadGraph, canDrive: EdgeFilter, maxEdges = 60) {
        this.graph = graph
        this.maxEdges = maxEdges
        this.outgoing = buildAdjacency(graph).map((edges) =>
            edges.filter((index) => canDrive(graph.edges[index]))
        )
        this.startEdges = this.outgoing.flat()
        let total = 0
        for (const index of this.startEdges) {
            total += graph.edges[index].length
            this.cumulativeLength.push(total)
        }
        if (this.startEdges.length === 0) {
            throw new Error('There are no drivable roads to simulate')
        }
    }

    randomStart(rng: Rng): number {
        // Longer roads should get proportionally more vehicles
        const target = rng() * this.cumulativeLength[this.cumulativeLength.length - 1]

        // Binary search: the first edge whose cumulative length exceeds the target
        let low = 0
        let high = this.cumulativeLength.length - 1
        while (low < high) {
            const middle = (low + high) >> 1
            if (this.cumulativeLength[middle] > target) high = middle
            else low = middle + 1
        }
        return this.startEdges[low]
    }

    plan(startEdge: number, rng: Rng): number[] {
        const route = [startEdge]
        let current = startEdge

        while (route.length < this.maxEdges) {
            const edge = this.graph.edges[current]
            const options = this.outgoing[edge.to]
            if (options.length === 0) break // dead end with no way out

            // Prefer not to turn straight back, unless that is the only way
            const forward = options.filter((index) => this.graph.edges[index].to !== edge.from)
            const pool = forward.length > 0 ? forward : options

            current = pool[Math.floor(rng() * pool.length)]
            route.push(current)
        }
        return route
    }
}