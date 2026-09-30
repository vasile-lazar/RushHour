import { buildAdjacency, buildIncoming } from '../../graph/adjacency'
import { endHeading } from '../../graph/geometry'
import type { RoadGraph } from '../../graph/types'
import type { Conflicts, EdgeFilter, JunctionControl, SignalControl } from '../ports'
import { roadRank } from '../roadRules'

/** Approaches meeting head-on (within this angle) do not cross each other's path. */
const ONCOMING_RAD = Math.PI / 6
/** A junction needs at least this many distinct neighbouring nodes; fewer is just a bend. */
const MIN_NEIGHBOURS = 3

/** The angle between two directions, from 0 to π. */
function angleBetween(a: number, b: number): number {
    const difference = Math.abs(a - b) % (2 * Math.PI)
    return Math.min(difference, 2 * Math.PI - difference)
}

export class PriorityJunctions implements JunctionControl {
    private readonly conflicts: Array<Conflicts | undefined>

    constructor(graph: RoadGraph, canDrive: EdgeFilter, signals: SignalControl) {
        this.conflicts = new Array<Conflicts | undefined>(graph.edges.length)
        const signalled = new Set<number>(signals.approaches)
        const incoming = buildIncoming(graph)
        const outgoing = buildAdjacency(graph)

        graph.nodes.forEach((_, node) => {
            const approaches = incoming[node].filter((edge) => canDrive(graph.edges[edge]))
            if (approaches.length < 2) return
            if (approaches.some((edge) => signalled.has(edge))) return // the lights decide here

            // A bend or a straight stretch has only two neighbours: nothing to give way to
            const neighbours = new Set<number>()
            for (const edge of approaches) neighbours.add(graph.edges[edge].from)
            for (const edge of outgoing[node]) {
                if (canDrive(graph.edges[edge])) neighbours.add(graph.edges[edge].to)
            }
            if (neighbours.size < MIN_NEIGHBOURS) return

            const headings = approaches.map((edge) => endHeading(graph.edges[edge].geometry))
            const ranks = approaches.map((edge) => roadRank(graph.edges[edge].roadClass))

            approaches.forEach((edge, i) => {
                const higher: number[] = []
                const equal: number[] = []
                approaches.forEach((other, j) => {
                    if (i === j) return
                    // An oncoming approach travels the opposite way, so their paths do not cross
                    if (angleBetween(headings[i], headings[j] + Math.PI) < ONCOMING_RAD) return
                    if (ranks[j] > ranks[i]) higher.push(other)
                    else if (ranks[j] === ranks[i]) equal.push(other)
                })
                if (higher.length > 0 || equal.length > 0) this.conflicts[edge] = { higher, equal }
            })
        })
    }

    conflictsOf(edge: number): Conflicts | undefined {
        return this.conflicts[edge]
    }
}