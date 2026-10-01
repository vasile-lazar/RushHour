import { describe, expect, it } from 'vitest'
import { makeGraph } from '../../testing/graphs'
import { Turns } from './Turns'

// Two-way streets crossing at node 0 (node 1 west, 2 east, 3 north, 4 south)
const crossing = makeGraph(
    [[0, 0], [-300, 0], [300, 0], [0, 300], [0, -300]],
    [
        { from: 1, to: 0 }, // 0: arrives from the west, heading east
        { from: 2, to: 0 }, // 1: arrives from the east, heading west
        { from: 3, to: 0 }, // 2: arrives from the north
        { from: 4, to: 0 }, // 3: arrives from the south
        { from: 0, to: 1 }, // 4: leaves to the west
        { from: 0, to: 3 }, // 5: leaves to the north
        { from: 0, to: 2 }, // 6: leaves to the east
        { from: 0, to: 4 } // 7: leaves to the south
    ]
)

describe('Turns', () => {
    it('recognises a left turn, and neither a right turn nor going straight, as crossing', () => {
        const turns = new Turns(crossing)
        expect(turns.crossesOncoming(0, 5)).toBe(true) // east, then north: left
        expect(turns.crossesOncoming(0, 7)).toBe(false) // east, then south: right
        expect(turns.crossesOncoming(0, 6)).toBe(false) // straight on
    })

    it('flips which turn crosses for left-hand traffic', () => {
        const turns = new Turns(crossing, false)
        expect(turns.crossesOncoming(0, 5)).toBe(false)
        expect(turns.crossesOncoming(0, 7)).toBe(true)
    })

    it('treats turns of either direction as sharp, but not going straight', () => {
        const turns = new Turns(crossing)
        expect(turns.isSharpTurn(0, 5)).toBe(true)
        expect(turns.isSharpTurn(0, 7)).toBe(true)
        expect(turns.isSharpTurn(0, 6)).toBe(false)
    })

    it('finds the approach meeting head-on, and not the crossing ones', () => {
        const turns = new Turns(crossing)
        expect(turns.oncoming(0)).toEqual([1])
        expect(turns.oncoming(2)).toEqual([3])
    })
})