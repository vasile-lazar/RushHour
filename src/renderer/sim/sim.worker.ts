import type { RoadGraph } from '@core/graph/types'
import { createSimulation } from '@core/sim/createSimulation'
import type { Simulation } from '@core/sim/Simulation'
import { planSteps } from '@core/sim/stepPlan'
import type { FromWorker, ToWorker } from '@shared/protocol'

// The DOM typings and worker typings clash, so describe just the parts we use
interface WorkerScope {
    onmessage: ((event: MessageEvent<ToWorker>) => void) | null
    postMessage(message: FromWorker, transfer?: Transferable[]): void
}
const scope = self as unknown as WorkerScope

/** Target time between frames (about 60 per second) */
const TICK_MS = 16
/** After a stall, don't try to catch up more than this much real time */
const MAX_REAL_SECONDS = 0.1

let graph: RoadGraph | null = null
let simulation: Simulation | null = null
let timeScale = 1
let timer: ReturnType<typeof setTimeout> | null = null
let lastTick = 0
/** True while the renderer has not yet confirmed receiving the previous frame */
let awaitingAck = false

function tick(): void {
    timer = null
    if (!simulation) return

    const started = performance.now()
    const realSeconds = Math.min((started - lastTick) / 1000, MAX_REAL_SECONDS)
    lastTick = started

    const { steps, dt } = planSteps(realSeconds * timeScale)
    for (let i = 0; i < steps; i++) simulation.step(dt)

    if (!awaitingAck) sendFrame()

    // Schedule the next tick after this one finished, so ticks never pile up
    const spent = performance.now() - started
    timer = setTimeout(tick, Math.max(0, TICK_MS - spent))
}

function sendFrame(): void {
    if (!simulation) return
    const positions = new Float32Array(simulation.vehicleCount * 2)
    simulation.writePositions(positions)
    awaitingAck = true
    // Listing the buffer as "transferred" hands it over without copying
    scope.postMessage({ type: 'frame', time: simulation.time, positions }, [positions.buffer])
}

function play(): void {
    if (timer !== null || !simulation) return
    lastTick = performance.now()
    timer = setTimeout(tick, 0)
}

function pause(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
}

function fail(message: string): void {
    scope.postMessage({ type: 'error', message })
}

scope.onmessage = (event) => {
    const message = event.data
    switch (message.type) {
        case 'setGraph':
            pause()
            graph = message.graph
            simulation = null
            break

        case 'reset':
            if (!graph) {
                fail('No map has been loaded yet')
                break
            }
            pause()
            try {
                simulation = createSimulation(graph, {
                    vehicleCount: message.vehicleCount,
                    seed: message.seed
                })
                awaitingAck = false
                sendFrame() // show the starting positions even while paused
            } catch (error) {
                simulation = null
                fail((error as Error).message)
            }
            break

        case 'play':
            play()
            break

        case 'pause':
            pause()
            break

        case 'setTimeScale':
            timeScale = message.value
            break

        case 'ack':
            awaitingAck = false
            break
    }
}