import { describe, expect, it } from 'vitest'
import { makeGraph } from '../testing/graphs'
import { createSimulation } from './createSimulation'

// One long straight road with two lanes in each section
const road = makeGraph(
    [[0, 0], [400, 0], [800, 0]],
    [{ from: 0, to: 1, lanes: 2 }, { from: 1, to: 2, lanes: 2 }]
)

/** Speed ratio of a vehicle at 10 m/s, 10 m behind a slow vehicle, after one step. */
function followerRatio(followerLane: number): number {
    const sim = createSimulation(road, {
        vehicleCount: 0,
        seed: 1,
        signals: false,
        junctions: false,
        turns: false
    })
    sim.addVehicle(0, 90, 0, 0) // slow vehicle in lane 0
    sim.addVehicle(0, 80, 10, followerLane)
    sim.step(0.1)
    const out = new Float32Array(2)
    sim.writeSpeedRatios(out)
    return out[1]
}

describe('lanes', () => {
    it('makes a vehicle brake behind a slow vehicle in its own lane', () => {
        expect(followerRatio(0)).toBeLessThan(0.99)
    })

    it('lets a vehicle in another lane drive past it freely', () => {
        expect(followerRatio(1)).toBeCloseTo(1, 3)
    })
})