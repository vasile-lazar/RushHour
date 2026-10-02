import { polylineLength, reversePolyline } from '@core/graph/geometry'
import type { Bounds, GraphEdge, GraphNode, RoadGraph } from '@core/graph/types'
import type { OverpassNode, OverpassResponse, OverpassWay } from './OverpassClient'
import { createProjection, type Point } from './Projection'
import { defaultSpeedLimit, directionOf, lanesPerDirection, parseSpeedLimit, ROUNDABOUT_SPEED_MS } from './RoadTags'

const SIGNAL_TAG = 'traffic_signals'
/** Edges shorter than this are degenerate (duplicate points) and would confuse the simulation. */
const MIN_EDGE_LENGTH_M = 0.01


export function buildGraph(name: string, osm: OverpassResponse): RoadGraph {
    // 1. Split the raw elements into lookups we can query quickly
    const rawNodes = new Map<number, OverpassNode>()
    const ways: OverpassWay[] = []
    for (const element of osm.elements) {
        if (element.type === 'node') rawNodes.set(element.id, element)
        else ways.push(element)
    }
    if (rawNodes.size === 0 || ways.length === 0) {
        throw new Error(`No drivable roads found for "${name}"`)
    }

    // 2. Project lat/lon into meters, around the average position of the city
    let latSum = 0
    let lonSum = 0
    for (const node of rawNodes.values()) {
        latSum += node.lat
        lonSum += node.lon
    }
    const project = createProjection(latSum / rawNodes.size, lonSum / rawNodes.size)

    const points = new Map<number, Point>()
    const pointOf = (id: number): Point => {
        let point = points.get(id)
        if (!point) {
            const node = rawNodes.get(id) as OverpassNode
            point = project(node.lat, node.lon)
            points.set(id, point)
        }
        return point
    }

    // 3. Count how many ways use each node: more than one means an intersection
    const usage = new Map<number, number>()
    for (const way of ways) {
        for (const id of way.nodes) usage.set(id, (usage.get(id) ?? 0) + 1)
    }
    const hasSignal = (id: number): boolean => rawNodes.get(id)?.tags?.highway === SIGNAL_TAG
    const isJunction = (id: number): boolean => (usage.get(id) ?? 0) > 1 || hasSignal(id)

    // 4. Graph nodes are created lazily, only for nodes that end up as edge endpoints
    const nodes: GraphNode[] = []
    const nodeIndex = new Map<number, number>()
    const graphNodeFor = (id: number): number => {
        let index = nodeIndex.get(id)
        if (index === undefined) {
            const { x, y } = pointOf(id)
            index = nodes.length
            nodes.push({ x, y, hasSignal: hasSignal(id) })
            nodeIndex.set(id, index)
        }
        return index
    }

    // 5. Walk every way, cutting it into edges at each junction
    const edges: GraphEdge[] = []
    for (const way of ways) {
        const roadClass = way.tags?.highway ?? 'unclassified'
        const direction = directionOf(way.tags)
        const roundabout = way.tags?.junction === 'roundabout'
        const posted = parseSpeedLimit(way.tags?.maxspeed) ?? defaultSpeedLimit(roadClass)
        const speedLimit = roundabout ? Math.min(posted, ROUNDABOUT_SPEED_MS) : posted
        const lanes = lanesPerDirection(way.tags?.lanes, direction, roadClass)
        
        let segmentStart = 0
        for (let i = 1; i < way.nodes.length; i++) {
            const isLast = i === way.nodes.length - 1
            if (!isLast && !isJunction(way.nodes[i])) continue

            const ids = way.nodes.slice(segmentStart, i + 1)
            segmentStart = i
            if (ids.some((id) => !rawNodes.has(id))) continue // incomplete data, skip

            const geometry = ids.flatMap((id) => {
                const { x, y } = pointOf(id)
                return [x, y]
            })
            const length = polylineLength(geometry)
            if (length < MIN_EDGE_LENGTH_M) continue

            const from = graphNodeFor(ids[0])
            const to = graphNodeFor(ids[ids.length - 1])
            const shared = {
                length,
                speedLimit,
                lanes,
                roadClass,
                ...(roundabout ? { roundabout: true } : {})
            }
            
            if (direction !== 'backward') {
                edges.push({ ...shared, from, to, geometry })
            }
            if (direction !== 'forward') {
                edges.push({ ...shared, from: to, to: from, geometry: reversePolyline(geometry) })
            }
        }
    }

    if (edges.length === 0) {
        throw new Error(`No drivable roads found for "${name}"`)
    }
    return { name, nodes, edges, bounds: computeBounds(edges) }
}


function computeBounds(edges: GraphEdge[]): Bounds {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const edge of edges) {
        for (let i = 0; i < edge.geometry.length; i += 2) {
            const x = edge.geometry[i]
            const y = edge.geometry[i + 1]
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
        }
    }
    return { minX, minY, maxX, maxY }
}