import { endHeading, startHeading } from '../../graph/geometry'
import type { RoadGraph } from '../../graph/types'

const TWO_PI = 2 * Math.PI
/** How far a lane sits beside its road's axis, seen from the junction centre (rad). */
const LANE_OFFSET_RAD = 0.05

function normalize(angle: number): number {
    return ((angle % TWO_PI) + TWO_PI) % TWO_PI
}

/**
 * Treats a junction as a circle. Every vehicle enters at one point of it and leaves at
 * another, and two paths cross exactly when their chords interleave around the circle.
 * Only angles matter, so any junction shape works.
 */
export class Movements {
    /** Per edge: where it enters the junction at its end (angle around the junction) */
    private readonly entry: Float64Array
    /** Per edge: where it leaves the junction at its start */
    private readonly exit: Float64Array

    /** Set `drivesOnRight` to false for left-hand traffic. */
    constructor(graph: RoadGraph, drivesOnRight = true) {
        const side = drivesOnRight ? 1 : -1
        // Driving on the right, the arriving lane lies counter-clockwise of the road's axis
        // and the departing lane clockwise (seen from the junction centre)
        this.entry = Float64Array.from(graph.edges, (edge) =>
            normalize(endHeading(edge.geometry) + Math.PI + side * LANE_OFFSET_RAD)
        )
        this.exit = Float64Array.from(graph.edges, (edge) =>
            normalize(startHeading(edge.geometry) - side * LANE_OFFSET_RAD)
        )
    }

    /** Do the paths from→to (A) and from→to (B) cross, or merge into the same road? */
    cross(fromA: number, toA: number, fromB: number, toB: number): boolean {
        if (fromA === fromB) return false // same approach: they split, single file
        if (toA === toB) return true // merge
        const low = Math.min(this.entry[fromA], this.exit[toA])
        const high = Math.max(this.entry[fromA], this.exit[toA])
        const inside = (angle: number): boolean => angle > low && angle < high
        return inside(this.entry[fromB]) !== inside(this.exit[toB])
    }
}