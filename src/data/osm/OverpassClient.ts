import {USER_AGENT} from "./userAgent";

const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
]

const MAX_ROUNDS = 3
const RETRY_DELAY_MS = 5_000
/** Overpass asks clients to wait 30 s after a 429 or 406 */
const RATE_LIMIT_DELAY_MS = 30_000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))


export interface OverpassNode {
    type: 'node'
    id: number
    lat: number
    lon: number
    tags?: Record<string, string>
}


export interface OverpassWay {
    type: 'way'
    id: number
    /** OSM ids of the nodes this road passes through, in order */
    nodes: number[]
    tags?: Record<string, string>
}


export interface OverpassResponse {
    elements: Array<OverpassNode | OverpassWay>
    /** Overpass reports some failures (like timeouts) here, with HTTP 200 */
    remark?: string
}


/** Road types cars can drive on. Service roads and tracks are left out on purpose. */
const DRIVABLE = [
    'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
    'unclassified', 'residential', 'living_street',
    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
].join('|')


export function buildRoadQuery(areaId: number): string {
    return `
    [out:json][timeout:180];
    area(id:${areaId})->.a;
    way["highway"~"^(${DRIVABLE})$"](area.a);
    (._;>;);
    out body;
  `
}


/** Downloads every drivable road (and the nodes they use) inside an area. */
export async function fetchRoads(areaId: number): Promise<OverpassResponse> {
    const body = `data=${encodeURIComponent(buildRoadQuery(areaId))}`
    const errors: string[] = []

    for (let round = 1; round <= MAX_ROUNDS; round++) {
        let rateLimited = false

        for (const endpoint of ENDPOINTS) {
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': USER_AGENT
                    },
                    body,
                    signal: AbortSignal.timeout(200_000)
                })
                if (!response.ok) {
                    if (response.status === 429 || response.status === 406) rateLimited = true
                    throw new Error(`HTTP ${response.status}`)
                }

                const data = (await response.json()) as OverpassResponse
                if (data.remark?.includes('runtime error')) {
                    throw new Error(`query failed: ${data.remark}`)
                }
                return data
            } catch (error) {
                errors.push(`round ${round}, ${new URL(endpoint).host}: ${(error as Error).message}`)
            }
        }

        if (round < MAX_ROUNDS) {
            await sleep(rateLimited ? RATE_LIMIT_DELAY_MS : RETRY_DELAY_MS * round)
        }
    }

    throw new Error(`All Overpass servers failed:\n${errors.join('\n')}`)
}