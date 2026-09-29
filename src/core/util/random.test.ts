import { describe, expect, it } from 'vitest'
import { createRng } from './random'

describe('createRng', () => {
    it('repeats the same sequence for the same seed', () => {
        const a = createRng(42)
        const b = createRng(42)
        expect([a(), a(), a()]).toEqual([b(), b(), b()])
    })

    it('gives different sequences for different seeds', () => {
        expect(createRng(1)()).not.toBe(createRng(2)())
    })

    it('stays within [0, 1)', () => {
        const rng = createRng(7)
        for (let i = 0; i < 1000; i++) {
            const value = rng()
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
        }
    })
})