import { describe, expect, it } from 'vitest'
import { toOverpassAreaId } from './Geocoder'

describe('toOverpassAreaId', () => {
    it('offsets relations by 3600000000', () => {
        const place = { displayName: 'x', osmType: 'relation', osmId: 123 } as const
        expect(toOverpassAreaId(place)).toBe(3_600_000_123)
    })

    it('offsets ways by 2400000000', () => {
        const place = { displayName: 'x', osmType: 'way', osmId: 123 } as const
        expect(toOverpassAreaId(place)).toBe(2_400_000_123)
    })
})