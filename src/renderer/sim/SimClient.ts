import type { RoadGraph } from '@core/graph/types'
import type { FromWorker, ToWorker } from '@shared/protocol'
import {JunctionReport} from "@core/sim/ports";

export class SimClient {
    private readonly worker = new Worker(new URL('./sim.worker.ts', import.meta.url), {
        type: 'module'
    })

    onFrame:
        | ((positions: Float32Array, speeds: Float32Array, lanes: Uint8Array, signals: Uint8Array, time: number) => void)
        | null = null
    onSignalSetup: ((approaches: Int32Array) => void) | null = null
    onJunctions: ((rows: JunctionReport[]) => void) | null = null
    onJunctionTable: ((rows: JunctionReport[], time: number) => void) | null = null
    onError: ((message: string) => void) | null = null
    
    constructor() {
        this.worker.onmessage = (event: MessageEvent<FromWorker>) => {
            const message = event.data
            if (message.type === 'frame') {
                this.onFrame?.(message.positions, message.speeds, message.lanes, message.signals, message.time)
                this.send({ type: 'ack' })
            } else if (message.type === 'signalSetup') {
                this.onSignalSetup?.(message.approaches)
            } else if (message.type === 'junctions') {
                this.onJunctions?.(message.rows)
            } else if (message.type === 'junctionTable') {
                this.onJunctionTable?.(message.rows, message.time)
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
    
    /** Asks the worker for the full junction table; it arrives through onJunctionTable. */
    exportJunctions(): void {
        this.send({ type: 'exportJunctions' })
    }
    
    private send(message: ToWorker): void {
        this.worker.postMessage(message)
    }
}