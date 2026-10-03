import { readFile } from 'node:fs/promises'
import type { RoadGraph } from './src/core/graph/types'
import { createSimulation } from './src/core/sim/createSimulation'

async function main(): Promise<void> {
    const { graph } = JSON.parse(await readFile(process.argv[2], 'utf-8')) as { graph: RoadGraph }
    const count = Number(process.argv[3] ?? 4000)
    const simulation = createSimulation(graph, { vehicleCount: count, seed: 1 })
    for (let i = 0; i < 20 * 600 && simulation.countStanding(120) === 0; i++) simulation.step(0.1)
    if (simulation.countStanding(120) === 0) {
        console.log('nothing stood for 120 s within 20 min')
        return
    }
    console.log(`first vehicle standing 120 s at ${simulation.time.toFixed(0)} s`)
    console.log(simulation.traceLeaders(120, 4).join('\n'))
}

main()