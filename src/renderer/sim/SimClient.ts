import type { RoadGraph } from '@core/graph/types'
import type { FromWorker, ToWorker } from '@shared/protocol'

export class SimClient {
    private readonly worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
        type: 'module'
    })

    onFrame: ((positions: Float32Array, time: number) => void) | null = null
    onError: ((message: string) => void) | null = null

    constructor() {
        this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
            const message = event.data
            if (message.type === 'frame') {
                this.onFrame?.(message.positions, message.time)
                this.send({ type: 'ack' })
            } else {
                this.onError?.(message.message)
            }
        }
        this.worker.onerror = (event) =>
            this.onError?.(event.message || 'the worker could not be loaded (see the DevTools console)')
    }

    /** Hands a new city to the worker (heavy: call once per city). */
    setGraph(graph: RoadGraph): void {
        this.send({ type: 'setGraph', graph })
    }

    /** Starts a fresh simulation with this many vehicles on the current city. */
    reset(vehicleCount: number, seed: number): void {
        this.send({ type: 'reset', vehicleCount, seed })
    }

    play(): void {
        this.send({ type: 'play' })
    }

    pause(): void {
        this.send({ type: 'pause' })
    }

    setTimeScale(value: number): void {
        this.send({ type: 'setTimeScale', value })
    }

    private send(message: ToWorker): void {
        this.worker.postMessage(message)
    }
}