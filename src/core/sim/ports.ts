import type { GraphEdge } from '../graph/types'
import type { Rng } from '../util/random'

export type { Rng }

export type SignalState = 'green' | 'yellow' | 'red'

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

export interface SignalControl {
    /** State of the signal at the end of `edge` ('green' if that edge has no signal). */
    stateOf(edge: number, time: number): SignalState
    /** Edges whose end is controlled by a signal. */
    readonly approaches: readonly number[]
}

/** No signals anywhere. */
export const NO_SIGNALS: SignalControl = {
    stateOf: () => 'green',
    approaches: []
}

/** The approaches an edge has to give way to at the junction at its end. */
export interface Conflicts {
    /** Approaches on bigger roads: always have priority */
    readonly higher: readonly number[]
    /** Approaches on equally ranked roads: first come, first served */
    readonly equal: readonly number[]
}

/** Priority rules at junctions without traffic lights. */
export interface JunctionControl {
    /** What `edge` must give way to at its end, or undefined if it has priority there. */
    conflictsOf(edge: number): Conflicts | undefined
    /** For a roundabout edge: the ring edge just before it, or -1. */
    upstreamOf(edge: number): number
    /** True for a short link between the nodes of one split junction. */
    isInternal(edge: number): boolean
}

/** No priority rules: vehicles ignore each other at junctions. */
export const NO_JUNCTION_RULES: JunctionControl = {
    conflictsOf: () => undefined,
    upstreamOf: () => -1,
    isInternal: () => false
}

/** How sharply vehicles turn from one edge onto the next, and whom a turn crosses. */
export interface TurnRules {
    /** A turn sharp enough that drivers slow down for it, in either direction. */
    isSharpTurn(from: number, to: number): boolean
    /** A turn across the path of oncoming traffic (a left turn when driving on the right). */
    crossesOncoming(from: number, to: number): boolean
    /** The approaches that meet `approach` head-on at the end of the edge. */
    oncoming(approach: number): readonly number[]
}

/** Nothing counts as a turn. */
export const NO_TURN_RULES: TurnRules = {
    isSharpTurn: () => false,
    crossesOncoming: () => false,
    oncoming: () => []
}

/** Whether two paths through the same junction cross or merge. */
export interface PathRules {
    cross(fromA: number, toA: number, fromB: number, toB: number): boolean
}

/** Without path rules every pair of paths conflicts, as before. */
export const NO_PATH_RULES: PathRules = { cross: () => true }

/** Which lanes a vehicle must be in for a turn, and which lane it ends up in afterwards. */
export interface LaneGuide {
    /** Lanes (0 = leftmost) from which `exit` can be taken after the junction at the end of `edge`; undefined means any. */
    lanesFor(edge: number, exit: number | undefined): readonly number[] | undefined
    /** The lane a vehicle ends up in on `to`, coming from `fromLane` of `from`. */
    laneAfter(from: number, to: number, fromLane: number): number
}

/** No lane logic: vehicles keep their lane, and never change it. */
export const NO_LANE_GUIDE: LaneGuide = {
    lanesFor: () => undefined,
    laneAfter: (_from, _to, fromLane) => fromLane
}
