import { describe, expect, it } from 'vitest'
import { makeGraph } from '../../testing/graphs'
import { JunctionStats } from './JunctionStats'

describe('JunctionStats', () => {
    const graph = makeGraph([[0, 0], [100, 0], [200, 0]], [{ from: 0, to: 1 }, { from: 1, to: 2 }])
    // Nodes 1 and 2 form one junction (cluster 1)
    const clusters = Int32Array.from([0, 1, 1])

    it('adds up delay and passes per junction cluster', () => {
        const stats = new JunctionStats(graph, clusters)
        stats.delayed(1, 0.5)
        stats.delayed(2, 0.5)
        stats.endStep()
        stats.passed(2)

        const [top] = stats.top(5)
        expect(top.id).toBe(1)
        expect(top.x).toBe(100)
        expect(top.delay).toBeCloseTo(1)
        expect(top.passed).toBe(1)
        expect(top.average).toBeCloseTo(1) // 1 s of delay over 1 vehicle
        expect(top.maxQueue).toBe(2) // two vehicles delayed in the same step
    })

    it('ranks the worst junction first and ignores those without delay', () => {
        const stats = new JunctionStats(graph, Int32Array.from([0, 1, 2]))
        stats.delayed(1, 1)
        stats.delayed(2, 5)
        stats.endStep()
        expect(stats.top(5).map((row) => row.id)).toEqual([2, 1])
    })
})