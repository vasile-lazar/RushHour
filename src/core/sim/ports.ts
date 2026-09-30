import type { GraphEdge } from '../graph/types'
import type { Rng } from '../util/random'

export type { Rng }

/** Decides whether vehicles are allowed to drive on an edge. */
export type EdgeFilter = (edge: GraphEdge) => boolean

/** Decides where vehicles start and which roads they follow. */
export interface RoutePlanner {
    /** A random edge where a vehicle can appear. */
    randomStart(rng: Rng): number
    /** A route (edge indices) beginning with `startEdge`. Length 1 means a dead end. */
    plan(startEdge: number, rng: Rng): number[]
}

/** How a driver reacts to the road and to the vehicle in front. */
export interface CarFollowingModel {
    /**
     * The acceleration (m/s²) the driver wants right now.
     * `gap` is the bumper-to-bumper distance to the vehicle in front in meters
     * (Infinity when there is none) and `leaderSpeed` is that vehicle's speed in m/s.
     * The result is not limited by what a vehicle can physically brake at.
     */
    acceleration(speed: number, desiredSpeed: number, gap: number, leaderSpeed: number): number
}