const EARTH_RADIUS_M = 6_371_000
const DEG_TO_RAD = Math.PI / 180


export interface Point {
    x: number
    y: number
}


/**
 * Creates a function that converts (lat, lon) into meters east/north of
 * an origin. Accurate enough for a single city, where the curvature of
 * the Earth is negligible.
 */
export function createProjection(originLat: number, originLon: number) {
    const metersPerDegreeLat = EARTH_RADIUS_M * DEG_TO_RAD
    // Longitude lines get closer together toward the poles
    const metersPerDegreeLon = metersPerDegreeLat * Math.cos(originLat * DEG_TO_RAD)

    return (lat: number, lon: number): Point => ({
        x: (lon - originLon) * metersPerDegreeLon,
        y: (lat - originLat) * metersPerDegreeLat
    })
}