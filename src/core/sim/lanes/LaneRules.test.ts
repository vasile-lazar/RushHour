import { describe, expect, it } from 'vitest'
import { allowedLanes, exitLane, turnOf } from './LaneRules'

const all = { left: true, right: true }

describe('allowedLanes', () => {
    it('lets a single lane do everything', () => {
        expect(allowedLanes(1, 'left', all)).toEqual([0])
        expect(allowedLanes(1, 'straight', all)).toEqual([0])
        expect(allowedLanes(1, 'right', all)).toEqual([0])
    })

    it('turns left from the left lane, and goes straight or right from the right lane, with two lanes', () => {
        expect(allowedLanes(2, 'left', all)).toEqual([0])
        expect(allowedLanes(2, 'straight', all)).toEqual([1])
        expect(allowedLanes(2, 'right', all)).toEqual([1])
    })

    it('sends the middle lanes straight with three or more lanes', () => {
        expect(allowedLanes(3, 'left', all)).toEqual([0])
        expect(allowedLanes(3, 'straight', all)).toEqual([1])
        expect(allowedLanes(3, 'right', all)).toEqual([2])
        expect(allowedLanes(4, 'straight', all)).toEqual([1, 2])
    })

    it('lets an outer lane go straight where the junction offers no turn on that side', () => {
        expect(allowedLanes(3, 'straight', { left: false, right: true })).toEqual([0, 1])
        expect(allowedLanes(3, 'straight', { left: true, right: false })).toEqual([1, 2])
        expect(allowedLanes(2, 'straight', { left: false, right: true })).toEqual([0, 1])
    })

    it('falls back to the nearest lane for a turn nothing serves', () => {
        expect(allowedLanes(3, 'left', { left: false, right: true })).toEqual([0])
    })
})

describe('exitLane', () => {
    it('puts left turns in the leftmost lane and right turns in the rightmost', () => {
        expect(exitLane('left', 0, 3)).toBe(0)
        expect(exitLane('right', 2, 3)).toBe(2)
    })

    it('keeps the lane when going straight, as far as the new road has lanes', () => {
        expect(exitLane('straight', 1, 3)).toBe(1)
        expect(exitLane('straight', 2, 2)).toBe(1)
    })
})

describe('turnOf', () => {
    it('tells turns from going straight', () => {
        expect(turnOf(0)).toBe('straight')
        expect(turnOf(0.5)).toBe('straight')
        expect(turnOf(1)).toBe('left')
        expect(turnOf(-1)).toBe('right')
    })
})