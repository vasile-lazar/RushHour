import type { RoadGraph } from '../graph/types'
import { createRng } from '../util/random'
import { IdmModel } from './models/Idm'
import { NO_SIGNALS, type CarFollowingModel, type EdgeFilter } from './ports'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation } from './Simulation'
import { TrafficSignals } from './signals/TrafficSignals'

export interface SimulationOptions {
    vehicleCount: number
    /** Same seed, same simulation */
    seed: number
    canDrive?: EdgeFilter
    model?: CarFollowingModel
    /** Set to false to run without traffic signals (default: on) */
    signals?: boolean
}

export function createSimulation(graph: RoadGraph, options: SimulationOptions): Simulation {
    const rng = createRng(options.seed)
    const canDrive = options.canDrive ?? isDrivable
    const planner = new RandomWalkPlanner(graph, canDrive)
    const signals =
        options.signals === false ? NO_SIGNALS : new TrafficSignals(graph, canDrive, rng)
    const simulation = new Simulation(graph, planner, rng, options.model ?? new IdmModel(), signals)
    simulation.spawn(options.vehicleCount)
    return simulation
}