import { buildAdjacency } from '../../graph/adjacency'
import { endHeading, startHeading, wrapAngle } from '../../graph/geometry'
import type { RoadGraph } from '../../graph/types'
import type { EdgeFilter, JunctionControl, LaneGuide } from '../ports'
import { allowedLanes, exitLane, turnOf, type Turn } from './LaneRules'

interface Offer {
    left: boolean
    right: boolean
    /** How many roads a vehicle can leave by (not counting a U-turn) */
    exits: number
}

export class TurnLaneGuide implements LaneGuide {
    private readonly graph: RoadGraph
    private readonly canDrive: EdgeFilter
    private readonly junctions: JunctionControl
    private readonly outgoing: number[][]
    private readonly endHeadings: Float64Array
    private readonly startHeadings: Float64Array
    private readonly allowed = new Map<number, readonly number[]>()
    private readonly offers = new Map<number, Offer>()

    constructor(graph: RoadGraph, canDrive: EdgeFilter, junctions: JunctionControl) {
        this.graph = graph
        this.canDrive = canDrive
        this.junctions = junctions
        this.outgoing = buildAdjacency(graph)
        this.endHeadings = Float64Array.from(graph.edges, (edge) => endHeading(edge.geometry))
        this.startHeadings = Float64Array.from(graph.edges, (edge) => startHeading(edge.geometry))
    }

    lanesFor(edge: number, exit: number | undefined): readonly number[] | undefined {
        if (exit === undefined) return undefined
        const from = this.graph.edges[edge]
        const to = this.graph.edges[exit]
        const count = Math.max(1, from.lanes)
        if (count < 2 || from.roundabout || to.roundabout) return undefined
        const offer = this.offerAfter(edge)
        if (offer.exits < 2) return undefined // a bend or a straight stretch: any lane

        const key = edge * this.graph.edges.length + exit
        let lanes = this.allowed.get(key)
        if (!lanes) {
            lanes = allowedLanes(count, this.turn(edge, exit), offer)
            this.allowed.set(key, lanes)
        }
        return lanes
    }

    laneAfter(from: number, to: number, fromLane: number): number {
        const count = Math.max(1, this.graph.edges[to].lanes)
        const source = this.graph.edges[from]
        if (source.roundabout || this.graph.edges[to].roundabout) return Math.min(fromLane, count - 1)
        if (this.offerAfter(from).exits < 2) return Math.min(fromLane, count - 1)
        return exitLane(this.turn(from, to), fromLane, count)
    }

    private turn(from: number, to: number): Turn {
        return turnOf(wrapAngle(this.startHeadings[to] - this.endHeadings[from]))
    }

    /** Which turns the junction at the end of `edge` offers, looking through links inside a split junction. */
    private offerAfter(edge: number): Offer {
        const known = this.offers.get(edge)
        if (known) return known

        const offer: Offer = { left: false, right: false, exits: 0 }
        const origin = this.graph.edges[edge]
        const seen = new Set<number>([origin.to])
        const visit = (node: number): void => {
            for (const out of this.outgoing[node]) {
                const leaving = this.graph.edges[out]
                if (!this.canDrive(leaving) || leaving.to === origin.from) continue
                if (this.junctions.isInternal(out)) {
                    if (!seen.has(leaving.to)) {
                        seen.add(leaving.to)
                        visit(leaving.to)
                    }
                    continue
                }
                offer.exits++
                const turn = this.turn(edge, out)
                if (turn === 'left') offer.left = true
                if (turn === 'right') offer.right = true
            }
        }
        visit(origin.to)
        this.offers.set(edge, offer)
        return offer
    }
}