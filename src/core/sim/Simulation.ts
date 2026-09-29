import { pointAlong } from '../graph/geometry'
import type { RoadGraph } from '../graph/types'
import type { Rng, RoutePlanner } from './ports'

interface Vehicle {
    /** Edge indices to drive along, in order */
    route: number[]
    /** Which edge of the route the vehicle is on */
    routeIndex: number
    /** Meters travelled along the current edge */
    offset: number
    /** Current speed in m/s */
    speed: number
}

export class Simulation {
    private readonly graph: RoadGraph
    private readonly planner: RoutePlanner
    private readonly rng: Rng
    private readonly vehicles: Vehicle[] = []
    private elapsed = 0

    constructor(graph: RoadGraph, planner: RoutePlanner, rng: Rng) {
        this.graph = graph
        this.planner = planner
        this.rng = rng
    }

    get vehicleCount(): number {
        return this.vehicles.length
    }

    /** Simulated time in seconds */
    get time(): number {
        return this.elapsed
    }

    spawn(count: number): void {
        for (let i = 0; i < count; i++) {
            const vehicle: Vehicle = { route: [], routeIndex: 0, offset: 0, speed: 0 }
            this.placeRandomly(vehicle)
            this.vehicles.push(vehicle)
        }
    }

    /** Advances the whole simulation by `dt` seconds. */
    step(dt: number): void {
        for (const vehicle of this.vehicles) this.advance(vehicle, dt)
        this.elapsed += dt
    }

    /** Writes every vehicle's (x, y) into `out` as x0, y0, x1, y1, ... (needs 2 * vehicleCount slots). */
    writePositions(out: Float32Array): void {
        const edges = this.graph.edges
        for (let i = 0; i < this.vehicles.length; i++) {
            const vehicle = this.vehicles[i]
            const edge = edges[vehicle.route[vehicle.routeIndex]]
            pointAlong(edge.geometry, vehicle.offset, out, i * 2)
        }
    }

    private advance(vehicle: Vehicle, dt: number): void {
        const edges = this.graph.edges
        let edge = edges[vehicle.route[vehicle.routeIndex]]
        vehicle.speed = edge.speedLimit
        vehicle.offset += vehicle.speed * dt

        // Possibly cross several short edges in one step
        while (vehicle.offset >= edge.length) {
            vehicle.offset -= edge.length
            vehicle.routeIndex++
            if (vehicle.routeIndex >= vehicle.route.length && !this.extendRoute(vehicle)) {
                this.placeRandomly(vehicle) // nowhere left to go: reappear somewhere else
                return
            }
            edge = edges[vehicle.route[vehicle.routeIndex]]
        }
    }

    /** Plans more road beyond the end of the route. Returns false at a true dead end. */
    private extendRoute(vehicle: Vehicle): boolean {
        const last = vehicle.route[vehicle.route.length - 1]
        const next = this.planner.plan(last, this.rng)
        if (next.length < 2) return false
        vehicle.route = next // next[0] is the edge we just finished
        vehicle.routeIndex = 1
        return true
    }

    private placeRandomly(vehicle: Vehicle): void {
        const start = this.planner.randomStart(this.rng)
        const edge = this.graph.edges[start]
        vehicle.route = this.planner.plan(start, this.rng)
        vehicle.routeIndex = 0
        vehicle.offset = this.rng() * edge.length
        vehicle.speed = edge.speedLimit
    }
}