import { pointAlong } from '../graph/geometry'
import type { RoadGraph } from '../graph/types'
import {
    NO_JUNCTION_RULES,
    NO_SIGNALS,
    NO_TURN_RULES,
    type CarFollowingModel,
    type JunctionControl,
    type Rng,
    type RoutePlanner,
    type SignalControl,
    type TurnRules, PathRules, NO_PATH_RULES
} from './ports'

/** Vehicle length in meters, used to measure the gap between bumpers */
export const VEHICLE_LENGTH_M = 4.5
/** How far ahead a driver looks for vehicles in front and for lower speed limits */
const LOOKAHEAD_M = 150
/** Keep at least this many edges planned ahead, so drivers can see what is coming */
const MIN_EDGES_AHEAD = 8
/** The hardest a vehicle can physically brake (m/s²) */
const MAX_BRAKING = 9
/** Braking used to slow down early for a lower speed limit ahead (m/s²) */
const SLOWDOWN_BRAKING = 2
/** Braking a driver accepts when deciding whether to stop for a yellow light (m/s²) */
const YELLOW_BRAKING = 3
/** Only vehicles closer than this to a junction decide whether to give way */
const YIELD_DECISION_M = 40
/** Speed a vehicle slows down to when approaching a junction where it must give way (m/s) */
const YIELD_APPROACH_MS = 7
/** A vehicle must not arrive within this many seconds of a vehicle with priority */
const CRITICAL_GAP_S = 4
/** After waiting for PATIENCE_S, drivers accept this smaller gap */
const PATIENT_GAP_S = 2
const PATIENCE_S = 5
/** After waiting this long a driver pushes in regardless (this also breaks deadlocks) */
const FORCE_AFTER_S = 10
/** Below this speed a vehicle counts as standing still (m/s) */
const STANDING_MS = 0.5
/** Below this speed a vehicle at a junction counts as waiting, not as passing through (m/s) */
const CREEP_MS = 2
/** A vehicle this close to the junction is about to enter it (m) */
const NEAR_JUNCTION_M = 10
/** Speed a vehicle slows down to before a sharp turn (m/s) */
const TURN_SPEED_MS = 6
/** A vehicle that has stood still this long is stuck in a gridlock and is put elsewhere (s) */
const TELEPORT_AFTER_S = 180

interface Vehicle {
    /** Edge indices to drive along, in order */
    route: number[]
    /** Which edge of the route the vehicle is on */
    routeIndex: number
    /** Position of the front bumper: meters traveled along the current edge */
    offset: number
    /** Current speed in m/s */
    speed: number
    /** Acceleration decided for the current step */
    acceleration: number
    /** Fastest speed allowed right now, given lower speed limits coming up */
    speedCap: number
    /** Seconds spent (nearly) standing still; decides who goes first when equal roads meet */
    waited: number
}

/** Result of a leader search, reused to avoid creating an object per vehicle per step */
interface Leader {
    gap: number
    speed: number
}

export class Simulation {
    private readonly graph: RoadGraph
    private readonly planner: RoutePlanner
    private readonly rng: Rng
    private readonly model: CarFollowingModel
    private readonly vehicles: Vehicle[] = []
    /** Per edge: the vehicles on it, front-most first. Rebuilt every step. */
    private readonly lanes: Array<Vehicle[] | undefined>
    /** Edges that currently hold at least one vehicle */
    private readonly occupied: number[] = []
    private readonly leader: Leader = { gap: Infinity, speed: 0 }
    private elapsed = 0
    private teleported = 0
    private readonly signals: SignalControl
    private readonly junctions: JunctionControl
    private readonly turns: TurnRules
    private readonly paths: PathRules

    constructor(
        graph: RoadGraph,
        planner: RoutePlanner,
        rng: Rng,
        model: CarFollowingModel,
        signals: SignalControl = NO_SIGNALS,
        junctions: JunctionControl = NO_JUNCTION_RULES,
        turns: TurnRules = NO_TURN_RULES,
        paths: PathRules = NO_PATH_RULES
    ) {
        this.graph = graph
        this.planner = planner
        this.rng = rng
        this.model = model
        this.signals = signals
        this.junctions = junctions
        this.turns = turns
        this.lanes = new Array<Vehicle[] | undefined>(graph.edges.length)
        this.paths = paths
    }

    /** How many vehicles were taken out of a gridlock and put somewhere else */
    get teleports(): number {
        return this.teleported
    }

    /** How many vehicles have been standing still for at least `seconds` */
    countStanding(seconds: number): number {
        let count = 0
        for (const vehicle of this.vehicles) if (vehicle.waited >= seconds) count++
        return count
    }
    /** Debug: describes vehicles that have stood still for `seconds`, and what they wait for. */
    private describeFront(edge: number): string {
        const lane = this.lanes[edge]
        if (!lane || lane.length === 0) return `${edge}:empty`
        const f = lane[0]
        const to = (this.graph.edges[edge].length - f.offset).toFixed(0)
        return `${edge}:${to}m v=${f.speed.toFixed(1)} w=${f.waited.toFixed(0)} next=${f.route[f.routeIndex + 1] ?? '-'}`
    }

    /** Debug: follows each standing queue to its head, or to a cycle, and explains the head. */
    traceQueue(seconds: number, limit = 4): string[] {
        this.rebuildLanes()
        const edges = this.graph.edges
        const out: string[] = []
        const done = new Set<number>()
        for (const start of this.vehicles) {
            if (start.waited < seconds) continue
            const chain: number[] = []
            let last = start
            let e = start.route[start.routeIndex]
            let verdict = ''
            for (;;) {
                if (chain.includes(e)) {
                    verdict = 'CYCLE'
                    break
                }
                chain.push(e)
                const f = (this.lanes[e] as Vehicle[])[0]
                if (f.waited < seconds) {
                    verdict = 'head is moving'
                    break
                }
                last = f
                const n = f.route[f.routeIndex + 1]
                if (n === undefined) {
                    verdict = 'head at route end'
                    break
                }
                const nextLane = this.lanes[n]
                if (!nextLane || nextLane.length === 0) {
                    verdict = 'head blocked by rules, next edge empty'
                    break
                }
                e = n
            }
            const le = last.route[last.routeIndex]
            if (done.has(le)) continue
            done.add(le)
            const ln = last.route[last.routeIndex + 1]
            const node = this.graph.nodes[edges[le].to]
            const c = this.junctions.conflictsOf(le)
            out.push(
                `${verdict}: ${chain.join(' > ')}\n` +
                `   last standing: node (${node.x.toFixed(0)}, ${node.y.toFixed(0)}) edge ${le}->${ln ?? '-'} ` +
                `${edges[le].roadClass}, ${(edges[le].length - last.offset).toFixed(0)}m to end, ` +
                `w=${last.waited.toFixed(0)}, signal=${this.signals.stateOf(le, this.elapsed)}, ` +
                `left=${ln !== undefined && this.turns.crossesOncoming(le, ln)}\n` +
                `   higher: ${(c?.higher ?? []).map((o) => this.describeFront(o)).join(' | ')}\n` +
                `   equal: ${(c?.equal ?? []).map((o) => this.describeFront(o)).join(' | ')}\n` +
                `   oncoming: ${this.turns.oncoming(le).map((o) => this.describeFront(o)).join(' | ')}\n` +
                `   next edge: ${ln === undefined ? '-' : this.describeFront(ln)}\n` +
                `   scan: ${this.scanRoute(last)}`
            )
            if (out.length >= limit) break
        }
        return out
    }
    /** Debug: what blocks this vehicle along its route? */
    private scanRoute(vehicle: Vehicle): string {
        const edges = this.graph.edges
        let distance = edges[vehicle.route[vehicle.routeIndex]].length - vehicle.offset
        const parts: string[] = []
        for (let r = vehicle.routeIndex; r < vehicle.route.length && distance < LOOKAHEAD_M; r++) {
            const e = vehicle.route[r]
            const flags: string[] = []
            if (this.signalBlocks(e, distance, vehicle.speed)) flags.push('signal')
            if (this.junctionBlocks(vehicle, e, vehicle.route[r + 1], distance)) flags.push('junction')
            if (this.turnBlocks(vehicle, r, distance)) flags.push('turn')
            parts.push(`${e}@${distance.toFixed(0)}m[${flags.join(',')}]`)
            if (r + 1 >= vehicle.route.length) break
            distance += edges[vehicle.route[r + 1]].length
        }
        return `${parts.join(' ')} acc=${vehicle.acceleration.toFixed(2)} cap=${vehicle.speedCap.toFixed(1)} v=${vehicle.speed.toFixed(2)}`
    }
    /** Debug: follows who each standing vehicle waits behind, to the head of the queue or a cycle. */
    traceLeaders(seconds: number, limit = 4): string[] {
        this.rebuildLanes()
        const edges = this.graph.edges
        const leaderOf = (v: Vehicle): Vehicle | undefined => {
            const lane = this.lanes[v.route[v.routeIndex]] as Vehicle[]
            const i = lane.indexOf(v)
            if (i > 0) return lane[i - 1]
            let distance = edges[v.route[v.routeIndex]].length - v.offset
            for (let r = v.routeIndex + 1; r < v.route.length && distance < LOOKAHEAD_M; r++) {
                const l = this.lanes[v.route[r]]
                if (l && l.length > 0 && l[l.length - 1] !== v) return l[l.length - 1]
                distance += edges[v.route[r]].length
            }
            return undefined
        }
        const label = (v: Vehicle): string => {
            const e = v.route[v.routeIndex]
            return `${e}@${(edges[e].length - v.offset).toFixed(0)}m v=${v.speed.toFixed(1)} w=${v.waited.toFixed(0)}`
        }

        const out: string[] = []
        const seen = new Set<Vehicle>()
        for (const start of this.vehicles) {
            if (start.waited < seconds || seen.has(start)) continue
            const chain: Vehicle[] = []
            let v = start
            let verdict = ''
            for (;;) {
                if (chain.includes(v)) {
                    verdict = 'CYCLE'
                    break
                }
                chain.push(v)
                seen.add(v)
                if (v.waited < seconds) {
                    verdict = 'head is moving'
                    break
                }
                const ahead = leaderOf(v)
                if (!ahead) {
                    verdict = 'head has no leader (rules or signal)'
                    break
                }
                v = ahead
            }
            const head = chain[chain.length - 1]
            const node = this.graph.nodes[edges[head.route[head.routeIndex]].to]
            out.push(
                `${verdict} (${chain.length} vehicles): ${chain.slice(0, 12).map(label).join(' > ')}\n` +
                `   head at node (${node.x.toFixed(0)}, ${node.y.toFixed(0)}): ${this.scanRoute(head)}`
            )
            if (out.length >= limit) break
        }
        return out
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
            const vehicle: Vehicle = {
                route: [],
                routeIndex: 0,
                offset: 0,
                speed: 0,
                acceleration: 0,
                speedCap: 0,
                waited: 0
            }
            this.placeRandomly(vehicle)
            this.vehicles.push(vehicle)
        }
    }

    /** Puts a vehicle at an exact spot. Handy for tests and hand-made scenarios. */
    addVehicle(edgeIndex: number, offset: number, speed?: number): void {
        const edge = this.graph.edges[edgeIndex]
        this.vehicles.push({
            route: this.planner.plan(edgeIndex, this.rng),
            routeIndex: 0,
            offset,
            speed: speed ?? edge.speedLimit,
            acceleration: 0,
            speedCap: edge.speedLimit,
            waited: 0
        })
    }

    /** Advances the whole simulation by `dt` seconds. */
    step(dt: number): void {
        this.rebuildLanes()
        // Everyone decides based on the same snapshot...
        this.decide()
        // ...and only then does everyone move, so the update order cannot matter
        for (const vehicle of this.vehicles) this.move(vehicle, dt)
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

    /** Writes each vehicle's speed relative to its road's limit: 0 = stopped, 1 = at the limit. */
    writeSpeedRatios(out: Float32Array): void {
        const edges = this.graph.edges
        for (let i = 0; i < this.vehicles.length; i++) {
            const vehicle = this.vehicles[i]
            const limit = Math.max(edges[vehicle.route[vehicle.routeIndex]].speedLimit, 0.1)
            out[i] = Math.min(1, vehicle.speed / limit)
        }
    }

    /** Groups vehicles by edge and orders each group front to back. */
    private rebuildLanes(): void {
        for (const edge of this.occupied) (this.lanes[edge] as Vehicle[]).length = 0
        this.occupied.length = 0

        for (const vehicle of this.vehicles) {
            const edge = vehicle.route[vehicle.routeIndex]
            let lane = this.lanes[edge]
            if (!lane) {
                lane = []
                this.lanes[edge] = lane
            }
            if (lane.length === 0) this.occupied.push(edge)
            lane.push(vehicle)
        }

        for (const edge of this.occupied) {
            ;(this.lanes[edge] as Vehicle[]).sort((a, b) => b.offset - a.offset)
        }
    }

    /** Phase 1: every vehicle looks around and decides its acceleration. Nobody moves yet. */
    private decide(): void {
        const edges = this.graph.edges

        for (const edgeIndex of this.occupied) {
            const lane = this.lanes[edgeIndex] as Vehicle[]
            const edge = edges[edgeIndex]

            for (let i = 0; i < lane.length; i++) {
                const vehicle = lane[i]
                this.ensureRoute(vehicle)

                let hasLeader: boolean
                if (i > 0) {
                    const ahead = lane[i - 1] // the vehicle just in front on the same edge
                    this.leader.gap = ahead.offset - VEHICLE_LENGTH_M - vehicle.offset
                    this.leader.speed = ahead.speed
                    hasLeader = true
                } else {
                    hasLeader = this.findLeaderOnRoute(vehicle) // front of its edge: look further along the route
                }

                const wanted = this.model.acceleration(
                    vehicle.speed,
                    edge.speedLimit,
                    hasLeader ? this.leader.gap : Infinity,
                    hasLeader ? this.leader.speed : 0
                )
                vehicle.acceleration = Math.max(-MAX_BRAKING, wanted)
                vehicle.speedCap = this.speedCap(vehicle)
            }
        }
    }

    /**
     * Looks along the route for whatever the driver must react to first: a signal or a
     * junction they must wait at, or the rear-most vehicle on the next occupied edge.
     * Anything that blocks counts as a stopped vehicle sitting at the stop line.
     */
    private findLeaderOnRoute(vehicle: Vehicle): boolean {
        const edges = this.graph.edges
        // Distance from the front bumper to the end of edge `r`
        let distance = edges[vehicle.route[vehicle.routeIndex]].length - vehicle.offset

        for (let r = vehicle.routeIndex; r < vehicle.route.length && distance < LOOKAHEAD_M; r++) {
            const edgeIndex = vehicle.route[r]
            if (
                this.signalBlocks(edgeIndex, distance, vehicle.speed) ||
                this.junctionBlocks(vehicle, edgeIndex, vehicle.route[r + 1], distance) ||
                this.turnBlocks(vehicle, r, distance)
            ) {
                this.leader.gap = distance
                this.leader.speed = 0
                return true
            }
            if (r + 1 >= vehicle.route.length) break

            const nextEdge = vehicle.route[r + 1]
            const lane = this.lanes[nextEdge]
            if (lane && lane.length > 0) {
                const rearmost = lane[lane.length - 1]
                if (rearmost !== vehicle) {
                    this.leader.gap = distance + rearmost.offset - VEHICLE_LENGTH_M
                    this.leader.speed = rearmost.speed
                    return true
                }
            }
            distance += edges[nextEdge].length
        }
        return false
    }

    /** Must this vehicle wait at the end of `edge` for traffic that has priority? */
    private junctionBlocks(
        vehicle: Vehicle,
        edge: number,
        next: number | undefined,
        distance: number
    ): boolean {
        const conflicts = this.junctions.conflictsOf(edge)
        if (!conflicts || distance > YIELD_DECISION_M) return false
        if (vehicle.waited > FORCE_AFTER_S) return false // has waited long enough: pushes in
        // Too close and too fast to stop any more: the vehicle is committed
        if (distance < (vehicle.speed * vehicle.speed) / (2 * MAX_BRAKING)) return false

        const gap = vehicle.waited > PATIENCE_S ? PATIENT_GAP_S : CRITICAL_GAP_S
        for (const other of conflicts.higher) {
            if (this.approachBusy(other, gap, vehicle, edge, next, false)) return true
        }
        for (const other of conflicts.equal) {
            if (this.approachBusy(other, gap, vehicle, edge, next, true)) return true
        }
        return false
    }

    /** Is the front vehicle of approach `other` about to use the junction? */
    private approachBusy(
        other: number,
        gap: number,
        waiting: Vehicle,
        waitingEdge: number,
        waitingNext: number | undefined,
        equalRank: boolean
    ): boolean {
        if (this.frontBusy(other, 0, gap, waiting, waitingEdge, waitingNext, equalRank)) return true

        // Ring edges of a roundabout are short, so the vehicle about to arrive is often
        // still on the edge before: watch that one too
        const before = this.junctions.upstreamOf(other)
        return (
            before >= 0 &&
            this.frontBusy(
                before,
                this.graph.edges[other].length,
                gap,
                waiting,
                waitingEdge,
                waitingNext,
                equalRank
            )
        )
    }

    /** `extra` is the distance from the end of `edge` to the junction, if it is not right there. */
    private frontBusy(
        edge: number,
        extra: number,
        gap: number,
        waiting: Vehicle,
        waitingEdge: number,
        waitingNext: number | undefined,
        equalRank: boolean
    ): boolean {
        const lane = this.lanes[edge]
        if (!lane || lane.length === 0) return false
        const front = lane[0]

        // Its path may not touch ours at all (a turn into another road, say): then ignore it.
        // Roundabout rings keep absolute priority over anything entering.
        if (extra === 0 && waitingNext !== undefined && !this.graph.edges[edge].roundabout) {
            const frontNext = front.route[front.routeIndex + 1]
            if (
                frontNext !== undefined &&
                !this.paths.cross(waitingEdge, waitingNext, edge, frontNext)
            ) {
                return false
            }
        }

        const distance = this.graph.edges[edge].length - front.offset + extra

        if (front.speed > CREEP_MS) {
            // Moving: it is in the way if it is at the junction already or will be there soon
            return distance < NEAR_JUNCTION_M || distance / front.speed < gap
        }
        if (distance > NEAR_JUNCTION_M) return false // a queue further back, not about to enter
        if (!equalRank) return true // someone with priority is waiting right at the junction
        // Equal roads and both waiting: first come, first served (lower edge index breaks a tie)
        return front.waited > waiting.waited || (front.waited === waiting.waited && edge < waitingEdge)
    }

    /** Must a vehicle about to turn across the road wait for oncoming traffic? */
    private turnBlocks(vehicle: Vehicle, r: number, distance: number): boolean {
        const nextIndex = vehicle.route[r + 1]
        if (nextIndex === undefined) return false
        const edgeIndex = vehicle.route[r]
        if (!this.turns.crossesOncoming(edgeIndex, nextIndex)) return false

        if (distance > YIELD_DECISION_M || vehicle.waited > FORCE_AFTER_S) return false
        // Too close and too fast to stop any more: the vehicle is committed
        if (distance < (vehicle.speed * vehicle.speed) / (2 * MAX_BRAKING)) return false

        const gap = vehicle.waited > PATIENCE_S ? PATIENT_GAP_S : CRITICAL_GAP_S
        for (const other of this.turns.oncoming(edgeIndex)) {
            const lane = this.lanes[other]
            if (!lane || lane.length === 0) continue
            const front = lane[0]
            if (front.speed <= STANDING_MS) continue // standing still: not about to enter

            // Oncoming traffic whose path does not cross ours (another left turn, a right turn) passes
            const frontNext = front.route[front.routeIndex + 1]
            if (frontNext !== undefined && !this.paths.cross(edgeIndex, nextIndex, other, frontNext)) continue
            if (frontNext !== undefined && this.turns.crossesOncoming(other, frontNext)) continue

            const toJunction = this.graph.edges[other].length - front.offset
            if (toJunction < NEAR_JUNCTION_M || toJunction / front.speed < gap) return true
        }
        return false
    }
    
    /** Must a vehicle `distance` meters from the end of `edge` stop for the signal there? */
    private signalBlocks(edge: number, distance: number, speed: number): boolean {
        const state = this.signals.stateOf(edge, this.elapsed)
        if (state === 'green') return false

        // Only stop if it can still be done: on yellow comfortably, on red physically possible
        const braking = state === 'yellow' ? YELLOW_BRAKING : MAX_BRAKING
        return distance >= (speed * speed) / (2 * braking)
    }

    /**
     * The highest speed from which the vehicle can still slow down comfortably to every
     * speed limit within sight, and to the approach speed of a junction where it must give way:
     * sqrt(target² + 2 * braking * distance).
     */
    private speedCap(vehicle: Vehicle): number {
        const edges = this.graph.edges
        const currentIndex = vehicle.route[vehicle.routeIndex]
        const current = edges[currentIndex]
        let cap = current.speedLimit
        let distance = current.length - vehicle.offset // to the end of the edge being looked at
        cap = Math.min(cap, this.junctionCap(currentIndex, distance))

        for (let r = vehicle.routeIndex + 1; r < vehicle.route.length && distance < LOOKAHEAD_M; r++) {
            const previousIndex = vehicle.route[r - 1]
            const edgeIndex = vehicle.route[r]
            const next = edges[edgeIndex]
            cap = Math.min(cap, Math.sqrt(next.speedLimit ** 2 + 2 * SLOWDOWN_BRAKING * distance))
            if (this.turns.isSharpTurn(previousIndex, edgeIndex)) {
                cap = Math.min(cap, Math.sqrt(TURN_SPEED_MS ** 2 + 2 * SLOWDOWN_BRAKING * distance))
            }
            distance += next.length
            cap = Math.min(cap, this.junctionCap(edgeIndex, distance))
        }
        return cap
    }

    /** Speed cap for a junction at the end of `edge`: infinite unless the edge has to give way there. */
    private junctionCap(edge: number, distanceToEnd: number): number {
        if (!this.junctions.conflictsOf(edge)) return Infinity
        return Math.sqrt(YIELD_APPROACH_MS ** 2 + 2 * SLOWDOWN_BRAKING * distanceToEnd)
    }

    /** Plans more road when the route is running short. Does nothing at a true dead end. */
    private ensureRoute(vehicle: Vehicle): void {
        if (vehicle.route.length - vehicle.routeIndex > MIN_EDGES_AHEAD) return

        const last = vehicle.route[vehicle.route.length - 1]
        const more = this.planner.plan(last, this.rng)
        if (more.length < 2) return // the road ends here: nothing to add

        // Forget the part already driven; more[0] is the edge the route already ends with
        vehicle.route = vehicle.route.slice(vehicle.routeIndex).concat(more.slice(1))
        vehicle.routeIndex = 0
    }

    /** Phase 2: apply the decided acceleration and move the vehicle. */
    private move(vehicle: Vehicle, dt: number): void {
        const edges = this.graph.edges
        const accelerated = Math.max(0, vehicle.speed + vehicle.acceleration * dt)
        vehicle.speed = Math.min(accelerated, vehicle.speedCap)
        vehicle.waited = vehicle.speed < STANDING_MS ? vehicle.waited + dt : 0
        if (vehicle.waited > TELEPORT_AFTER_S) {
            this.teleported++
            this.placeRandomly(vehicle) // gridlock: put the vehicle somewhere else
            return
        }
        vehicle.offset += vehicle.speed * dt

        let edge = edges[vehicle.route[vehicle.routeIndex]]
        // Possibly cross several short edges in one step
        while (vehicle.offset >= edge.length) {
            vehicle.offset -= edge.length
            vehicle.routeIndex++
            if (vehicle.routeIndex >= vehicle.route.length) {
                this.placeRandomly(vehicle) // the road ended: reappear somewhere else
                return
            }
            edge = edges[vehicle.route[vehicle.routeIndex]]
        }
    }

    private placeRandomly(vehicle: Vehicle): void {
        const start = this.planner.randomStart(this.rng)
        const edge = this.graph.edges[start]
        vehicle.route = this.planner.plan(start, this.rng)
        vehicle.routeIndex = 0
        vehicle.offset = this.rng() * edge.length
        vehicle.speed = edge.speedLimit
        vehicle.acceleration = 0
        vehicle.speedCap = edge.speedLimit
    }
}