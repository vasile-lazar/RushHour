import { describe, expect, it } from 'vitest'
import { makeGraph } from '../testing/graphs'
import { createSimulation } from './createSimulation'
import {NO_JUNCTION_RULES, NO_PATH_RULES, NO_SIGNALS, NO_TURN_RULES, RoutePlanner} from "@core/sim/ports";
import {TurnLaneGuide} from "@core/sim/lanes/TurnLaneGuide";
import {Simulation} from "@core/sim/Simulation";
import {createRng} from "@core/util/random";
import {IdmModel} from "@core/sim/models/Idm";

// One long straight road with two lanes in each section
const road = makeGraph(
    [[0, 0], [400, 0], [800, 0]],
    [{ from: 0, to: 1, lanes: 2 }, { from: 1, to: 2, lanes: 2 }]
)

// A two-lane road arriving from the west at a junction with a way north (left) and east (straight)
const junction = makeGraph(
    [[0, 0], [-300, 0], [0, 300], [300, 0]],
    [{ from: 1, to: 0, lanes: 2 }, { from: 0, to: 2 }, { from: 0, to: 3 }]
)


/** Speed ratio of a vehicle at 10 m/s, 10 m behind a slow vehicle, after one step. */
function followerRatio(followerLane: number): number {
    const sim = createSimulation(road, {
        vehicleCount: 0,
        seed: 1,
        signals: false,
        junctions: false,
        turns: false,
        lanes: false,
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

/** The lane a vehicle starting in `startLane` is in after 15 s, when its route continues onto `exit`. */
function laneAfterDriving(startLane: number, exit: number): number {
    const planner: RoutePlanner = {
        randomStart: () => 0,
        plan: (start) => (start === 0 ? [0, exit] : [start])
    }
    const guide = new TurnLaneGuide(junction, () => true, NO_JUNCTION_RULES)
    const sim = new Simulation(
        junction, planner, createRng(1), new IdmModel(),
        NO_SIGNALS, NO_JUNCTION_RULES, NO_TURN_RULES, NO_PATH_RULES, guide
    )
    sim.addVehicle(0, 50, 5, startLane)
    for (let i = 0; i < 150; i++) sim.step(0.1)
    const out = new Uint8Array(1)
    sim.writeLanes(out)
    return out[0]
}

describe('lane changing', () => {
    it('moves into the left lane before a left turn', () => {
        expect(laneAfterDriving(1, 1)).toBe(0)
    })

    it('moves into the right lane before going straight', () => {
        expect(laneAfterDriving(0, 2)).toBe(1)
    })

    it('stays in a lane that already fits', () => {
        expect(laneAfterDriving(0, 1)).toBe(0)
        expect(laneAfterDriving(1, 2)).toBe(1)
    })
})