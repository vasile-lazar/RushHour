import { describe, expect, it } from 'vitest'
import { createProjection } from './Projection'

describe('createProjection', () => {
    it('maps the origin to (0, 0)', () => {
        const project = createProjection(47, 28)
        const p = project(47, 28)
        expect(p.x).toBeCloseTo(0)
        expect(p.y).toBeCloseTo(0)
    })

    it('one degree north is about 111 km', () => {
        const project = createProjection(47, 28)
        expect(project(48, 28).y).toBeCloseTo(111_195, 0)
    })

    it('one degree east shrinks with latitude (half at 60°N)', () => {
        const project = createProjection(60, 28)
        expect(project(60, 29).x).toBeCloseTo(55_597.5, 0)
    })
})