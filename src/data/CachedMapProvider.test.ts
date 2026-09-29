import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RoadGraph } from '@core/graph/types'
import { CachedMapProvider, cacheKey } from './CachedMapProvider'
import type { MapProvider } from './MapProvider'

const graph: RoadGraph = {
    name: 'Test City',
    nodes: [
        { x: 0, y: 0, hasSignal: false },
        { x: 10, y: 0, hasSignal: false }
    ],
    edges: [
        {
            from: 0,
            to: 1,
            length: 10,
            speedLimit: 10,
            lanes: 1,
            roadClass: 'residential',
            geometry: [0, 0, 10, 0]
        }
    ],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 0 }
}

class FakeProvider implements MapProvider {
    calls = 0
    async loadCity(): Promise<RoadGraph> {
        this.calls++
        return graph
    }
}

describe('cacheKey', () => {
    it('removes accents and punctuation', () => {
        expect(cacheKey('Chișinău')).toBe('chisinau')
        expect(cacheKey('New York, USA')).toBe('new-york-usa')
    })

    it('falls back to a hash for names without latin letters', () => {
        expect(cacheKey('東京')).toMatch(/^[0-9a-f]{12}$/)
    })
})

describe('CachedMapProvider', () => {
    let dir: string
    let inner: FakeProvider
    let cached: CachedMapProvider

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'rushhour-'))
        inner = new FakeProvider()
        cached = new CachedMapProvider(inner, dir)
    })

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true })
    })

    it('asks the inner provider only once per city', async () => {
        const first = await cached.loadCity('Test City', () => {})
        const second = await cached.loadCity('Test City', () => {})

        expect(inner.calls).toBe(1)
        expect(second).toEqual(first)
    })

    it('reports when it served the city from cache', async () => {
        await cached.loadCity('Test City', () => {})

        const messages: string[] = []
        await cached.loadCity('Test City', (m) => messages.push(m))
        expect(messages).toContain('Loaded from cache')
    })

    it('ignores cache files from an older format version', async () => {
        await writeFile(join(dir, 'test-city.json'), JSON.stringify({ version: 0, graph }))

        await cached.loadCity('Test City', () => {})
        expect(inner.calls).toBe(1)
    })

    it('recovers from a corrupted cache file', async () => {
        await writeFile(join(dir, 'test-city.json'), '{not valid json')

        await cached.loadCity('Test City', () => {})
        expect(inner.calls).toBe(1)
    })
})