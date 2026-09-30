import type { CarFollowingModel } from '../ports'

export interface IdmParams {
    /** Time gap the driver keeps to the vehicle in front (s) */
    timeHeadway: number
    /** Gap kept when standing still (m) */
    minGap: number
    /** Comfortable acceleration (m/s²) */
    maxAcceleration: number
    /** Comfortable braking (m/s²) */
    comfortBraking: number
}

export const DEFAULT_IDM: IdmParams = {
    timeHeadway: 1.5,
    minGap: 2,
    maxAcceleration: 1.5,
    comfortBraking: 2
}

/** The Intelligent Driver Model. */
export class IdmModel implements CarFollowingModel {
    private readonly params: IdmParams

    constructor(params: IdmParams = DEFAULT_IDM) {
        this.params = params
    }

    acceleration(speed: number, desiredSpeed: number, gap: number, leaderSpeed: number): number {
        const { timeHeadway, minGap, maxAcceleration, comfortBraking } = this.params

        // Pull toward the desired speed: strong from standstill, zero at the desired speed
        const freeRoad = 1 - (speed / Math.max(desiredSpeed, 0.1)) ** 4
        if (!Number.isFinite(gap)) return maxAcceleration * freeRoad

        // The gap this driver wants: standstill gap + headway + extra room when closing in fast
        const closingSpeed = speed - leaderSpeed
        const wantedGap =
            minGap +
            Math.max(
                0,
                speed * timeHeadway + (speed * closingSpeed) / (2 * Math.sqrt(maxAcceleration * comfortBraking))
            )

        // Push away from the vehicle in front: grows fast as the gap shrinks
        const interaction = (wantedGap / Math.max(gap, 0.1)) ** 2
        return maxAcceleration * (freeRoad - interaction)
    }
}