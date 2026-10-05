import type { RoadGraph } from '@core/graph/types'
import type { JunctionReport } from '@core/sim/ports'

/** Messages the renderer sends to the simulation worker. */
export type ToWorker =
    | { type: 'setGraph'; graph: RoadGraph }
    | { type: 'reset'; vehicleCount: number; seed: number }
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'setTimeScale'; value: number }
    /** "I received the last frame, you may send the next one" */
    | { type: 'ack' }
    /** "Send me the full junction table" (for the CSV export) */
    | { type: 'exportJunctions' }

/** Messages the worker sends back. */
export type FromWorker =
    | {
    type: 'frame'
    time: number
    positions: Float32Array
    speeds: Float32Array
    lanes: Uint8Array
    signals: Uint8Array
}    
    | { type: 'junctionTable'; time: number; rows: JunctionReport[] }
    /** Sent once per new simulation: the edges whose end has a signal (the order `signals` uses) */
    | { type: 'signalSetup'; approaches: Int32Array }
    /** About once a second: the junctions with the most total delay, worst first */
    | { type: 'junctions'; rows: JunctionReport[] }
    | { type: 'error'; message: string }