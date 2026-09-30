import { describe, expect, it } from 'vitest'
import type { RoadGraph } from '../graph/types'
import { makeGraph, twoWayLine } from '../testing/graphs'
import { createSimulation } from './createSimulation'
import { IdmModel } from './models/Idm'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation, VEHICLE_LENGTH_M } from './Simulation'

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