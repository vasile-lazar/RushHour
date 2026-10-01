import { buildAdjacency, buildIncoming } from '../../graph/adjacency'
import { endHeading, wrapAngle } from '../../graph/geometry'
import type { RoadGraph } from '../../graph/types'
import type { Conflicts, EdgeFilter, JunctionControl, SignalControl } from '../ports'
import { roadRank } from '../roadRules'

/** Approaches meeting head-on (within this angle) do not cross each other's path. */
const ONCOMING_RAD = Math.PI / 6
/** A junction needs at least this many distinct neighbouring nodes; fewer is just a bend. */
const MIN_NEIGHBOURS = 3
/** Priority of a roundabout ring: above every ordinary road. */
const RING_RANK = 100

export class PriorityJunctions implements JunctionControl {
    private readonly conflicts: Array<Conflicts | undefined>
    /** Per roundabout edge: the ring edge just before it (-1 for every other edge) */
    private readonly upstream: Int32Array

    constructor(graph: RoadGraph, canDrive: EdgeFilter, signals: SignalControl) {
        this.conflicts = new Array<Conflicts | undefined>(graph.edges.length)
        this.upstream = new Int32Array(graph.edges.length).fill(-1)
        const signalled = new Set<number>(signals.approaches)
        const incoming = buildIncoming(graph)
        const outgoing = buildAdjacency(graph)

        graph.edges.forEach((edge, index) => {
            if (!edge.roundabout) return
            const before = incoming[edge.from].find((other) => graph.edges[other].roundabout)
            if (before !== undefined) this.upstream[index] = before
        })

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
            const isRing = approaches.map((edge) => graph.edges[edge].roundabout === true)
            const ranks = approaches.map((edge, i) =>
                isRing[i] ? RING_RANK : roadRank(graph.edges[edge].roadClass)
            )

            approaches.forEach((edge, i) => {
                const higher: number[] = []
                const equal: number[] = []
                approaches.forEach((other, j) => {
                    if (i === j) return
                    // Where the other approach comes from, seen from this one: negative is the right
                    // side, positive the left, and near ±π it comes from behind (a merge)
                    const side = wrapAngle(headings[j] + Math.PI - headings[i])
                    // Oncoming traffic does not cross our path, except at a roundabout, where a
                    // vehicle entering always has to cross the ring
                    if (!isRing[i] && !isRing[j] && Math.abs(side) < ONCOMING_RAD) return

                    if (ranks[j] > ranks[i]) {
                        higher.push(other)
                    } else if (ranks[j] === ranks[i] && (side < 0 || side > Math.PI - ONCOMING_RAD)) {
                        // Equal roads: give way to traffic from the right, and to merging traffic
                        equal.push(other)
                    }
                })
                if (higher.length > 0 || equal.length > 0) this.conflicts[edge] = { higher, equal }
            })
        })
    }

    conflictsOf(edge: number): Conflicts | undefined {
        return this.conflicts[edge]
    }

    upstreamOf(edge: number): number {
        return this.upstream[edge]
    }
}