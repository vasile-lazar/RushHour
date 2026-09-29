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