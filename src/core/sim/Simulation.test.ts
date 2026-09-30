import { describe, expect, it } from 'vitest'
import type { RoadGraph } from '../graph/types'
import { makeGraph, twoWayLine } from '../testing/graphs'
import { createSimulation } from './createSimulation'
import { IdmModel } from './models/Idm'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation, VEHICLE_LENGTH_M } from './Simulation'
import { TrafficSignals } from './signals/TrafficSignals'
import { PriorityJunctions } from './junctions/PriorityJunctions'
import { NO_JUNCTION_RULES, NO_SIGNALS } from './ports'

// Three points 100 m apart; every edge has a 10 m/s speed limit
const line = twoWayLine([[0, 0], [100, 0], [200, 0]])

/** A simulation whose "random" generator always returns 0: fully predictable. */
function build(graph: RoadGraph, maxRouteEdges = 60): Simulation {
    const planner = new RandomWalkPlanner(graph, isDrivable, maxRouteEdges)
    return new Simulation(graph, planner, () => 0, new IdmModel())
}

function predictable(graph = line, vehicles = 1): Simulation {
    const simulation = build(graph, 5)
    simulation.spawn(vehicles)
    return simulation
}

function positions(simulation: Simulation): Float32Array {
    const out = new Float32Array(simulation.vehicleCount * 2)
    simulation.writePositions(out)
    return out
}

describe('Simulation', () => {
    it('moves vehicles along their edge at the speed limit', () => {
        const simulation = predictable()
        for (let i = 0; i < 3; i++) simulation.step(1)

        const [x, y] = positions(simulation)
        expect(x).toBeCloseTo(30) // 3 s at 10 m/s
        expect(y).toBeCloseTo(0)
        expect(simulation.time).toBeCloseTo(3)
    })

    it('continues onto the next edge of the route', () => {
        const simulation = predictable()
        for (let i = 0; i < 11; i++) simulation.step(1)

        // route is [0, 2, 3, ...]: after 100 m on edge 0, it is 10 m into edge 2
        expect(positions(simulation)[0]).toBeCloseTo(110)
    })

    it('keeps vehicles on the map and never loses any', () => {
        const simulation = predictable(line, 3)
        for (let i = 0; i < 2000; i++) simulation.step(0.1)

        expect(simulation.vehicleCount).toBe(3)
        for (const value of positions(simulation).filter((_, i) => i % 2 === 0)) {
            expect(value).toBeGreaterThanOrEqual(-0.001)
            expect(value).toBeLessThanOrEqual(200.001)
        }
    })

    it('respawns a vehicle that reaches a true dead end', () => {
        const deadEnd = makeGraph([[0, 0], [100, 0]], [{ from: 0, to: 1 }])
        const simulation = predictable(deadEnd)
        simulation.step(10.5) // 105 m on a 100 m road

        expect(simulation.vehicleCount).toBe(1)
        expect(positions(simulation)[0]).toBeCloseTo(0) // reappeared at the start
    })

    it('reports speed relative to the limit', () => {
        const simulation = build(line)
        simulation.addVehicle(0, 0, 5) // half of the 10 m/s limit

        const ratios = new Float32Array(1)
        simulation.writeSpeedRatios(ratios)
        expect(ratios[0]).toBeCloseTo(0.5)
    })
})

describe('car following', () => {
    it('keeps a safe gap behind a leader that starts from standstill', () => {
        const road = makeGraph([[0, 0], [2000, 0]], [{ from: 0, to: 1 }])
        const simulation = build(road)
        simulation.addVehicle(0, 100, 0) // leader, at rest
        simulation.addVehicle(0, 50, 10) // follower, already at speed

        const out = new Float32Array(4)
        let smallestGap = Infinity
        for (let i = 0; i < 600; i++) {
            simulation.step(0.1)
            simulation.writePositions(out)
            smallestGap = Math.min(smallestGap, out[0] - out[2] - VEHICLE_LENGTH_M)
        }

        expect(smallestGap).toBeGreaterThan(1) // never got close to touching
        expect(out[2]).toBeGreaterThan(300) // and the follower did keep driving
    })

    it('slows down gradually for a lower speed limit ahead', () => {
        const graph = makeGraph(
            [[0, 0], [200, 0], [400, 0]],
            [
                { from: 0, to: 1, speedLimit: 20 },
                { from: 1, to: 2, speedLimit: 5 }
            ]
        )
        const simulation = build(graph)
        simulation.addVehicle(0, 0, 20)

        const out = new Float32Array(2)
        let previousX = 0
        let previousSpeed = 20
        let hardestBraking = 0
        for (let i = 0; i < 140; i++) {
            simulation.step(0.1)
            simulation.writePositions(out)
            const speed = (out[0] - previousX) / 0.1
            hardestBraking = Math.max(hardestBraking, (previousSpeed - speed) / 0.1)
            previousX = out[0]
            previousSpeed = speed
        }

        expect(hardestBraking).toBeLessThan(3) // a smooth slowdown, not an emergency stop
        expect(previousSpeed).toBeCloseTo(5, 0) // and it ends at the lower limit
    })
})

describe('createSimulation', () => {
    const town = twoWayLine([[0, 0], [100, 0], [200, 0], [300, 0], [400, 0]])

    function run(seed: number): Float32Array {
        const simulation = createSimulation(town, { vehicleCount: 10, seed })
        for (let i = 0; i < 50; i++) simulation.step(0.5)
        return positions(simulation)
    }

    it('is reproducible for the same seed', () => {
        expect(run(7)).toEqual(run(7))
    })

    it('differs for different seeds', () => {
        expect(run(7)).not.toEqual(run(8))
    })
})

describe('traffic signals', () => {
    // A road from node 0 to node 2, crossed at node 1 by a side road arriving from node 3
    const junction = makeGraph(
        [[0, 0], [200, 0], [400, 0], [200, 100]],
        [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 3, to: 1 }],
        [1]
    )

    /** offsetFraction 0: the main road (edge 0) starts green. 0.5: it starts red for 34 s. */
    function withSignals(offsetFraction: number): Simulation {
        const signals = new TrafficSignals(junction, isDrivable, () => offsetFraction)
        const planner = new RandomWalkPlanner(junction, isDrivable)
        const simulation = new Simulation(junction, planner, () => 0, new IdmModel(), signals)
        simulation.addVehicle(0, 0, 10) // on the main road, at its 10 m/s limit
        return simulation
    }

    function run(simulation: Simulation, seconds: number): number {
        for (let i = 0; i < seconds * 10; i++) simulation.step(0.1)
        return positions(simulation)[0]
    }

    it('drives straight through a green light', () => {
        // green for the first 30 s, and the vehicle reaches the junction after 20 s
        expect(run(withSignals(0), 25)).toBeGreaterThan(240)
    })

    it('stops in front of a red light, then goes when it turns green', () => {
        const simulation = withSignals(0.5) // red until t = 34 s

        const waiting = run(simulation, 32)
        expect(waiting).toBeGreaterThan(190) // it came right up to the line...
        expect(waiting).toBeLessThan(199.5) // ...but did not cross it

        expect(run(simulation, 12)).toBeGreaterThan(210) // green at t = 34 s: it has gone through
    })
})

describe('giving way', () => {
    // A main road from node 0 to node 2 through the junction at node 1, and a side road from node 3
    const tJunction = makeGraph(
        [[-300, 0], [0, 0], [300, 0], [0, -300]],
        [
            { from: 0, to: 1, speedLimit: 14, roadClass: 'primary' },
            { from: 1, to: 2, speedLimit: 14, roadClass: 'primary' },
            { from: 3, to: 1, speedLimit: 10, roadClass: 'residential' }
        ]
    )

    function scenario(rulesOn: boolean): Simulation {
        const planner = new RandomWalkPlanner(tJunction, isDrivable)
        const junctions = rulesOn
            ? new PriorityJunctions(tJunction, isDrivable, NO_SIGNALS)
            : NO_JUNCTION_RULES
        const simulation = new Simulation(tJunction, planner, () => 0, new IdmModel(), NO_SIGNALS, junctions)
        simulation.addVehicle(0, 270, 14) // main road, 30 m from the junction: arrives in about 2 s
        simulation.addVehicle(2, 282, 9) // side road, 18 m from the junction: would arrive at the same time
        return simulation
    }

    it('makes a side-road vehicle wait for traffic on the main road, then go', () => {
        const simulation = scenario(true)
        for (let i = 0; i < 20; i++) simulation.step(0.1) // 2 s
        expect(positions(simulation)[3]).toBeLessThan(-1) // still before the junction (y < 0)

        for (let i = 0; i < 130; i++) simulation.step(0.1) // 15 s in total
        expect(positions(simulation)[2]).toBeGreaterThan(10) // it went through once the road was clear
    })

    it('without the rule the side-road vehicle drives straight through', () => {
        const simulation = scenario(false)
        for (let i = 0; i < 20; i++) simulation.step(0.1)
        expect(positions(simulation)[3]).toBeGreaterThan(-1) // already at the junction
    })
})

describe('equal roads meeting', () => {
    it('lets every vehicle through in turn, without gridlock', () => {
        // Two equal two-way streets crossing at node 0, with 200 m arms
        const crossing = makeGraph(
            [[0, 0], [200, 0], [-200, 0], [0, 200], [0, -200]],
            [
                { from: 1, to: 0 }, { from: 2, to: 0 }, { from: 3, to: 0 }, { from: 4, to: 0 }, // edges 0-3 arrive
                { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3 }, { from: 0, to: 4 } // edges 4-7 leave
            ]
        )
        const planner = new RandomWalkPlanner(crossing, isDrivable)
        const junctions = new PriorityJunctions(crossing, isDrivable, NO_SIGNALS)
        const simulation = new Simulation(crossing, planner, () => 0, new IdmModel(), NO_SIGNALS, junctions)
        for (const arrival of [0, 1, 2, 3]) simulation.addVehicle(arrival, 150, 10) // all 50 m away

        for (let i = 0; i < 300; i++) simulation.step(0.1) // 30 s

        const out = positions(simulation)
        let awayFromCrossing = 0
        for (let i = 0; i < 4; i++) {
            if (Math.hypot(out[2 * i], out[2 * i + 1]) > 10) awayFromCrossing++
        }
        // A gridlock would leave all four vehicles waiting at the crossing
        expect(awayFromCrossing).toBeGreaterThanOrEqual(3)
    })
})