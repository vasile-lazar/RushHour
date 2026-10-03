import { describe, expect, it } from 'vitest'
import { makeGraph } from '../../testing/graphs'
import { createRng } from '../../util/random'
import { RandomWalkPlanner } from './RandomWalkPlanner'

const all = () => true

// Road 0 arrives at node 1 heading east. From there: 1 goes north (a left turn of 90°),
// 2 goes back almost the way it came (a sharp left of about 174°), 3 goes south (a right turn)
const junction = () =>
    makeGraph(
        [[0, 0], [100, 0], [100, 100], [0, 10], [100, -100]],
        [
            { from: 0, to: 1 },
            { from: 1, to: 2 },
            { from: 1, to: 3 },
            { from: 1, to: 4 }
        ]
    )

describe('RandomWalkPlanner turn limits', () => {
    it('never takes a left turn that is too sharp when another way exists', () => {
        const planner = new RandomWalkPlanner(junction(), all, 2)
        const seconds = new Set<number>()
        for (let seed = 1; seed <= 100; seed++) seconds.add(planner.plan(0, createRng(seed))[1])
        expect(seconds.has(2)).toBe(false)
        expect(seconds.has(1)).toBe(true)
        expect(seconds.has(3)).toBe(true)
    })

    it('takes the sharp turn when it is the only way', () => {
        const graph = makeGraph(
            [[0, 0], [100, 0], [0, 10]],
            [{ from: 0, to: 1 }, { from: 1, to: 2 }]
        )
        const planner = new RandomWalkPlanner(graph, all, 2)
        expect(planner.plan(0, createRng(1))).toEqual([0, 1])
    })
})