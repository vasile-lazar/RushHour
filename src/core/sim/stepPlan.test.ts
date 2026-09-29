import { describe, expect, it } from 'vitest'
import { MAX_STEP_SECONDS, planSteps } from './stepPlan'

describe('planSteps', () => {
    it('uses a single step for a short span', () => {
        expect(planSteps(0.016)).toEqual({ steps: 1, dt: 0.016 })
    })

    it('splits a long span into equal steps', () => {
        expect(planSteps(5)).toEqual({ steps: 50, dt: 0.1 })
    })

    it('never exceeds the maximum step length', () => {
        for (const span of [0.05, 0.25, 0.9, 3.3, 12.7]) {
            const { steps, dt } = planSteps(span)
            expect(dt).toBeLessThanOrEqual(MAX_STEP_SECONDS + 1e-12)
            expect(steps * dt).toBeCloseTo(span)
        }
    })

    it('still runs one (empty) step for a zero-length span', () => {
        expect(planSteps(0)).toEqual({ steps: 1, dt: 0 })
    })
})