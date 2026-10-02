import { describe, expect, it } from 'vitest'
import { makeGraph } from '../../testing/graphs'
import { Movements } from './Movements'

// Two-way streets crossing at node 0 (node 1 west, 2 east, 3 north, 4 south)
const crossing = makeGraph(
    [[0, 0], [-300, 0], [300, 0], [0, 300], [0, -300]],
    [
        { from: 1, to: 0 }, // 0: arrives from the west
        { from: 2, to: 0 }, // 1: arrives from the east
        { from: 3, to: 0 }, // 2: arrives from the north
        { from: 4, to: 0 }, // 3: arrives from the south
        { from: 0, to: 1 }, // 4: leaves to the west
        { from: 0, to: 3 }, // 5: leaves to the north
        { from: 0, to: 2 }, // 6: leaves to the east
        { from: 0, to: 4 } // 7: leaves to the south
    ]
)

describe('Movements', () => {
    const m = new Movements(crossing)

    it('lets opposing straight paths pass each other', () => {
        expect(m.cross(0, 6, 1, 4)).toBe(false)
    })

    it('makes a left turn cross the oncoming straight path', () => {
        expect(m.cross(0, 5, 1, 4)).toBe(true)
    })

    it('lets two opposing left turns happen at once', () => {
        expect(m.cross(0, 5, 1, 7)).toBe(false)
    })

    it('lets a right turn pass oncoming traffic, but crosses perpendicular straight paths', () => {
        expect(m.cross(0, 7, 1, 4)).toBe(false)
        expect(m.cross(0, 6, 2, 7)).toBe(true)
    })

    it('treats paths into the same road as a merge, and paths from the same approach as no conflict', () => {
        expect(m.cross(0, 7, 2, 7)).toBe(true)
        expect(m.cross(0, 5, 0, 7)).toBe(false)
    })

    it('mirrors for left-hand traffic', () => {
        const left = new Movements(crossing, false)
        expect(left.cross(0, 5, 1, 4)).toBe(false)
        expect(left.cross(0, 7, 1, 4)).toBe(true)
    })
})