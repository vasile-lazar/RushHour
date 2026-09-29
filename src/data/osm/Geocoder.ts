export interface Place {
    /** Full name as OSM knows it, useful to show the user what was matched */
    displayName: string
    osmType: 'relation' | 'way'
    osmId: number
}


interface NominatimResult {
    display_name: string
    osm_type: string
    osm_id: number
}


const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'


/** Finds the OSM area (city boundary) that best matches a free-text name. */
export async function geocode(query: string): Promise<Place> {
    const params = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        limit: '5'
    })

    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
        // Nominatim's usage policy requires an identifying User-Agent
        headers: { 'User-Agent': 'RushHour/0.1 (city traffic simulation)' }
    })
    if (!response.ok) {
        throw new Error(`Geocoding failed (HTTP ${response.status})`)
    }
    
    const results = (await response.json()) as NominatimResult[]
    
    // We need an area with a boundary, not a single point (node)
    const area =
        results.find((r) => r.osm_type === 'relation') ??
        results.find((r) => r.osm_type === 'way')
    if (!area) {
        throw new Error(`Could not find an area named "${query}"`)
    }

    return {
        displayName: area.display_name,
        osmType: area.osm_type as Place['osmType'],
        osmId: area.osm_id
    }
}


/**
 * Overpass identifies areas by the OSM id plus a fixed offset
 * that depends on the element type.
 */
export function toOverpassAreaId(place: Place): number {
    return place.osmType === 'relation'
        ? 3_600_000_000 + place.osmId
        : 2_400_000_000 + place.osmId
}