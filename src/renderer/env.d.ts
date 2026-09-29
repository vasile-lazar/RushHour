import type { TrafficSimApi } from '@shared/ipc'

declare global {
    interface Window {
        trafficSim: TrafficSimApi
    }
}