import { MapView } from './view/MapView'

const form = document.getElementById('city-form') as HTMLFormElement
const input = document.getElementById('city-input') as HTMLInputElement
const button = document.getElementById('load-button') as HTMLButtonElement
const state = document.getElementById('status') as HTMLSpanElement
const map = new MapView(document.getElementById('map') as HTMLCanvasElement)

window.trafficSim.onCityProgress((message) => {
    state.textContent = message
})

form.addEventListener('submit', async (event) => {
    event.preventDefault()
    button.disabled = true
    try {
        const graph = await window.trafficSim.loadCity(input.value)
        map.setGraph(graph)
        state.textContent =
            `${graph.name}: ${graph.nodes.length} intersections, ${graph.edges.length} road segments`
    } catch (error) {
        state.textContent = `Failed: ${readableError(error)}`
    } finally {
        button.disabled = false
    }
})

/** Electron prefixes IPC errors with "Error invoking remote method ..."; strip that. */
function readableError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}