import { describe, expect, it } from 'vitest'
import { defaultSpeedLimit, directionOf, lanesPerDirection, parseSpeedLimit } from './RoadTags'

describe('parseSpeedLimit', () => {
    it('converts km/h to m/s', () => {
        expect(parseSpeedLimit('50')).toBeCloseTo(50 / 3.6, 5)
    })
    it('converts mph to m/s', () => {
        expect(parseSpeedLimit('30 mph')).toBeCloseTo(13.4112, 3)
    })
    it('returns null for unusable values', () => {
        expect(parseSpeedLimit('RO:urban')).toBeNull()
        expect(parseSpeedLimit(undefined)).toBeNull()
    })
})

describe('defaultSpeedLimit', () => {
    it('uses the class table, with a fallback for unknown classes', () => {
        expect(defaultSpeedLimit('residential')).toBeCloseTo(30 / 3.6, 5)
        expect(defaultSpeedLimit('mystery')).toBeCloseTo(40 / 3.6, 5)
        expect(defaultSpeedLimit('service')).toBeCloseTo(20 / 3.6, 5)
    })
})

describe('directionOf', () => {
    it('reads explicit oneway tags', () => {
        expect(directionOf({ oneway: 'yes' })).toBe('forward')
        expect(directionOf({ oneway: '-1' })).toBe('backward')
    })
    it('infers one-way for roundabouts and motorways', () => {
        expect(directionOf({ junction: 'roundabout' })).toBe('forward')
        expect(directionOf({ highway: 'motorway' })).toBe('forward')
    })
    it('lets an explicit oneway=no override the inference', () => {
        expect(directionOf({ oneway: 'no', junction: 'roundabout' })).toBe('both')
    })
    it('defaults to two-way', () => {
        expect(directionOf({ highway: 'residential' })).toBe('both')
        expect(directionOf(undefined)).toBe('both')
    })
})

describe('lanesPerDirection', () => {
    it('splits two-way lane counts', () => {
        expect(lanesPerDirection('4', 'both')).toBe(2)
        expect(lanesPerDirection('3', 'both')).toBe(1)
    })
    it('keeps one-way lane counts as-is', () => {
        expect(lanesPerDirection('3', 'forward')).toBe(3)
    })
    it('falls back to 1 lane when missing or invalid', () => {
        expect(lanesPerDirection(undefined, 'both')).toBe(1)
        expect(lanesPerDirection('abc', 'forward')).toBe(1)
    })
})