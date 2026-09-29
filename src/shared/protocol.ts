import type { RoadGraph } from '@core/graph/types'

/** Messages the renderer sends to the simulation worker. */
export type ToWorker =
    | { type: 'setGraph'; graph: RoadGraph }
    | { type: 'reset'; vehicleCount: number; seed: number }
    | { type: 'play' }
    | { type: 'pause' }
    | { type: 'setTimeScale'; value: number }
    /** "I received the last frame, you may send the next one" */
    | { type: 'ack' }

/** Messages the worker sends back. */
export type FromWorker =
    | { type: 'frame'; time: number; positions: Float32Array }
    | { type: 'error'; message: string }