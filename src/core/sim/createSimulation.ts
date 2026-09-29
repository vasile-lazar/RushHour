import type { RoadGraph } from '../graph/types'
import { createRng } from '../util/random'
import type { EdgeFilter } from './ports'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation } from './Simulation'

export interface SimulationOptions {
    vehicleCount: number
    /** Same seed, same simulation */
    seed: number
    canDrive?: EdgeFilter
}

export function createSimulation(graph: RoadGraph, options: SimulationOptions): Simulation {
    const rng = createRng(options.seed)
    const planner = new RandomWalkPlanner(graph, options.canDrive ?? isDrivable)
    const simulation = new Simulation(graph, planner, rng)
    simulation.spawn(options.vehicleCount)
    return simulation
}