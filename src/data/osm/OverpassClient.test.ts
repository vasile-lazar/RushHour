import { describe, expect, it } from 'vitest'
import { buildRoadQuery } from './OverpassClient'

describe('buildRoadQuery', () => {
    const query = buildRoadQuery(3_600_123_456)

    it('targets the given area', () => {
        expect(query).toContain('area(id:3600123456)')
    })

    it('includes cars-only road types and excludes footways', () => {
        expect(query).toContain('residential')
        expect(query).not.toContain('footway')
    })
})