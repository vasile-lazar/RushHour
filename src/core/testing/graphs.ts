import type { GraphEdge, RoadGraph } from '../graph/types'

interface EdgeSpec {
    from: number
    to: number
    speedLimit?: number
    roadClass?: string
    roundabout?: boolean
    lanes?: number
}

/** Builds a small RoadGraph for tests, with a straight edge for each spec. */
export function makeGraph(
    points: Array<[number, number]>,
    specs: EdgeSpec[],
    signalNodes: number[] = []
): RoadGraph {
    const nodes = points.map(([x, y], index) => ({ x, y, hasSignal: signalNodes.includes(index) }))
    const edges: GraphEdge[] = specs.map((spec) => {
        const a = nodes[spec.from]
        const b = nodes[spec.to]
        return {
            from: spec.from,
            to: spec.to,
            length: Math.hypot(b.x - a.x, b.y - a.y),
            speedLimit: spec.speedLimit ?? 10,
            lanes: spec.lanes ?? 1,
            roadClass: spec.roadClass ?? 'residential',
            geometry: [a.x, a.y, b.x, b.y],
            ...(spec.roundabout ? { roundabout: true } : {})
        }
    })
    const xs = points.map((p) => p[0])
    const ys = points.map((p) => p[1])
    return {
        name: 'test',
        nodes,
        edges,
        bounds: { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
    }
}

/**
 * A straight two-way road through the points. Segment i becomes two edges:
 * edge 2i goes i -> i+1, and edge 2i+1 goes back i+1 -> i.
 */
export function twoWayLine(points: Array<[number, number]>): RoadGraph {
    const specs: EdgeSpec[] = []
    for (let i = 0; i < points.length - 1; i++) {
        specs.push({ from: i, to: i + 1 }, { from: i + 1, to: i })
    }
    return makeGraph(points, specs)
}