import type { RoadGraph } from '@core/graph/types'

export const IpcChannel = {
    LoadCity: 'city:load',
    CityProgress: 'city:progress'
} as const

/** The API the preload script exposes to the renderer as window.trafficSim. */
export interface TrafficSimApi {
    loadCity(name: string): Promise<RoadGraph>
    /** Subscribes to progress messages. Returns a function that unsubscribes. */
    onCityProgress(listener: (message: string) => void): () => void
}