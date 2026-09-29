import type { RoadGraph } from '@core/graph/types'
import type { MapProvider, ProgressCallback } from '../MapProvider'
import { geocode, toOverpassAreaId } from './Geocoder'
import { buildGraph } from './GraphBuilder'
import { fetchRoads } from './OverpassClient'

export class OsmMapProvider implements MapProvider {
    async loadCity(name: string, onProgress: ProgressCallback): Promise<RoadGraph> {
        onProgress(`Looking up "${name}"...`)
        const place = await geocode(name)

        onProgress(`Downloading roads for ${place.displayName}...`)
        const osm = await fetchRoads(toOverpassAreaId(place))

        onProgress('Building road graph...')
        return buildGraph(place.displayName, osm)
    }
}