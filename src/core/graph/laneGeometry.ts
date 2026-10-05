/** Width of one lane in meters, shared by the simulation output and the renderer. */
export const LANE_WIDTH_M = 3.2
/**
 * Vehicles stop this far before the junction node, where the crossing road begins.
 * Keep it below NEAR_JUNCTION_M in Simulation.ts, or waiting vehicles stop counting as "at the junction".
 */
export const STOP_LINE_M = 7

/**
 * How far to the right of the edge's centre line (in the direction of travel) the middle
 * of a lane is. Lane 0 is the leftmost, so it sits right beside the centre line and
 * opposite directions of a two-way road never overlap.
 */
export function laneCentre(lane: number): number {
    return (lane + 0.5) * LANE_WIDTH_M
}