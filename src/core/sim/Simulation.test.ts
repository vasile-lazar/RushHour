import { describe, expect, it } from 'vitest'
import { makeGraph, twoWayLine } from '../testing/graphs'
import { createSimulation } from './createSimulation'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation } from './Simulation'

// Three points 100 m apart; every edge has a 10 m/s speed limit
const line = twoWayLine([[0, 0], [100, 0], [200, 0]])

/** A simulation where the "random" generator always returns 0: fully predictable. */
function predictable(graph = line, vehicles = 1): Simulation {
    const simulation = new Simulation(graph, new RandomWalkPlanner(graph, isDrivable, 5), () => 0)
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