import { buildIncoming } from '../../graph/adjacency'
import { angleBetween, endHeading, startHeading, wrapAngle } from '../../graph/geometry'
import type { RoadGraph } from '../../graph/types'
import type { TurnRules } from '../ports'

/** A change of direction larger than this counts as a turn, not a bend in the road. */
const TURN_RAD = Math.PI / 4
/** Approaches meeting head-on within this angle are oncoming. */
const ONCOMING_RAD = Math.PI / 6

const NONE: readonly number[] = []

export class Turns implements TurnRules {
    private readonly drivesOnRight: boolean
    private readonly endHeadings: Float64Array
    private readonly startHeadings: Float64Array
    /** Per edge: the other approaches at its end that come from the opposite direction */
    private readonly oncomingOf: Array<number[] | undefined>

    /** Set `drivesOnRight` to false for left-hand traffic: then right turns cross oncoming traffic. */
    constructor(graph: RoadGraph, drivesOnRight = true) {
        this.drivesOnRight = drivesOnRight
        this.endHeadings = Float64Array.from(graph.edges, (edge) => endHeading(edge.geometry))
        this.startHeadings = Float64Array.from(graph.edges, (edge) => startHeading(edge.geometry))
        this.oncomingOf = new Array<number[] | undefined>(graph.edges.length)

        for (const approaches of buildIncoming(graph)) {
            for (const a of approaches) {
                for (const b of approaches) {
                    if (a === b) continue
                    if (angleBetween(this.endHeadings[a], this.endHeadings[b] + Math.PI) < ONCOMING_RAD) {
                        const list = this.oncomingOf[a] ?? []
                        list.push(b)
                        this.oncomingOf[a] = list
                    }
                }
            }
        }
    }

    isSharpTurn(from: number, to: number): boolean {
        return Math.abs(this.turnAngle(from, to)) > TURN_RAD
    }

    crossesOncoming(from: number, to: number): boolean {
        const angle = this.turnAngle(from, to)
        return (this.drivesOnRight ? angle : -angle) > TURN_RAD
    }

    oncoming(approach: number): readonly number[] {
        return this.oncomingOf[approach] ?? NONE
    }

    /** Signed angle of the turn from edge `from` onto edge `to`: positive means to the left. */
    private turnAngle(from: number, to: number): number {
        return wrapAngle(this.startHeadings[to] - this.endHeadings[from])
    }
}