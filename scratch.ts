import { readFile } from 'node:fs/promises'
import type { RoadGraph } from './src/core/graph/types'
import { createSimulation } from './src/core/sim/createSimulation'

async function main(): Promise<void> {
    const { graph } = JSON.parse(await readFile(process.argv[2], 'utf-8')) as { graph: RoadGraph }
    const count = Number(process.argv[3] ?? 5000)
    const simulation = createSimulation(graph, { vehicleCount: count, seed: 1 })

    const steps = 1000
    const started = performance.now()
    for (let i = 0; i < steps; i++) simulation.step(0.1)
    const ms = performance.now() - started
    console.log(`${count} vehicles, ${steps} steps (${simulation.time.toFixed(0)} s simulated)`)
    console.log(`${(ms / steps).toFixed(3)} ms per step`)

    const out = new Float32Array(count * 2)
    simulation.writePositions(out)
    const { minX, maxX, minY, maxY } = graph.bounds
    let outside = 0
    for (let i = 0; i < count; i++) {
        const x = out[2 * i]
        const y = out[2 * i + 1]
        if (x < minX - 1 || x > maxX + 1 || y < minY - 1 || y > maxY + 1) outside++
    }
    console.log(`${outside} vehicles outside the map bounds (should be 0)`)
}

main()