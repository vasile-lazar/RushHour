import type { RoadGraph } from '../graph/types'
import { createRng } from '../util/random'
import { IdmModel } from './models/Idm'
import {
    NO_SIGNALS,
    type CarFollowingModel,
    type EdgeFilter,
    NO_JUNCTION_RULES,
    NO_TURN_RULES,
    NO_PATH_RULES
} from './ports'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation } from './Simulation'
import { TrafficSignals } from './signals/TrafficSignals'
import { PriorityJunctions } from './junctions/PriorityJunctions'
import { Turns } from './junctions/Turns'
import {Movements} from "@core/sim/junctions/Movements";

export interface SimulationOptions {
    vehicleCount: number
    /** Same seed, same simulation */
    seed: number
    canDrive?: EdgeFilter
    model?: CarFollowingModel
    /** Set to false to run without traffic signals (default: on) */
    signals?: boolean
    /** Set to false to run without priority rules at junctions (default: on) */
    junctions?: boolean
    /** Set to false to run without left-turn yielding and turn slowdowns (default: on) */
    turns?: boolean
}

export function createSimulation(graph: RoadGraph, options: SimulationOptions): Simulation {
    const rng = createRng(options.seed)
    const canDrive = options.canDrive ?? isDrivable
    const planner = new RandomWalkPlanner(graph, canDrive)
    const signals =
        options.signals === false ? NO_SIGNALS : new TrafficSignals(graph, canDrive, rng)
    const junctions =
        options.junctions === false
            ? NO_JUNCTION_RULES
            : new PriorityJunctions(graph, canDrive, signals, rng)
    const turns = options.turns === false ? NO_TURN_RULES : new Turns(graph)
    const paths = options.junctions === false ? NO_PATH_RULES : new Movements(graph)
    const simulation = new Simulation(
        graph,
        planner,
        rng,
        options.model ?? new IdmModel(),
        signals,
        junctions,
        turns,
        paths
    )
    simulation.spawn(options.vehicleCount)
    return simulation
}