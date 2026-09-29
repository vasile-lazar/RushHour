import type { RoadGraph } from '@core/graph/types'

export type ProgressCallback = (message: string) => void


/** Anything that can turn a city name into a road graph. */
export interface MapProvider {
    loadCity(name: string, onProgress: ProgressCallback): Promise<RoadGraph>
}