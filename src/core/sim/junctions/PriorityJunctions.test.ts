import { describe, expect, it } from 'vitest'
import { makeGraph, twoWayLine } from '../../testing/graphs'
import { NO_SIGNALS } from '../ports'
import { isDrivable } from '../roadRules'
import { TrafficSignals } from '../signals/TrafficSignals'
import { PriorityJunctions } from './PriorityJunctions'

// A main road n0 - n1 - n2 with a side road arriving from n3. The junction is n1.
const tJunction = (sideClass = 'residential') =>
    makeGraph(
        [[-100, 0], [0, 0], [100, 0], [0, -100]],
        [
            { from: 0, to: 1, roadClass: 'primary' }, // 0: main road heading east
            { from: 1, to: 0, roadClass: 'primary' }, // 1
            { from: 1, to: 2, roadClass: 'primary' }, // 2
            { from: 2, to: 1, roadClass: 'primary' }, // 3: main road heading west
            { from: 3, to: 1, roadClass: sideClass }, // 4: side road heading north
            { from: 1, to: 3, roadClass: sideClass } // 5
        ]
    )

// Two streets of equal rank crossing at node 0 (edges 0-3 arrive from east, west, north, south)
const crossing = (signalNodes: number[] = []) =>
    makeGraph(
        [[0, 0], [100, 0], [-100, 0], [0, 100], [0, -100]],
        [{ from: 1, to: 0 }, { from: 2, to: 0 }, { from: 3, to: 0 }, { from: 4, to: 0 }],
        signalNodes
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

    it('makes equal roads give way to the crossing one, but not to oncoming traffic', () => {
        const junctions = new PriorityJunctions(crossing(), isDrivable, NO_SIGNALS)
        expect(junctions.conflictsOf(0)).toEqual({ higher: [], equal: [2, 3] })
        expect(junctions.conflictsOf(2)).toEqual({ higher: [], equal: [0, 1] })
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
})