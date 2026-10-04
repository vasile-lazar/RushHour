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
    type TurnRules, PathRules, NO_PATH_RULES, LaneGuide, NO_LANE_GUIDE
} from './ports'
import {laneCentre} from "@core/graph/laneGeometry";

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
/** Vehicles start moving into the right lane for a turn this far before the junction (m) */
const LANE_PLAN_M = 200
/** After a lane change, a driver waits this long before changing again (s) */
const LANE_CHANGE_COOLDOWN_S = 4
/** The gap needed in the lane beside, ahead of and behind a changing vehicle: this plus a time gap */
const LANE_MIN_GAP_M = 3
const LANE_TIME_GAP_S = 0.6
/** A driver below this share of the speed limit counts as held up */
const LANE_BLOCKED_RATIO = 0.75
/** Another lane must have this much more room ahead to be worth changing for (m) */
const LANE_GAIN_M = 15
/** A queue head blocked by a vehicle ahead for this long takes another turn (s) */
const REROUTE_AFTER_S = 20
/** After rerouting, a driver waits this long before doing it again (s) */
const REROUTE_COOLDOWN_S = 20


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
    /** Seconds spent standing in a queue; creeping forward keeps it, driving off resets it */
    waited: number
    /** Which lane of the current edge, counted from the leftmost (0) */
    lane: number
    /** Seconds until the next lane change is allowed */
    laneCooldown: number
    /** Seconds until this driver may reroute again */
    rerouteCooldown: number
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
    /** Per lane slot (see laneBase): the vehicles in it, front-most first. Rebuilt every step. */
    private readonly lanes: Array<Vehicle[] | undefined>
    /** Per edge: index of its first lane slot; its slots are laneBase[e] .. laneBase[e + 1] - 1 */
    private readonly laneBase: Int32Array
    /** Per slot: the edge it belongs to */
    private readonly slotEdge: Int32Array
    /** Lane slots that currently hold at least one vehicle */
    private readonly occupied: number[] = []
    private readonly leader: Leader = { gap: Infinity, speed: 0 }
    private elapsed = 0
    private teleported = 0
    private lastTeleportEdge = -1
    private readonly signals: SignalControl
    private readonly junctions: JunctionControl
    private readonly turns: TurnRules
    private readonly paths: PathRules
    private readonly guide: LaneGuide
    private readonly changesLanes: boolean
    private readonly probe = new Float32Array(4)
    /** Set by findLeaderOnRoute: the route index whose next edge holds the blocking vehicle, or -1 */
    private blockedAt = -1
    
    constructor(
        graph: RoadGraph,
        planner: RoutePlanner,
        rng: Rng,
        model: CarFollowingModel,
        signals: SignalControl = NO_SIGNALS,
        junctions: JunctionControl = NO_JUNCTION_RULES,
        turns: TurnRules = NO_TURN_RULES,
        paths: PathRules = NO_PATH_RULES,
        guide: LaneGuide = NO_LANE_GUIDE
    ) {
        this.graph = graph
        this.planner = planner
        this.rng = rng
        this.model = model
        this.signals = signals
        this.junctions = junctions
        this.turns = turns
        this.laneBase = new Int32Array(graph.edges.length + 1)
        graph.edges.forEach((edge, i) => {
            this.laneBase[i + 1] = this.laneBase[i] + Math.max(1, edge.lanes)
        })
        this.slotEdge = new Int32Array(this.laneBase[graph.edges.length])
        graph.edges.forEach((_, i) => this.slotEdge.fill(i, this.laneBase[i], this.laneBase[i + 1]))
        this.lanes = new Array<Vehicle[] | undefined>(this.laneBase[graph.edges.length])
        this.paths = paths
        this.guide = guide
        this.changesLanes = guide !== NO_LANE_GUIDE
    }

    private laneCount(edge: number): number {
        return this.laneBase[edge + 1] - this.laneBase[edge]
    }

    /** The queue slot of a lane; a lane number beyond the road's lanes uses its last lane. */
    private slot(edge: number, lane: number): number {
        return this.laneBase[edge] + Math.min(lane, this.laneCount(edge) - 1)
    }
    
    /** How many vehicles were taken out of a gridlock and put somewhere else */
    get teleports(): number {
        return this.teleported
    }

    /** The edge the most recently teleported vehicle was stuck on, or -1 */
    get lastTeleport(): number {
        return this.lastTeleportEdge
    }

    /** How many vehicles have been standing still for at least `seconds` */
    countStanding(seconds: number): number {
        let count = 0
        for (const vehicle of this.vehicles) if (vehicle.waited >= seconds) count++
        return count
    }

    /** Debug: follows who each standing vehicle waits behind, to the head of its queue or a cycle. */
    traceLeaders(seconds: number, limit = 4): string[] {
        this.rebuildLanes()
        const edges = this.graph.edges
        const leaderOf = (v: Vehicle): Vehicle | undefined => {
            const edge = v.route[v.routeIndex]
            const queue = this.lanes[this.slot(edge, v.lane)] as Vehicle[]
            const i = queue.indexOf(v)
            if (i > 0) return queue[i - 1]
            let distance = edges[edge].length - v.offset
            let lane = v.lane
            for (let r = v.routeIndex + 1; r < v.route.length && distance < LOOKAHEAD_M; r++) {
                lane = this.guide.laneAfter(v.route[r - 1], v.route[r], lane)
                const ahead = this.lanes[this.slot(v.route[r], lane)]
                if (ahead && ahead.length > 0 && ahead[ahead.length - 1] !== v) return ahead[ahead.length - 1]
                distance += edges[v.route[r]].length
            }
            return undefined
        }
        const label = (v: Vehicle): string => {
            const e = v.route[v.routeIndex]
            return `${e}.${v.lane}@${(edges[e].length - v.offset).toFixed(0)}m v=${v.speed.toFixed(1)} w=${v.waited.toFixed(0)}`
        }
        const scan = (v: Vehicle): string => {
            let distance = edges[v.route[v.routeIndex]].length - v.offset
            const parts: string[] = []
            for (let r = v.routeIndex; r < v.route.length && distance < LOOKAHEAD_M; r++) {
                const e = v.route[r]
                const flags: string[] = []
                if (this.signalBlocks(e, distance, v.speed)) flags.push('signal')
                if (this.junctionBlocks(v, e, this.exitOf(v.route, r), distance)) flags.push('junction')
                if (this.turnBlocks(v, r, distance)) flags.push('turn')
                parts.push(`${e}@${distance.toFixed(0)}m[${flags.join(',')}]`)
                if (r + 1 >= v.route.length) break
                distance += edges[v.route[r + 1]].length
            }
            return `${parts.join(' ')} acc=${v.acceleration.toFixed(2)} cap=${v.speedCap.toFixed(1)} lane=${v.lane}`
        }

        const fronts = (list: readonly number[]): string =>
            list
                .map((e) => {
                    const parts: string[] = []
                    for (let lane = 0; lane < this.laneCount(e); lane++) {
                        const queue = this.lanes[this.laneBase[e] + lane]
                        if (!queue || queue.length === 0) continue
                        const f = queue[0]
                        parts.push(
                            `${e}.${lane}:${(edges[e].length - f.offset).toFixed(0)}m v=${f.speed.toFixed(1)} ` +
                            `w=${f.waited.toFixed(0)} exit=${this.exitOf(f.route, f.routeIndex) ?? '-'}`
                        )
                    }
                    return parts.length > 0 ? parts.join(', ') : `${e}:empty`
                })
                .join(' | ')

        const out: string[] = []
        const seen = new Set<Vehicle>()
        let flowing = 0
        for (const start of this.vehicles) {
            if (start.waited < seconds || seen.has(start)) continue
            const chain: Vehicle[] = []
            let v = start
            let verdict = ''
            for (;;) {
                if (chain.includes(v)) {
                    const loop = chain.slice(chain.indexOf(v))
                    verdict = loop.every((x) => x.speed < 1.5) ? 'CYCLE' : 'moving loop'
                    break
                }
                chain.push(v)
                seen.add(v)
                if (chain.length > 300) {
                    verdict = 'chain too long'
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
            if (verdict === 'moving loop' || (verdict !== 'CYCLE' && head.speed > 1.5)) {
                flowing++ // a slow queue behind a head that is moving: not a jam
                continue
            }
            const node = this.graph.nodes[edges[head.route[head.routeIndex]].to]
            const headEdge = head.route[head.routeIndex]
            const conflicts = this.junctions.conflictsOf(headEdge)
            out.push(
                `${verdict} (${chain.length} vehicles): ${chain.slice(-6).map(label).join(' > ')}\n` +
                `   head at node (${node.x.toFixed(0)}, ${node.y.toFixed(0)}): ${scan(head)}\n` +
                `   exit=${this.exitOf(head.route, head.routeIndex) ?? '-'}\n` +
                `   higher: ${fronts(conflicts?.higher ?? [])}\n` +
                `   equal: ${fronts(conflicts?.equal ?? [])}\n` +
                `   oncoming: ${fronts(this.turns.oncoming(headEdge))}`
            )
            if (out.length >= limit) break
        }
        out.push(`queues behind a moving head: ${flowing}`)
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
                waited: 0,
                lane: 0,
                laneCooldown: 0,
                rerouteCooldown: 0,
            }
            this.placeRandomly(vehicle)
            this.vehicles.push(vehicle)
        }
    }

    /** Puts a vehicle at an exact spot. Handy for tests and hand-made scenarios. */
    addVehicle(edgeIndex: number, offset: number, speed?: number, lane = 0): void {
        const edge = this.graph.edges[edgeIndex]
        this.vehicles.push({
            route: this.planner.plan(edgeIndex, this.rng),
            routeIndex: 0,
            lane: Math.min(lane, this.laneCount(edgeIndex) - 1),
            offset,
            speed: speed ?? edge.speedLimit,
            acceleration: 0,
            speedCap: edge.speedLimit,
            waited: 0,
            laneCooldown: 0,
            rerouteCooldown: 0,
        })
    }

    /** Advances the whole simulation by `dt` seconds. */
    step(dt: number): void {
        this.rebuildLanes()
        this.changeLanes(dt)
        // Everyone decides based on the same snapshot...
        this.decide()
        // ...and only then does everyone move, so the update order cannot matter
        for (const vehicle of this.vehicles) this.move(vehicle, dt)
        this.elapsed += dt
    }

    /**
     * Writes every vehicle's (x, y) into `out` as x0, y0, x1, y1, ... (needs 2 * vehicleCount slots).
     * With `shiftToLane`, each vehicle is moved sideways into its lane (to the right of its direction).
     */
    writePositions(out: Float32Array, shiftToLane = false): void {
        const edges = this.graph.edges
        const probe = this.probe
        for (let i = 0; i < this.vehicles.length; i++) {
            const vehicle = this.vehicles[i]
            const edge = edges[vehicle.route[vehicle.routeIndex]]
            pointAlong(edge.geometry, vehicle.offset, out, i * 2)
            if (!shiftToLane) continue

            // Heading: the direction of the road over the next meter
            const start = Math.max(0, Math.min(vehicle.offset, edge.length - 1))
            pointAlong(edge.geometry, start, probe, 0)
            pointAlong(edge.geometry, start + 1, probe, 2)
            const dx = probe[2] - probe[0]
            const dy = probe[3] - probe[1]
            const norm = Math.hypot(dx, dy)
            if (norm < 1e-6) continue
            const shift = laneCentre(vehicle.lane) / norm
            out[i * 2] += dy * shift // right of travel in a y-up world is (dy, -dx)
            out[i * 2 + 1] -= dx * shift
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

    /** Groups vehicles by lane and orders each group front to back. */
    private rebuildLanes(): void {
        for (const slot of this.occupied) (this.lanes[slot] as Vehicle[]).length = 0
        this.occupied.length = 0

        for (const vehicle of this.vehicles) {
            const slot = this.slot(vehicle.route[vehicle.routeIndex], vehicle.lane)
            let queue = this.lanes[slot]
            if (!queue) {
                queue = []
                this.lanes[slot] = queue
            }
            if (queue.length === 0) this.occupied.push(slot)
            queue.push(vehicle)
        }

        for (const slot of this.occupied) {
            ;(this.lanes[slot] as Vehicle[]).sort((a, b) => b.offset - a.offset)
        }
    }

    /** Phase 1: every vehicle looks around and decides its acceleration. Nobody moves yet. */
    private decide(): void {
        const edges = this.graph.edges

        for (const slotIndex of this.occupied) {
            const lane = this.lanes[slotIndex] as Vehicle[]
            const edgeIndex = this.slotEdge[slotIndex]
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
                    if (
                        hasLeader &&
                        this.blockedAt >= 0 &&
                        vehicle.waited >= REROUTE_AFTER_S &&
                        vehicle.rerouteCooldown <= 0
                    ) {
                        this.reroute(vehicle, this.blockedAt)
                    }
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
        this.blockedAt = -1
        const edges = this.graph.edges
        // Distance from the front bumper to the end of edge `r`
        let distance = edges[vehicle.route[vehicle.routeIndex]].length - vehicle.offset
        let lane = vehicle.lane
        
        for (let r = vehicle.routeIndex; r < vehicle.route.length && distance < LOOKAHEAD_M; r++) {
            const edgeIndex = vehicle.route[r]
            if (
                this.signalBlocks(edgeIndex, distance, vehicle.speed) ||
                this.junctionBlocks(vehicle, edgeIndex, this.exitOf(vehicle.route, r), distance) ||
                this.turnBlocks(vehicle, r, distance)
            ) {
                this.leader.gap = distance
                this.leader.speed = 0
                return true
            }
            if (r + 1 >= vehicle.route.length) break

            const nextEdge = vehicle.route[r + 1]
            lane = this.guide.laneAfter(edgeIndex, nextEdge, lane)
            const queue = this.lanes[this.slot(nextEdge, lane)]
            if (queue && queue.length > 0) {
                const rearmost = queue[queue.length - 1]
                if (rearmost !== vehicle) {
                    this.leader.gap = distance + rearmost.offset - VEHICLE_LENGTH_M
                    this.leader.speed = rearmost.speed
                    this.blockedAt = r
                    return true
                }
            }
            distance += edges[nextEdge].length
        }
        return false
    }
    
    /** The road taken after the junction at the end of route[index]: links inside a split junction are skipped. */
    private exitOf(route: number[], index: number): number | undefined {
        for (let k = index + 1; k < route.length; k++) {
            if (!this.junctions.isInternal(route[k])) return route[k]
        }
        return undefined
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
        for (let lane = 0; lane < this.laneCount(edge); lane++) {
            const queue = this.lanes[this.laneBase[edge] + lane]
            if (!queue || queue.length === 0) continue
            if (this.vehicleBusy(queue[0], edge, extra, gap, waiting, waitingEdge, waitingNext, equalRank)) {
                return true
            }
        }
        return false
    }

    private vehicleBusy(
        front: Vehicle,
        edge: number,
        extra: number,
        gap: number,
        waiting: Vehicle,
        waitingEdge: number,
        waitingNext: number | undefined,
        equalRank: boolean
    ): boolean {
        // Its path may not touch ours at all (a turn into another road, say): then ignore it.
        // Roundabout rings keep absolute priority over anything entering.
        if (extra === 0 && waitingNext !== undefined && !this.graph.edges[edge].roundabout) {
            const frontNext = this.exitOf(front.route, front.routeIndex)
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
        const nextIndex = this.exitOf(vehicle.route, r)
        if (nextIndex === undefined) return false
        const edgeIndex = vehicle.route[r]
        if (!this.turns.crossesOncoming(edgeIndex, nextIndex)) return false

        if (distance > YIELD_DECISION_M || vehicle.waited > FORCE_AFTER_S) return false
        // Too close and too fast to stop any more: the vehicle is committed
        if (distance < (vehicle.speed * vehicle.speed) / (2 * MAX_BRAKING)) return false

        const gap = vehicle.waited > PATIENCE_S ? PATIENT_GAP_S : CRITICAL_GAP_S
        for (const other of this.turns.oncoming(edgeIndex)) {
            for (let lane = 0; lane < this.laneCount(other); lane++) {
                const queue = this.lanes[this.laneBase[other] + lane]
                if (!queue || queue.length === 0) continue
                const front = queue[0]
                if (front.speed <= STANDING_MS) continue // standing still: not about to enter

                // Oncoming traffic whose path does not cross ours (another left turn, a right turn) passes
                const frontNext = this.exitOf(front.route, front.routeIndex)
                if (frontNext !== undefined && !this.paths.cross(edgeIndex, nextIndex, other, frontNext)) continue
                if (frontNext !== undefined && this.turns.crossesOncoming(other, frontNext)) continue

                const toJunction = this.graph.edges[other].length - front.offset
                if (toJunction < NEAR_JUNCTION_M || toJunction / front.speed < gap) return true
            }
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

    /** Replans the turn at the end of route[r], avoiding the road that is jammed. */
    private reroute(vehicle: Vehicle, r: number): void {
        if (r + 1 >= vehicle.route.length) return
        const avoid = vehicle.route[r + 1]
        const tail = this.planner.plan(vehicle.route[r], this.rng, avoid)
        vehicle.route = vehicle.route.slice(vehicle.routeIndex, r).concat(tail)
        vehicle.routeIndex = 0
        vehicle.rerouteCooldown = REROUTE_COOLDOWN_S
    }
    
    /** Phase 2: apply the decided acceleration and move the vehicle. */
    private move(vehicle: Vehicle, dt: number): void {
        vehicle.rerouteCooldown -= dt
        const edges = this.graph.edges
        const accelerated = Math.max(0, vehicle.speed + vehicle.acceleration * dt)
        vehicle.speed = Math.min(accelerated, vehicle.speedCap)
        // Patience builds while standing and survives creeping forward in a queue;
        // it only resets once the vehicle really gets going again
        if (vehicle.speed < STANDING_MS) vehicle.waited += dt
        else if (vehicle.speed >= CREEP_MS) vehicle.waited = 0
        if (vehicle.waited > TELEPORT_AFTER_S) {
            this.teleported++
            this.lastTeleportEdge = vehicle.route[vehicle.routeIndex]
            this.placeRandomly(vehicle) // gridlock: put the vehicle somewhere else
            return
        }
        vehicle.offset += vehicle.speed * dt

        let edge = edges[vehicle.route[vehicle.routeIndex]]
        // Possibly cross several short edges in one step
        while (vehicle.offset >= edge.length) {
            vehicle.offset -= edge.length
            const left = vehicle.route[vehicle.routeIndex]
            vehicle.routeIndex++
            if (vehicle.routeIndex >= vehicle.route.length) {
                this.placeRandomly(vehicle) // the road ended: reappear somewhere else
                return
            }
            const entered = vehicle.route[vehicle.routeIndex]
            edge = edges[entered]
            vehicle.lane = Math.min(
                this.guide.laneAfter(left, entered, vehicle.lane),
                this.laneCount(entered) - 1
            )
        }
    }

    /** Writes each vehicle's lane (0 = leftmost) into `out`. */
    writeLanes(out: Uint8Array): void {
        for (let i = 0; i < this.vehicles.length; i++) out[i] = this.vehicles[i].lane
    }

    /** Lets vehicles move to the lane beside them, one at a time, so two cannot take the same gap. */
    private changeLanes(dt: number): void {
        if (!this.changesLanes) return
        for (const vehicle of this.vehicles) {
            if (vehicle.laneCooldown > 0) {
                vehicle.laneCooldown -= dt
                continue
            }
            const edgeIndex = vehicle.route[vehicle.routeIndex]
            const count = this.laneCount(edgeIndex)
            if (count < 2) continue

            const target = this.chooseLane(vehicle, edgeIndex, count)
            if (target !== vehicle.lane && this.laneIsFree(vehicle, edgeIndex, target)) {
                this.moveToLane(vehicle, edgeIndex, target)
                vehicle.laneCooldown = LANE_CHANGE_COOLDOWN_S
            }
        }
    }

    /** The lane the vehicle would like to be in now: its own, or the one beside it. */
    private chooseLane(vehicle: Vehicle, edgeIndex: number, count: number): number {
        const edge = this.graph.edges[edgeIndex]
        const allowed =
            edge.length - vehicle.offset < LANE_PLAN_M
                ? this.guide.lanesFor(edgeIndex, this.exitOf(vehicle.route, vehicle.routeIndex))
                : undefined

        // Wrong lane for the coming turn: move one lane toward the nearest right one
        if (allowed && !allowed.includes(vehicle.lane)) {
            let nearest = allowed[0]
            for (const lane of allowed) {
                if (Math.abs(lane - vehicle.lane) < Math.abs(nearest - vehicle.lane)) nearest = lane
            }
            return vehicle.lane + Math.sign(nearest - vehicle.lane)
        }

        // Held up by a slower vehicle: look for a neighbouring lane with clearly more room
        if (vehicle.speed >= LANE_BLOCKED_RATIO * edge.speedLimit) return vehicle.lane
        const queue = this.lanes[this.slot(edgeIndex, vehicle.lane)] as Vehicle[]
        const own = queue.indexOf(vehicle)
        if (own <= 0) return vehicle.lane
        let best = vehicle.lane
        let bestRoom = queue[own - 1].offset - VEHICLE_LENGTH_M - vehicle.offset + LANE_GAIN_M
        for (const candidate of [vehicle.lane - 1, vehicle.lane + 1]) {
            if (candidate < 0 || candidate >= count) continue
            if (allowed && !allowed.includes(candidate)) continue
            const room = this.roomAhead(vehicle, edgeIndex, candidate)
            if (room > bestRoom) {
                best = candidate
                bestRoom = room
            }
        }
        return best
    }

    /** Free road ahead of the vehicle's position in a lane, bumper to bumper. */
    private roomAhead(vehicle: Vehicle, edge: number, lane: number): number {
        const queue = this.lanes[this.slot(edge, lane)]
        if (!queue) return Infinity
        let room = Infinity
        for (const other of queue) {
            if (other.offset < vehicle.offset) break
            room = other.offset - VEHICLE_LENGTH_M - vehicle.offset
        }
        return room
    }

    /** Is there enough space in front of and behind the vehicle's position in that lane? */
    private laneIsFree(vehicle: Vehicle, edge: number, lane: number): boolean {
        const queue = this.lanes[this.slot(edge, lane)]
        if (!queue) return true
        let ahead: Vehicle | undefined
        let behind: Vehicle | undefined
        for (const other of queue) {
            if (other.offset >= vehicle.offset) {
                ahead = other
            } else {
                behind = other
                break
            }
        }
        if (ahead) {
            const gap = ahead.offset - VEHICLE_LENGTH_M - vehicle.offset
            if (gap < LANE_MIN_GAP_M + LANE_TIME_GAP_S * vehicle.speed) return false
        }
        if (behind) {
            const gap = vehicle.offset - VEHICLE_LENGTH_M - behind.offset
            if (gap < LANE_MIN_GAP_M + LANE_TIME_GAP_S * behind.speed) return false
        }
        return true
    }

    private moveToLane(vehicle: Vehicle, edge: number, target: number): void {
        const from = this.lanes[this.slot(edge, vehicle.lane)] as Vehicle[]
        from.splice(from.indexOf(vehicle), 1)

        const slot = this.slot(edge, target)
        let to = this.lanes[slot]
        if (!to) {
            to = []
            this.lanes[slot] = to
        }
        if (to.length === 0) this.occupied.push(slot)
        let at = 0
        while (at < to.length && to[at].offset >= vehicle.offset) at++
        to.splice(at, 0, vehicle)
        vehicle.lane = target
    }
    
    private placeRandomly(vehicle: Vehicle): void {
        const start = this.planner.randomStart(this.rng)
        const edge = this.graph.edges[start]
        const count = this.laneCount(start)
        vehicle.route = this.planner.plan(start, this.rng)
        vehicle.routeIndex = 0
        vehicle.lane = count > 1 ? Math.floor(this.rng() * count) : 0
        vehicle.offset = this.rng() * edge.length
        vehicle.speed = edge.speedLimit
        vehicle.acceleration = 0
        vehicle.speedCap = edge.speedLimit
        vehicle.laneCooldown = 0
        vehicle.rerouteCooldown = 0
    }
}