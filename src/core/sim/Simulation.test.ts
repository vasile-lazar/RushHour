import { describe, expect, it } from 'vitest'
import type { RoadGraph } from '../graph/types'
import { makeGraph, twoWayLine } from '../testing/graphs'
import { createSimulation } from './createSimulation'
import { IdmModel } from './models/Idm'
import { isDrivable } from './roadRules'
import { RandomWalkPlanner } from './routing/RandomWalkPlanner'
import { Simulation, VEHICLE_LENGTH_M } from './Simulation'
import { TrafficSignals } from './signals/TrafficSignals'
import { PriorityJunctions } from './junctions/PriorityJunctions'
import {
    NO_JUNCTION_RULES,
    NO_LANE_GUIDE,
    NO_PATH_RULES,
    NO_SIGNALS,
    NO_TURN_RULES,
    RoutePlanner,
    SignalControl
} from './ports'
import {Turns} from "@core/sim/junctions/Turns";
import {laneCentre, STOP_LINE_M} from "@core/graph/laneGeometry";
import {Movements} from "@core/sim/junctions/Movements";
import {TurnLaneGuide} from "@core/sim/lanes/TurnLaneGuide";
import {createRng} from "@core/util/random";
import {JunctionStats} from "@core/sim/stats/JunctionStats";

// Three points 100 m apart; every edge has a 10 m/s speed limit
const line = twoWayLine([[0, 0], [100, 0], [200, 0]])

/** A simulation whose "random" generator always returns 0: fully predictable. */
function build(graph: RoadGraph, maxRouteEdges = 60): Simulation {
    const planner = new RandomWalkPlanner(graph, isDrivable, maxRouteEdges)
    return new Simulation(graph, planner, () => 0, new IdmModel())
}

function predictable(graph = line, vehicles = 1): Simulation {
    const simulation = build(graph, 5)
    simulation.spawn(vehicles)
    return simulation
}

function positions(simulation: Simulation): Float32Array {
    const out = new Float32Array(simulation.vehicleCount * 2)
    simulation.writePositions(out)
    return out
}

describe('Simulation', () => {
    it('moves vehicles along their edge at the speed limit', () => {
        const simulation = predictable()
        for (let i = 0; i < 3; i++) simulation.step(1)

        const [x, y] = positions(simulation)
        expect(x).toBeCloseTo(30) // 3 s at 10 m/s
        expect(y).toBeCloseTo(0)
        expect(simulation.time).toBeCloseTo(3)
    })

    it('continues onto the next edge of the route', () => {
        const simulation = predictable()
        for (let i = 0; i < 11; i++) simulation.step(1)

        // route is [0, 2, 3, ...]: after 100 m on edge 0, it is 10 m into edge 2
        expect(positions(simulation)[0]).toBeCloseTo(110)
    })

    it('keeps vehicles on the map and never loses any', () => {
        const simulation = predictable(line, 3)
        for (let i = 0; i < 2000; i++) simulation.step(0.1)

        expect(simulation.vehicleCount).toBe(3)
        for (const value of positions(simulation).filter((_, i) => i % 2 === 0)) {
            expect(value).toBeGreaterThanOrEqual(-0.001)
            expect(value).toBeLessThanOrEqual(200.001)
        }
    })

    it('respawns a vehicle that reaches a true dead end', () => {
        const deadEnd = makeGraph([[0, 0], [100, 0]], [{ from: 0, to: 1 }])
        const simulation = predictable(deadEnd)
        simulation.step(10.5) // 105 m on a 100 m road

        expect(simulation.vehicleCount).toBe(1)
        expect(positions(simulation)[0]).toBeCloseTo(0) // reappeared at the start
    })

    it('reports speed relative to the limit', () => {
        const simulation = build(line)
        simulation.addVehicle(0, 0, 5) // half of the 10 m/s limit

        const ratios = new Float32Array(1)
        simulation.writeSpeedRatios(ratios)
        expect(ratios[0]).toBeCloseTo(0.5)
    })
})

describe('car following', () => {
    it('keeps a safe gap behind a leader that starts from standstill', () => {
        const road = makeGraph([[0, 0], [2000, 0]], [{ from: 0, to: 1 }])
        const simulation = build(road)
        simulation.addVehicle(0, 100, 0) // leader, at rest
        simulation.addVehicle(0, 50, 10) // follower, already at speed

        const out = new Float32Array(4)
        let smallestGap = Infinity
        for (let i = 0; i < 600; i++) {
            simulation.step(0.1)
            simulation.writePositions(out)
            smallestGap = Math.min(smallestGap, out[0] - out[2] - VEHICLE_LENGTH_M)
        }

        expect(smallestGap).toBeGreaterThan(1) // never got close to touching
        expect(out[2]).toBeGreaterThan(300) // and the follower did keep driving
    })

    it('slows down gradually for a lower speed limit ahead', () => {
        const graph = makeGraph(
            [[0, 0], [200, 0], [400, 0]],
            [
                { from: 0, to: 1, speedLimit: 20 },
                { from: 1, to: 2, speedLimit: 5 }
            ]
        )
        const simulation = build(graph)
        simulation.addVehicle(0, 0, 20)

        const out = new Float32Array(2)
        let previousX = 0
        let previousSpeed = 20
        let hardestBraking = 0
        for (let i = 0; i < 140; i++) {
            simulation.step(0.1)
            simulation.writePositions(out)
            const speed = (out[0] - previousX) / 0.1
            hardestBraking = Math.max(hardestBraking, (previousSpeed - speed) / 0.1)
            previousX = out[0]
            previousSpeed = speed
        }

        expect(hardestBraking).toBeLessThan(3) // a smooth slowdown, not an emergency stop
        expect(previousSpeed).toBeCloseTo(5, 0) // and it ends at the lower limit
    })
})

describe('createSimulation', () => {
    const town = twoWayLine([[0, 0], [100, 0], [200, 0], [300, 0], [400, 0]])

    function run(seed: number): Float32Array {
        const simulation = createSimulation(town, { vehicleCount: 10, seed })
        for (let i = 0; i < 50; i++) simulation.step(0.5)
        return positions(simulation)
    }

    it('is reproducible for the same seed', () => {
        expect(run(7)).toEqual(run(7))
    })

    it('differs for different seeds', () => {
        expect(run(7)).not.toEqual(run(8))
    })
})

describe('traffic signals', () => {
    // A road from node 0 to node 2, crossed at node 1 by a side road arriving from node 3
    const junction = makeGraph(
        [[0, 0], [200, 0], [400, 0], [200, 100]],
        [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 3, to: 1 }],
        [1]
    )

    /** offsetFraction 0: the main road (edge 0) starts green. 0.5: it starts red for 34 s. */
    function withSignals(offsetFraction: number): Simulation {
        const signals = new TrafficSignals(junction, isDrivable, () => offsetFraction)
        const planner = new RandomWalkPlanner(junction, isDrivable)
        const simulation = new Simulation(junction, planner, () => 0, new IdmModel(), signals)
        simulation.addVehicle(0, 0, 10) // on the main road, at its 10 m/s limit
        return simulation
    }

    function run(simulation: Simulation, seconds: number): number {
        for (let i = 0; i < seconds * 10; i++) simulation.step(0.1)
        return positions(simulation)[0]
    }

    it('drives straight through a green light', () => {
        // green for the first 30 s, and the vehicle reaches the junction after 20 s
        expect(run(withSignals(0), 25)).toBeGreaterThan(240)
    })

    it('stops in front of a red light, then goes when it turns green', () => {
        const simulation = withSignals(0.5) // red until t = 34 s

        const waiting = run(simulation, 32)
        expect(waiting).toBeGreaterThan(190) // it came right up to the line...
        expect(waiting).toBeLessThan(199.5) // ...but did not cross it

        expect(run(simulation, 12)).toBeGreaterThan(210) // green at t = 34 s: it has gone through
    })

    it('reports the state of every signal approach', () => {
        const simulation = withSignals(0) // main road (edge 0) green, side road (edge 2) red
        expect(simulation.signalApproaches).toEqual([0, 2])
        const states = new Uint8Array(2)
        simulation.writeSignalStates(states)
        expect([...states]).toEqual([0, 2])
    })
})

describe('giving way', () => {
    // A main road from node 0 to node 2 through the junction at node 1, and a side road from node 3
    const tJunction = makeGraph(
        [[-300, 0], [0, 0], [300, 0], [0, -300]],
        [
            { from: 0, to: 1, speedLimit: 14, roadClass: 'primary' },
            { from: 1, to: 2, speedLimit: 14, roadClass: 'primary' },
            { from: 3, to: 1, speedLimit: 10, roadClass: 'residential' }
        ]
    )

    function scenario(rulesOn: boolean): Simulation {
        const planner = new RandomWalkPlanner(tJunction, isDrivable)
        const junctions = rulesOn
            ? new PriorityJunctions(tJunction, isDrivable, NO_SIGNALS)
            : NO_JUNCTION_RULES
        const simulation = new Simulation(tJunction, planner, () => 0, new IdmModel(), NO_SIGNALS, junctions)
        simulation.addVehicle(0, 270, 14) // main road, 30 m from the junction: arrives in about 2 s
        simulation.addVehicle(2, 282, 9) // side road, 18 m from the junction: would arrive at the same time
        return simulation
    }

    it('makes a side-road vehicle wait for traffic on the main road, then go', () => {
        const simulation = scenario(true)
        for (let i = 0; i < 20; i++) simulation.step(0.1) // 2 s
        expect(positions(simulation)[3]).toBeLessThan(-1) // still before the junction (y < 0)

        for (let i = 0; i < 130; i++) simulation.step(0.1) // 15 s in total
        expect(positions(simulation)[2]).toBeGreaterThan(10) // it went through once the road was clear
    })

    it('without the rule the side-road vehicle drives straight through', () => {
        const simulation = scenario(false)
        for (let i = 0; i < 20; i++) simulation.step(0.1)
        expect(positions(simulation)[3]).toBeGreaterThan(-1) // already at the junction
    })
})

describe('equal roads meeting', () => {
    it('lets every vehicle through in turn, without gridlock', () => {
        // Two equal two-way streets crossing at node 0, with 200 m arms
        const crossing = makeGraph(
            [[0, 0], [200, 0], [-200, 0], [0, 200], [0, -200]],
            [
                { from: 1, to: 0 }, { from: 2, to: 0 }, { from: 3, to: 0 }, { from: 4, to: 0 }, // edges 0-3 arrive
                { from: 0, to: 1 }, { from: 0, to: 2 }, { from: 0, to: 3 }, { from: 0, to: 4 } // edges 4-7 leave
            ]
        )
        const planner = new RandomWalkPlanner(crossing, isDrivable)
        const junctions = new PriorityJunctions(crossing, isDrivable, NO_SIGNALS)
        const simulation = new Simulation(crossing, planner, () => 0, new IdmModel(), NO_SIGNALS, junctions)
        for (const arrival of [0, 1, 2, 3]) simulation.addVehicle(arrival, 150, 10) // all 50 m away

        for (let i = 0; i < 300; i++) simulation.step(0.1) // 30 s

        const out = positions(simulation)
        let awayFromCrossing = 0
        for (let i = 0; i < 4; i++) {
            if (Math.hypot(out[2 * i], out[2 * i + 1]) > 10) awayFromCrossing++
        }
        // A gridlock would leave all four vehicles waiting at the crossing
        expect(awayFromCrossing).toBeGreaterThanOrEqual(3)
    })
})

describe('turning left', () => {
    // A crossing of two-way streets at node 0. Vehicle A arrives from the west and turns left
    // (north). Vehicle B arrives from the east and drives straight on (west).
    const crossing = makeGraph(
        [[0, 0], [-300, 0], [300, 0], [0, 300], [0, -300]],
        [
            { from: 1, to: 0 }, // 0: arrives from the west
            { from: 2, to: 0 }, // 1: arrives from the east
            { from: 3, to: 0 }, // 2: arrives from the north
            { from: 4, to: 0 }, // 3: arrives from the south
            { from: 0, to: 1 }, // 4: leaves to the west
            { from: 0, to: 3 }, // 5: leaves to the north
            { from: 0, to: 2 }, // 6: leaves to the east
            { from: 0, to: 4 } // 7: leaves to the south
        ]
    )

    function scenario(rulesOn: boolean): Simulation {
        const planner = new RandomWalkPlanner(crossing, isDrivable)
        const turns = rulesOn ? new Turns(crossing) : NO_TURN_RULES
        const simulation = new Simulation(
            crossing,
            planner,
            () => 0,
            new IdmModel(),
            NO_SIGNALS,
            NO_JUNCTION_RULES,
            turns
        )
        simulation.addVehicle(0, 270, 10) // A: 30 m from the crossing, will turn left
        simulation.addVehicle(1, 270, 10) // B: oncoming, 30 m away, will go straight
        return simulation
    }

    it('makes a left-turning vehicle wait for oncoming traffic, then turn', () => {
        const simulation = scenario(true)
        for (let i = 0; i < 40; i++) simulation.step(0.1) // 4 s
        expect(positions(simulation)[0]).toBeLessThan(-1) // A is still waiting before the crossing

        for (let i = 0; i < 110; i++) simulation.step(0.1) // 15 s in total
        expect(positions(simulation)[1]).toBeGreaterThan(5) // A has turned north
    })

    it('without the rule the vehicle turns straight away', () => {
        const simulation = scenario(false)
        for (let i = 0; i < 40; i++) simulation.step(0.1)
        expect(positions(simulation)[1]).toBeGreaterThan(1) // A is already heading north
    })
})
describe('priority to the right', () => {
    // Two equal streets meeting at node 0: A arrives from the west, B from the south (on A's right)
    const meeting = makeGraph(
        [[0, 0], [-300, 0], [300, 0], [0, 300], [0, -300]],
        [
            { from: 1, to: 0 }, // 0: A's street, heading east
            { from: 4, to: 0 }, // 1: B's street, heading north
            { from: 0, to: 2 }, // 2: exit east
            { from: 0, to: 3 } // 3: exit north
        ]
    )

    function scenario(rulesOn: boolean): Simulation {
        const planner = new RandomWalkPlanner(meeting, isDrivable)
        const junctions = rulesOn
            ? new PriorityJunctions(meeting, isDrivable, NO_SIGNALS)
            : NO_JUNCTION_RULES
        const simulation = new Simulation(meeting, planner, () => 0, new IdmModel(), NO_SIGNALS, junctions)
        simulation.addVehicle(0, 270, 10) // A: 30 m from the junction
        simulation.addVehicle(1, 270, 10) // B: 30 m away too, coming from A's right
        return simulation
    }

    it('makes a vehicle wait for traffic coming from its right', () => {
        const simulation = scenario(true)
        for (let i = 0; i < 35; i++) simulation.step(0.1) // 3.5 s
        const out = positions(simulation)
        expect(out[0]).toBeLessThan(-1) // A is still waiting before the junction
        expect(out[2]).toBeGreaterThan(1) // B has gone through and turned east
    })

    it('without the rule both vehicles drive straight in', () => {
        const simulation = scenario(false)
        for (let i = 0; i < 35; i++) simulation.step(0.1)
        expect(positions(simulation)[0]).toBeGreaterThan(1) // A is through
    })
})

describe('roundabouts', () => {
    // A ring (edges 0-3, counter-clockwise) with an entry road arriving at node 0 (edge 4)
    // and an exit leaving it (edge 5)
    const ring = makeGraph(
        [[20, 0], [0, 20], [-20, 0], [0, -20], [60, 0]],
        [
            { from: 0, to: 1, speedLimit: 8, roadClass: 'primary', roundabout: true },
            { from: 1, to: 2, speedLimit: 8, roadClass: 'primary', roundabout: true },
            { from: 2, to: 3, speedLimit: 8, roadClass: 'primary', roundabout: true },
            { from: 3, to: 0, speedLimit: 8, roadClass: 'primary', roundabout: true },
            { from: 4, to: 0, roadClass: 'residential' },
            { from: 0, to: 4, roadClass: 'residential' }
        ]
    )

    function scenario(rulesOn: boolean): Simulation {
        const planner = new RandomWalkPlanner(ring, isDrivable)
        const junctions = rulesOn
            ? new PriorityJunctions(ring, isDrivable, NO_SIGNALS)
            : NO_JUNCTION_RULES
        const simulation = new Simulation(ring, planner, () => 0, new IdmModel(), NO_SIGNALS, junctions)
        simulation.addVehicle(3, 10, 8) // on the ring, about 18 m before the entry
        simulation.addVehicle(4, 30, 7) // on the entry road, 10 m before the ring
        return simulation
    }

    it('makes entering vehicles wait for traffic already on the ring', () => {
        const simulation = scenario(true)
        for (let i = 0; i < 20; i++) simulation.step(0.1) // 2 s
        expect(positions(simulation)[2]).toBeGreaterThan(20.5) // still before the ring (x = 20)
    })

    it('without the rule the entering vehicle drives straight onto the ring', () => {
        const simulation = scenario(false)
        for (let i = 0; i < 20; i++) simulation.step(0.1)
        expect(positions(simulation)[2]).toBeLessThan(19.5) // already on the ring
    })
})

describe('gridlock', () => {
    it('takes a vehicle out after it has been stuck for three minutes', () => {
        const road = makeGraph([[0, 0], [200, 0]], [{ from: 0, to: 1 }])
        const alwaysRed: SignalControl = { stateOf: () => 'red', approaches: [0] }
        const planner = new RandomWalkPlanner(road, isDrivable)
        const simulation = new Simulation(road, planner, () => 0, new IdmModel(), alwaysRed)
        simulation.addVehicle(0, 100, 10)

        for (let i = 0; i < 1500; i++) simulation.step(0.1) // 150 s: waiting at the red light
        expect(simulation.countStanding(60)).toBe(1)
        expect(simulation.teleports).toBe(0)

        for (let i = 0; i < 1100; i++) simulation.step(0.1) // 260 s in total
        expect(simulation.teleports).toBe(1)
    })
})

describe('lane offset', () => {
    // One road heading east (+x), two lanes
    const wide = makeGraph([[0, 0], [100, 0]], [{ from: 0, to: 1, lanes: 2 }])

    function scenario(): Simulation {
        const simulation = build(wide)
        simulation.addVehicle(0, 50, 0, 0)
        simulation.addVehicle(0, 20, 0, 1)
        return simulation
    }

    it('shifts vehicles to the right of their direction, by lane', () => {
        const out = new Float32Array(4)
        scenario().writePositions(out, true)
        expect(out[0]).toBeCloseTo(50 - STOP_LINE_M)
        expect(out[1]).toBeCloseTo(-laneCentre(0)) // heading east, right is south (y down)
        expect(out[3]).toBeCloseTo(-laneCentre(1))
    })

    it('does not shift unless asked', () => {
        const out = new Float32Array(4)
        scenario().writePositions(out)
        expect(out[1]).toBeCloseTo(0)
        expect(out[3]).toBeCloseTo(0)
    })
    
    it('draws a vehicle that just left an edge still on that edge', () => {
        const road = makeGraph([[0, 0], [100, 0], [200, 0]], [{ from: 0, to: 1 }, { from: 1, to: 2 }])
        const simulation = build(road)
        simulation.addVehicle(0, 99, 10)
        simulation.step(0.2) // now about 1 m into the second edge
        const out = new Float32Array(2)
        simulation.writePositions(out, true)
        expect(out[0]).toBeLessThan(100) // still drawn before the junction...
        expect(out[0]).toBeGreaterThan(90) // ...STOP_LINE_M behind where it really is
    })
})

describe('left-turn ring', () => {
    // Left road LN-JL-LS and right road RN-JR-RS, joined by a short connector JL-JR (40 m)
    const ring = makeGraph(
        [[-20, 100], [-20, 0], [-20, -100], [20, 100], [20, 0], [20, -100]],
        [
            { from: 0, to: 1 }, // 0: left road, southbound, into JL
            { from: 1, to: 2 }, // 1: left road, southbound, out of JL
            { from: 2, to: 1 }, // 2: left road, northbound, into JL
            { from: 1, to: 0 }, // 3: left road, northbound, out of JL
            { from: 3, to: 4 }, // 4: right road, southbound, into JR
            { from: 4, to: 5 }, // 5: right road, southbound, out of JR
            { from: 5, to: 4 }, // 6: right road, northbound, into JR
            { from: 4, to: 3 }, // 7: right road, northbound, out of JR
            { from: 1, to: 4 }, // 8: connector, eastbound
            { from: 4, to: 1 } // 9: connector, westbound
        ]
    )

    // Everyone turns left, twice
    const routes = new Map<number, number[]>([
        [0, [0, 8, 7]],
        [8, [8, 7]],
        [6, [6, 9, 1]],
        [9, [9, 1]]
    ])
    // The other way at each stop line: straight on, or the right turn
    const alternatives = new Map<number, number[]>([
        [0, [0, 1]],
        [8, [8, 5]],
        [6, [6, 7]],
        [9, [9, 3]]
    ])
    const planner: RoutePlanner = {
        randomStart: () => 3,
        plan: (start, _rng, avoid) =>
            (avoid !== undefined ? alternatives.get(start) : routes.get(start)) ?? [start]
    }

    function build(): Simulation {
        const rng = createRng(1)
        const junctions = new PriorityJunctions(ring, isDrivable, NO_SIGNALS, rng)
        const simulation = new Simulation(
            ring,
            planner,
            rng,
            new IdmModel(),
            NO_SIGNALS,
            junctions,
            new Turns(ring),
            new Movements(ring),
            new TurnLaneGuide(ring, isDrivable, junctions)
        )
        // Both connector lanes full of standing vehicles, plus one feeder at each stop line
        for (const edge of [8, 9]) {
            for (let offset = 38; offset > 0; offset -= 6) simulation.addVehicle(edge, offset, 0)
        }
        simulation.addVehicle(0, 98, 0)
        simulation.addVehicle(6, 98, 0)
        return simulation
    }

    it('does not lock up when everyone turns left', () => {
        const simulation = build()
        for (let i = 0; i < 1500; i++) simulation.step(0.1) // 150 s, before the 180 s teleport
        console.log(simulation.traceLeaders(60).join('\n')) // temporary: remove once it passes
        expect(simulation.countStanding(100)).toBe(0)
        expect(simulation.teleports).toBe(0)
    })
})

describe('junction statistics', () => {
    const road = makeGraph([[0, 0], [200, 0], [400, 0]], [{ from: 0, to: 1 }, { from: 1, to: 2 }])
    const nodeClusters = Int32Array.from(road.nodes, (_, i) => i)

    function run(signals: SignalControl, seconds: number): Simulation {
        const stats = new JunctionStats(road, nodeClusters)
        const planner = new RandomWalkPlanner(road, isDrivable)
        const simulation = new Simulation(
            road, planner, () => 0, new IdmModel(), signals,
            NO_JUNCTION_RULES, NO_TURN_RULES, NO_PATH_RULES, NO_LANE_GUIDE, stats
        )
        simulation.addVehicle(0, 100, 10)
        for (let i = 0; i < seconds * 10; i++) simulation.step(0.1)
        return simulation
    }

    it('records the delay of a vehicle waiting at a red light', () => {
        const [top] = run({ stateOf: () => 'red', approaches: [0] }, 60).junctionReport(3)
        expect(top.id).toBe(1)
        expect(top.x).toBe(200)
        expect(top.delay).toBeGreaterThan(30)
        expect(top.passed).toBe(0)
        expect(top.maxQueue).toBe(1)
    })

    it('counts a vehicle driving through a junction without delaying it', () => {
        const simulation = run(NO_SIGNALS, 20)
        expect(simulation.junctionReport(3)).toEqual([]) // no delay, so it is not listed
    })
})