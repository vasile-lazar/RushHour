import { describe, expect, it } from 'vitest'
import { makeGraph } from '../../testing/graphs'
import { isDrivable } from '../roadRules'
import { TrafficSignals } from './TrafficSignals'

// edges 0 (from east) and 1 (from west) run along one axis, 2 (from north) and 3 (from south) across it
const plus = (roadClassOfNorthSouth = 'residential') =>
    makeGraph(
        [[0, 0], [100, 0], [-100, 0], [0, 100], [0, -100]],
        [
            { from: 1, to: 0 },
            { from: 2, to: 0 },
            { from: 3, to: 0, roadClass: roadClassOfNorthSouth },
            { from: 4, to: 0, roadClass: roadClassOfNorthSouth }
        ],
        [0]
    )

describe('TrafficSignals', () => {
    it('gives each axis its own turn', () => {
        const signals = new TrafficSignals(plus(), isDrivable, () => 0)

        expect(signals.stateOf(0, 0)).toBe('green')
        expect(signals.stateOf(1, 0)).toBe('green')
        expect(signals.stateOf(2, 0)).toBe('red')
        expect(signals.stateOf(3, 0)).toBe('red')

        expect(signals.stateOf(0, 34)).toBe('red')
        expect(signals.stateOf(2, 34)).toBe('green')
    })

    it('shows yellow, then an all-red gap, before switching', () => {
        const signals = new TrafficSignals(plus(), isDrivable, () => 0)

        expect(signals.stateOf(0, 31)).toBe('yellow')
        expect(signals.stateOf(0, 33.5)).toBe('red')
        expect(signals.stateOf(2, 33.5)).toBe('red')
    })

    it('repeats every cycle', () => {
        const signals = new TrafficSignals(plus(), isDrivable, () => 0)
        expect(signals.stateOf(0, 68)).toBe('green')
        expect(signals.stateOf(2, 68 + 34)).toBe('green')
    })

    it('starts junctions at different points of the cycle', () => {
        const signals = new TrafficSignals(plus(), isDrivable, () => 0.5) // half a cycle in
        expect(signals.stateOf(0, 0)).toBe('red')
        expect(signals.stateOf(2, 0)).toBe('green')
    })

    it('lists the controlled approaches', () => {
        const signals = new TrafficSignals(plus(), isDrivable, () => 0)
        expect([...signals.approaches].sort()).toEqual([0, 1, 2, 3])
    })

    it('needs no signal where every approach runs along the same axis', () => {
        // a straight two-way road with a "signal" in the middle, like a pedestrian crossing
        const straight = makeGraph(
            [[0, 0], [100, 0], [200, 0]],
            [{ from: 0, to: 1 }, { from: 1, to: 0 }, { from: 1, to: 2 }, { from: 2, to: 1 }],
            [1]
        )
        const signals = new TrafficSignals(straight, isDrivable, () => 0)

        expect(signals.approaches).toEqual([])
        expect(signals.stateOf(0, 50)).toBe('green')
    })

    it('ignores approaches vehicles are not allowed to use', () => {
        const signals = new TrafficSignals(plus('service'), isDrivable, () => 0)
        expect(signals.approaches).toEqual([]) // only one axis is left, so nothing crosses
    })
})