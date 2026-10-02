export type Turn = 'left' | 'straight' | 'right'

/** Which turns the junction at the end of an edge offers from that edge. */
export interface TurnsOffered {
    left: boolean
    right: boolean
}

/** A change of direction larger than this counts as a turn, not a bend. */
const TURN_RAD = Math.PI / 4

/** Classifies a signed turn angle (positive = left, as in Turns). */
export function turnOf(angle: number): Turn {
    if (angle > TURN_RAD) return 'left'
    if (angle < -TURN_RAD) return 'right'
    return 'straight'
}

/** Which turns each lane serves, leftmost lane (0) first. */
function servedBy(laneCount: number, offered: TurnsOffered): Turn[][] {
    if (laneCount === 1) return [['left', 'straight', 'right']]
    const lanes: Turn[][] = []
    for (let i = 0; i < laneCount; i++) {
        if (i === 0) {
            // Where there is no left turn, the left lane goes straight
            lanes.push(offered.left ? ['left'] : ['straight'])
        } else if (i === laneCount - 1) {
            if (laneCount === 2) lanes.push(['straight', 'right'])
            else lanes.push(offered.right ? ['right'] : ['straight'])
        } else {
            lanes.push(['straight'])
        }
    }
    return lanes
}

/** The lanes (0 = leftmost) a vehicle may use at the stop line to make `turn`. */
export function allowedLanes(laneCount: number, turn: Turn, offered: TurnsOffered): number[] {
    const lanes: number[] = []
    servedBy(laneCount, offered).forEach((served, index) => {
        if (served.includes(turn)) lanes.push(index)
    })
    if (lanes.length > 0) return lanes

    // Nothing serves it (a turn the junction does not really offer): use the nearest lane
    if (turn === 'left') return [0]
    if (turn === 'right') return [laneCount - 1]
    return Array.from({ length: laneCount }, (_, index) => index)
}

/** The lane a vehicle enters on the road after the junction. */
export function exitLane(turn: Turn, fromLane: number, exitLaneCount: number): number {
    if (turn === 'left') return 0
    if (turn === 'right') return exitLaneCount - 1
    return Math.min(fromLane, exitLaneCount - 1)
}