import { describe, expect, it } from 'vitest'
import { makeGraph } from '../../testing/graphs'
import { NO_JUNCTION_RULES } from '../ports'
import { TurnLaneGuide } from './TurnLaneGuide'

// Edge 0 arrives from the west heading east with 3 lanes. At the crossing it can go
// north (a left turn, edge 1), east (straight, edge 2) or south (a right turn, edge 3)
const points: Array<[number, number]> = [[0, 0], [-300, 0], [0, 300], [300, 0], [0, -300]]
const crossing = () =>
    makeGraph(points, [
        { from: 1, to: 0, lanes: 3 },
        { from: 0, to: 2 },
        { from: 0, to: 3 },
        { from: 0, to: 4 },
        { from: 0, to: 1 } // back west: a U-turn, not an exit
    ])
const tee = () =>
    makeGraph(points, [
        { from: 1, to: 0, lanes: 3 },
        { from: 0, to: 3 },
        { from: 0, to: 4 }
    ])

describe('TurnLaneGuide', () => {
    it('sends left from the left lane, straight from the middle, right from the right lane', () => {
        const guide = new TurnLaneGuide(crossing(), () => true, NO_JUNCTION_RULES)
        expect(guide.lanesFor(0, 1)).toEqual([0])
        expect(guide.lanesFor(0, 2)).toEqual([1])
        expect(guide.lanesFor(0, 3)).toEqual([2])
    })

    it('lets the left lane go straight where there is no left turn', () => {
        const guide = new TurnLaneGuide(tee(), () => true, NO_JUNCTION_RULES)
        expect(guide.lanesFor(0, 1)).toEqual([0, 1])
        expect(guide.lanesFor(0, 2)).toEqual([2])
    })

    it('says any lane works when the road does not branch', () => {
        const bend = makeGraph(points, [{ from: 1, to: 0, lanes: 3 }, { from: 0, to: 2 }])
        const guide = new TurnLaneGuide(bend, () => true, NO_JUNCTION_RULES)
        expect(guide.lanesFor(0, 1)).toBeUndefined()
    })

    it('puts left turns in the leftmost lane, right turns in the rightmost, straight in the same lane', () => {
        const guide = new TurnLaneGuide(crossing(), () => true, NO_JUNCTION_RULES)
        expect(guide.laneAfter(0, 1, 0)).toBe(0)
        expect(guide.laneAfter(0, 3, 2)).toBe(0) // the road after has one lane
        expect(guide.laneAfter(0, 2, 1)).toBe(0)
    })
})