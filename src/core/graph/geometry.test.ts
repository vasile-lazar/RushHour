import { describe, expect, it } from 'vitest'
import {endHeading, pointAlong, polylineLength, reversePolyline} from './geometry'

// An L-shaped road: 10 m east, then 5 m north
const road = [0, 0, 10, 0, 10, 5]

describe('polylineLength', () => {
    it('sums the segment lengths', () => {
        expect(polylineLength(road)).toBe(15)
    })
})

describe('reversePolyline', () => {
    it('reverses point order but keeps x/y pairs', () => {
        expect(reversePolyline(road)).toEqual([10, 5, 10, 0, 0, 0])
    })
})

describe('endHeading', () => {
    it('gives the direction of the last segment', () => {
        expect(endHeading([0, 0, 10, 0])).toBeCloseTo(0)
        expect(endHeading([0, 0, 0, 10])).toBeCloseTo(Math.PI / 2)
        expect(endHeading([0, 0, 10, 0, 10, 5])).toBeCloseTo(Math.PI / 2) // the corner counts
    })

    it('skips a zero-length last segment', () => {
        expect(endHeading([0, 0, 10, 0, 10, 0])).toBeCloseTo(0)
    })
})

describe('pointAlong', () => {
    const out = new Float32Array(2)

    it('interpolates inside a segment', () => {
        pointAlong(road, 4, out, 0)
        expect([out[0], out[1]]).toEqual([4, 0])
    })

    it('follows the corner', () => {
        pointAlong(road, 12, out, 0)
        expect([out[0], out[1]]).toEqual([10, 2])
    })

    it('clamps to the end of the road', () => {
        pointAlong(road, 99, out, 0)
        expect([out[0], out[1]]).toEqual([10, 5])
    })
})

