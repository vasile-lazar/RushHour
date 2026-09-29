import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { RoadGraph } from '@core/graph/types'
import type { MapProvider, ProgressCallback } from './MapProvider'

const CACHE_VERSION = 1

interface CacheFile {
    version: number
    graph: RoadGraph
}


/** Turns a city name into a safe file name: "Chișinău" -> "chisinau". */
export function cacheKey(cityName: string): string {
    const slug = cityName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip accents
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    // Names with no latin letters (e.g. Japanese) would give an empty slug
    return slug || createHash('sha1').update(cityName).digest('hex').slice(0, 12)
}


export class CachedMapProvider implements MapProvider {
    private readonly inner: MapProvider
    private readonly directory: string

    constructor(inner: MapProvider, directory: string) {
        this.inner = inner
        this.directory = directory
    }

    async loadCity(name: string, onProgress: ProgressCallback): Promise<RoadGraph> {
        const file = join(this.directory, `${cacheKey(name)}.json`)

        const cached = await this.read(file)
        if (cached) {
            onProgress('Loaded from cache')
            return cached
        }

        const graph = await this.inner.loadCity(name, onProgress)
        await this.write(file, graph)
        return graph
    }

    private async read(file: string): Promise<RoadGraph | null> {
        try {
            const parsed = JSON.parse(await readFile(file, 'utf-8')) as CacheFile
            return parsed.version === CACHE_VERSION ? parsed.graph : null
        } catch {
            return null // missing or corrupted file: treat it as a cache miss
        }
    }

    private async write(file: string, graph: RoadGraph): Promise<void> {
        try {
            await mkdir(this.directory, { recursive: true })
            // Write to a temp file first, so closing the app mid-write
            // can never leave a half-written cache file behind
            const temp = `${file}.tmp`
            const contents: CacheFile = { version: CACHE_VERSION, graph }
            await writeFile(temp, JSON.stringify(contents))
            await rename(temp, file)
        } catch {
            // A failed cache write must never stop the city from loading
        }
    }
}