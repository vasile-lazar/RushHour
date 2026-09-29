export type Tags = Record<string, string> | undefined
export type Direction = 'forward' | 'backward' | 'both'

const KMH_TO_MS = 1 / 3.6
const MPH_TO_MS = 1.609344 * KMH_TO_MS


/** Parses "50" or "30 mph" into m/s. Returns null for anything else (e.g. "RO:urban"). */
export function parseSpeedLimit(value: string | undefined): number | null {
    if (!value) return null
    const match = /^(\d+(?:\.\d+)?)\s*(mph|km\/h)?$/.exec(value.trim())
    if (!match) return null
    const number = Number(match[1])
    return number * (match[2] === 'mph' ? MPH_TO_MS : KMH_TO_MS)
}


/** Fallback speed limit (m/s) for roads with no usable maxspeed tag. */
export function defaultSpeedLimit(roadClass: string): number {
    const kmh: Record<string, number> = {
        motorway: 110,
        trunk: 90,
        primary: 60,
        secondary: 50,
        tertiary: 50,
        unclassified: 40,
        residential: 30,
        living_street: 10,
        service: 20,
        motorway_link: 60,
        trunk_link: 50,
        primary_link: 40,
        secondary_link: 40,
        tertiary_link: 40
    }
    return (kmh[roadClass] ?? 40) * KMH_TO_MS
}


/** Which way(s) traffic may flow along the way's node order. */
export function directionOf(tags: Tags): Direction {
    const oneway = tags?.oneway
    // An explicit tag always wins over the implicit rules below
    if (oneway === 'no' || oneway === 'false' || oneway === '0') return 'both'
    if (oneway === '-1' || oneway === 'reverse') return 'backward'
    if (oneway === 'yes' || oneway === 'true' || oneway === '1') return 'forward'

    if (tags?.junction === 'roundabout') return 'forward'
    if (tags?.highway === 'motorway' || tags?.highway === 'motorway_link') return 'forward'
    return 'both'
}


/**
 * OSM's "lanes" counts both directions on a two-way road,
 * but our edges are per direction, so split it in that case.
 */
export function lanesPerDirection(value: string | undefined, direction: Direction): number {
    const total = Number.parseInt(value ?? '', 10)
    if (!(total > 0)) return 1
    return direction === 'both' ? Math.max(1, Math.floor(total / 2)) : total
}