import { buildIncoming } from '../../graph/adjacency'
import { endHeading } from '../../graph/geometry'
import type { RoadGraph } from '../../graph/types'
import type { EdgeFilter, Rng, SignalControl, SignalState } from '../ports'

export interface SignalTiming {
    /** Seconds of green per phase */
    green: number
    yellow: number
    /** Seconds where everything is red between two phases */
    allRed: number
}

export const DEFAULT_TIMING: SignalTiming = { green: 30, yellow: 3, allRed: 1 }

/** Each junction runs two phases: the approaches along one axis, then those across it. */
const PHASE_COUNT = 2
/** Approaches whose axes differ by less than this share a phase. */
const SAME_AXIS_RAD = Math.PI / 4

/** Reduces a heading to an axis in [0, π), so opposite directions count as the same one. */
function axisOf(heading: number): number {
    return ((heading % Math.PI) + Math.PI) % Math.PI
}

function axisDistance(a: number, b: number): number {
    const difference = Math.abs(a - b)
    return Math.min(difference, Math.PI - difference)
}

export class TrafficSignals implements SignalControl {
    readonly approaches: number[] = []
    private readonly timing: SignalTiming
    private readonly slot: number
    private readonly cycle: number
    /** Per edge: which phase may pass, or -1 if the end of the edge has no signal */
    private readonly phaseOfEdge: Int8Array
    /** Per edge: where in the cycle its junction starts, so signals are not all in step */
    private readonly offsetOfEdge: Float64Array

    constructor(
        graph: RoadGraph,
        canDrive: EdgeFilter,
        rng: Rng,
        timing: SignalTiming = DEFAULT_TIMING
    ) {
        this.timing = timing
        this.slot = timing.green + timing.yellow + timing.allRed
        this.cycle = this.slot * PHASE_COUNT
        this.phaseOfEdge = new Int8Array(graph.edges.length).fill(-1)
        this.offsetOfEdge = new Float64Array(graph.edges.length)

        const incoming = buildIncoming(graph)
        graph.nodes.forEach((node, index) => {
            if (!node.hasSignal) return
            const roads = incoming[index].filter((edge) => canDrive(graph.edges[edge]))
            if (roads.length < 2) return

            // Group the approaches by the axis they arrive along: the first one sets phase 0
            const axes = roads.map((edge) => axisOf(endHeading(graph.edges[edge].geometry)))
            const phases = axes.map((axis) => (axisDistance(axis, axes[0]) < SAME_AXIS_RAD ? 0 : 1))
            if (phases.every((phase) => phase === 0)) return // nothing crosses: no signal needed

            const offset = rng() * this.cycle
            roads.forEach((edge, i) => {
                this.phaseOfEdge[edge] = phases[i]
                this.offsetOfEdge[edge] = offset
                this.approaches.push(edge)
            })
        })
    }

    stateOf(edge: number, time: number): SignalState {
        const phase = this.phaseOfEdge[edge]
        if (phase < 0) return 'green'

        const t = (time + this.offsetOfEdge[edge]) % this.cycle
        const activePhase = Math.floor(t / this.slot)
        if (activePhase !== phase) return 'red'

        const withinSlot = t - activePhase * this.slot
        if (withinSlot < this.timing.green) return 'green'
        if (withinSlot < this.timing.green + this.timing.yellow) return 'yellow'
        return 'red' // the all-red gap before the other phase starts
    }
}