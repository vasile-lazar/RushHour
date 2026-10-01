import { describe, expect, it } from 'vitest'
import { makeGraph, twoWayLine } from '../../testing/graphs'
import { NO_SIGNALS } from '../ports'
import { isDrivable } from '../roadRules'
import { TrafficSignals } from '../signals/TrafficSignals'
import { PriorityJunctions } from './PriorityJunctions'

// A main road n0 - n1 - n2 with a side road arriving from n3. The junction is n1.
const tJunction = (sideClass = 'residential', mainClass = 'primary') =>
    makeGraph(
        [[-100, 0], [0, 0], [100, 0], [0, -100]],
        [
            { from: 0, to: 1, roadClass: mainClass }, // 0: main road heading east
            { from: 1, to: 0, roadClass: mainClass }, // 1
            { from: 1, to: 2, roadClass: mainClass }, // 2
            { from: 2, to: 1, roadClass: mainClass }, // 3: main road heading west
            { from: 3, to: 1, roadClass: sideClass }, // 4: side road heading north
            { from: 1, to: 3, roadClass: sideClass } // 5
        ]
    )

// Two streets of equal rank crossing at node 0
// (edges 0-3 arrive from the east, west, north and south)
const crossing = (signalNodes: number[] = []) =>
    makeGraph(
        [[0, 0], [100, 0], [-100, 0], [0, 100], [0, -100]],
        [{ from: 1, to: 0 }, { from: 2, to: 0 }, { from: 3, to: 0 }, { from: 4, to: 0 }],
        signalNodes
    )

// A roundabout ring r0 -> r1 -> r2 -> r3 -> r0 (edges 0-3), with an entry road arriving
// at r0 (edge 4) and an exit leaving from it (edge 5)
const roundabout = () =>
    makeGraph(
        [[20, 0], [0, 20], [-20, 0], [0, -20], [60, 0]],
        [
            { from: 0, to: 1, roadClass: 'primary', roundabout: true },
            { from: 1, to: 2, roadClass: 'primary', roundabout: true },
            { from: 2, to: 3, roadClass: 'primary', roundabout: true },
            { from: 3, to: 0, roadClass: 'primary', roundabout: true },
            { from: 4, to: 0, roadClass: 'residential' },
            { from: 0, to: 4, roadClass: 'residential' }
        ]
    )

describe('PriorityJunctions', () => {
    it('makes a side road give way to both directions of the main road', () => {
        const junctions = new PriorityJunctions(tJunction(), isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(4)).toEqual({ higher: [0, 3], equal: [] })
    })

    it('gives the main road priority, and lets its two directions pass each other', () => {
        const junctions = new PriorityJunctions(tJunction(), isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(0)).toBeUndefined()
        expect(junctions.conflictsOf(3)).toBeUndefined()
    })

    it('gives way to traffic from the right where equal roads meet', () => {
        const junctions = new PriorityJunctions(tJunction('residential', 'residential'), isDrivable, NO_SIGNALS)
        // edge 0 (heading east) has the side road (edge 4) on its right, so it gives way to it
        expect(junctions.conflictsOf(0)).toEqual({ higher: [], equal: [4] })
        // edge 4 (heading north) has edge 3 (heading west) on its right
        expect(junctions.conflictsOf(4)).toEqual({ higher: [], equal: [3] })
        // edge 3 (heading west) has the side road on its left, so nothing to give way to
        expect(junctions.conflictsOf(3)).toBeUndefined()
    })

    it('makes every street at a crossing give way to the one on its right', () => {
        const junctions = new PriorityJunctions(crossing(), isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(0)).toEqual({ higher: [], equal: [2] }) // from east, gives way to north
        expect(junctions.conflictsOf(2)).toEqual({ higher: [], equal: [1] }) // from north, gives way to west
    })

    it('has no rules at a bend, where there is only one road', () => {
        const bend = twoWayLine([[0, 0], [100, 0], [100, 100]])
        const junctions = new PriorityJunctions(bend, isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(0)).toBeUndefined()
        expect(junctions.conflictsOf(3)).toBeUndefined()
    })

    it('leaves junctions with traffic lights to the lights', () => {
        const graph = crossing([0])
        const signals = new TrafficSignals(graph, isDrivable, () => 0)
        const junctions = new PriorityJunctions(graph, isDrivable, signals)
        expect(junctions.conflictsOf(0)).toBeUndefined()
        expect(junctions.conflictsOf(2)).toBeUndefined()
    })

    it('ignores roads that vehicles are not allowed to use', () => {
        const junctions = new PriorityJunctions(tJunction('service'), isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(0)).toBeUndefined()
        expect(junctions.conflictsOf(4)).toBeUndefined()
    })

    it('makes vehicles entering a roundabout give way to the ring', () => {
        const junctions = new PriorityJunctions(roundabout(), isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(4)).toEqual({ higher: [3], equal: [] })
        expect(junctions.conflictsOf(3)).toBeUndefined() // the ring has priority
    })

    it('knows which ring edge comes before each ring edge', () => {
        const junctions = new PriorityJunctions(roundabout(), isDrivable, NO_SIGNALS)
        expect(junctions.upstreamOf(3)).toBe(2)
        expect(junctions.upstreamOf(0)).toBe(3)
        expect(junctions.upstreamOf(4)).toBe(-1) // not a ring edge
    })
})