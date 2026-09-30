import { describe, expect, it } from 'vitest'
import { roadRank } from './roadRules'

describe('roadRank', () => {
    it('ranks bigger roads higher', () => {
        expect(roadRank('primary')).toBeGreaterThan(roadRank('secondary'))
        expect(roadRank('secondary')).toBeGreaterThan(roadRank('tertiary'))
        expect(roadRank('tertiary')).toBeGreaterThan(roadRank('residential'))
    })

    it('ranks a link road like its parent', () => {
        expect(roadRank('primary_link')).toBe(roadRank('primary'))
    })

    it('treats unknown classes like a residential street', () => {
        expect(roadRank('mystery')).toBe(roadRank('residential'))
    })
})