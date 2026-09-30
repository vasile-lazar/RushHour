import { describe, expect, it } from 'vitest'
import { IdmModel } from './Idm'

const idm = new IdmModel()

describe('IdmModel', () => {
    it('accelerates from standstill on a free road at the comfortable rate', () => {
        expect(idm.acceleration(0, 10, Infinity, 0)).toBeCloseTo(1.5)
    })

    it('stops accelerating at the desired speed', () => {
        expect(idm.acceleration(10, 10, Infinity, 0)).toBeCloseTo(0)
    })

    it('brakes harder the closer a stopped vehicle is', () => {
        const far = idm.acceleration(10, 10, 60, 0)
        const middle = idm.acceleration(10, 10, 30, 0)
        const near = idm.acceleration(10, 10, 10, 0)
        expect(far).toBeLessThan(0)
        expect(middle).toBeLessThan(far)
        expect(near).toBeLessThan(middle)
    })

    it('demands more than physically possible braking when almost touching', () => {
        expect(idm.acceleration(10, 10, 3, 0)).toBeLessThan(-9)
    })

    it('follows a same-speed leader at a decent gap without hard braking', () => {
        expect(idm.acceleration(10, 10, 40, 10)).toBeGreaterThan(-1)
    })
})