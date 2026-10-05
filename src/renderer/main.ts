import type { RoadGraph } from '@core/graph/types'
import type { JunctionReport } from '@core/sim/ports'
import { SimClient } from './sim/SimClient'
import { MapView } from './view/MapView'
import {junctionCsv} from "./junctionCsv";

const SEED = 1 // same seed, same simulation: handy for reproducing bugs
const MIN_VEHICLES = 1
const MAX_VEHICLES = 100_000

const form = document.getElementById('city-form') as HTMLFormElement
const cityInput = document.getElementById('city-input') as HTMLInputElement
const loadButton = document.getElementById('load-button') as HTMLButtonElement
const countInput = document.getElementById('vehicle-count') as HTMLInputElement
const playButton = document.getElementById('play-button') as HTMLButtonElement
const speedSelect = document.getElementById('speed-select') as HTMLSelectElement
const status = document.getElementById('status') as HTMLSpanElement
const achieved = document.getElementById('achieved') as HTMLSpanElement

const map = new MapView(document.getElementById('map') as HTMLCanvasElement)
const sim = new SimClient()
const junctionPanel = createJunctionPanel()

let currentGraph: RoadGraph | null = null
let playing = false
let measureWall = 0
let measureSimTime = 0

sim.onFrame = (positions, speeds, lanes, signals, time) => {
    map.setVehicles(positions, speeds, lanes)
    map.setSignalStates(signals)

    // Once a second, show how fast the simulation really runs compared to real time
    const now = performance.now()
    if (measureWall === 0 || time < measureSimTime) {
        measureWall = now // first frame, or a new simulation just started
        measureSimTime = time
    }
    if (now - measureWall >= 1000) {
        const speedup = (time - measureSimTime) / ((now - measureWall) / 1000)
        achieved.textContent = `running at ${speedup.toFixed(1)}×`
        measureWall = now
        measureSimTime = time
    }
}

sim.onSignalSetup = (approaches) => map.setSignalApproaches(approaches)

sim.onJunctions = (rows) => junctionPanel.show(rows)

sim.onJunctionTable = (rows, time) =>
    downloadText(`junctions-${Math.round(time / 60)}min.csv`, junctionCsv(rows))

sim.onError = (message) => {
    status.textContent = `Simulation error: ${message}`
    setPlaying(false)
}
window.trafficSim.onCityProgress((message) => {
    status.textContent = message
})

form.addEventListener('submit', async (event) => {
    event.preventDefault()
    loadButton.disabled = true
    try {
        const graph = await window.trafficSim.loadCity(cityInput.value)
        currentGraph = graph
        map.setGraph(graph)
        sim.setGraph(graph)
        startSimulation()
        status.textContent =
            `${graph.name}: ${graph.nodes.length} intersections, ${graph.edges.length} road segments`
    } catch (error) {
        status.textContent = `Failed: ${readableError(error)}`
    } finally {
        loadButton.disabled = false
    }
})

playButton.addEventListener('click', () => setPlaying(!playing))
speedSelect.addEventListener('change', () => sim.setTimeScale(Number(speedSelect.value)))
countInput.addEventListener('change', () => startSimulation())

/** Starts a fresh simulation on the loaded city and begins playing. */
function startSimulation(): void {
    if (!currentGraph) return
    sim.setTimeScale(Number(speedSelect.value))
    sim.reset(readVehicleCount(), SEED)
    setPlaying(true)
}

function setPlaying(value: boolean): void {
    playing = value
    playButton.textContent = value ? 'Pause' : 'Play'
    playButton.disabled = currentGraph === null
    if (value) sim.play()
    else sim.pause()
}

/** Reads the vehicle count, forcing it into the allowed range (and fixing the box if needed). */
function readVehicleCount(): number {
    const parsed = Math.round(Number(countInput.value))
    const count = Number.isFinite(parsed)
        ? Math.min(MAX_VEHICLES, Math.max(MIN_VEHICLES, parsed))
        : MIN_VEHICLES
    countInput.value = String(count)
    return count
}

/** Electron prefixes IPC errors with "Error invoking remote method ..."; strip that. */
function readableError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** A small panel (bottom right) listing the junctions with the most delay; click a row to zoom there. */
function createJunctionPanel(): { show(rows: JunctionReport[]): void } {
    const box = document.createElement('div')
    Object.assign(box.style, {
        position: 'fixed',
        right: '12px',
        bottom: '12px',
        minWidth: '240px',
        padding: '8px 10px',
        background: 'rgba(15, 20, 28, 0.88)',
        color: '#dbe4ee',
        font: '12px/1.6 system-ui, sans-serif',
        borderRadius: '6px',
        zIndex: '10'
    })
    const title = document.createElement('div')
    title.textContent = 'Worst junctions by total delay (click a row to zoom)'
    Object.assign(title.style, { fontWeight: '600', cursor: 'pointer', marginBottom: '4px' })
    const list = document.createElement('div')
    const exportButton = document.createElement('button')
    exportButton.textContent = 'Export all as CSV'
    exportButton.style.marginTop = '6px'
    exportButton.addEventListener('click', () => sim.exportJunctions())
    box.append(title, list, exportButton)
    document.body.append(box)
    title.addEventListener('click', () => {
        list.hidden = !list.hidden // click the title to fold the panel
    })

    return {
        show(rows) {
            if (rows.length === 0) {
                list.textContent = 'No delays yet'
                return
            }
            list.replaceChildren(
                ...rows.map((row, i) => {
                    const line = document.createElement('div')
                    line.textContent =
                        `${i + 1}. avg wait ${row.average.toFixed(1)} s · queue ${row.maxQueue} · ${row.passed} passed`
                    line.style.cursor = 'pointer'
                    line.addEventListener('click', () => map.focusOn(row.x, row.y))
                    return line
                })
            )
        }
    }
}

function downloadText(name: string, text: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    URL.revokeObjectURL(url)
}