import { describe, expect, it } from 'vitest'
import { makeGraph, twoWayLine } from '../../testing/graphs'
import { isDrivable } from '../roadRules'
import { RandomWalkPlanner } from './RandomWalkPlanner'

const always = () => 0

describe('RandomWalkPlanner', () => {
    it('does not U-turn when it can continue, but turns around at a dead end', () => {
        // edges: 0: n0->n1, 1: n1->n0, 2: n1->n2, 3: n2->n1
        const graph = twoWayLine([[0, 0], [100, 0], [200, 0]])
        const planner = new RandomWalkPlanner(graph, isDrivable, 5)

        // 0 (to n1), then 2 (not 1: that would be a U-turn), then 3 (dead end: turn around), ...
        expect(planner.plan(0, always)).toEqual([0, 2, 3, 1, 0])
    })

    it('stops at a dead end that has no way back', () => {
        const graph = makeGraph([[0, 0], [100, 0]], [{ from: 0, to: 1 }])
        const planner = new RandomWalkPlanner(graph, isDrivable)
        expect(planner.plan(0, always)).toEqual([0])
    })

    it('never uses roads the filter rejects', () => {
        const graph = makeGraph(
            [[0, 0], [100, 0], [200, 0]],
            [{ from: 0, to: 1 }, { from: 1, to: 2, roadClass: 'service' }]
        )
        const planner = new RandomWalkPlanner(graph, isDrivable)
        expect(planner.randomStart(() => 0.99)).toBe(0)
        expect(planner.plan(0, always)).toEqual([0])
    })

    it('refuses to work on a graph with no drivable roads', () => {
        const graph = makeGraph([[0, 0], [10, 0]], [{ from: 0, to: 1, roadClass: 'service' }])
        expect(() => new RandomWalkPlanner(graph, isDrivable)).toThrow('drivable')
    })
    
    it('picks start edges in proportion to their length', () => {
        // one 100 m edge and one 300 m edge, both drivable
        const graph = makeGraph(
            [[0, 0], [100, 0], [100, 300]],
            [{ from: 0, to: 1 }, { from: 1, to: 2 }]
        )
        const planner = new RandomWalkPlanner(graph, isDrivable)

        expect(planner.randomStart(() => 0.1)).toBe(0) // 10% of the way: inside the first 25%
        expect(planner.randomStart(() => 0.5)).toBe(1) // 50% of the way: in the long edge
    })
})