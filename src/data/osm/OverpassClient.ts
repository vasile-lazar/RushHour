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


const ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
]


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
    let lastError: unknown

    for (const endpoint of ENDPOINTS) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'RushHour/0.1 (city traffic simulation)'
                },
                body,
                signal: AbortSignal.timeout(200_000)
            })
            if (!response.ok) {
                throw new Error(`Overpass returned HTTP ${response.status}`)
            }

            const data = (await response.json()) as OverpassResponse
            if (data.remark?.includes('runtime error')) {
                throw new Error(`Overpass query failed: ${data.remark}`)
            }
            return data
        } catch (error) {
            lastError = error // try the next mirror
        }
    }

    throw new Error(`All Overpass servers failed: ${(lastError as Error).message}`)
}