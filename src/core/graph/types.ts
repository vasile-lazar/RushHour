/** A point where roads meet, end, or where a traffic signal sits. */
export interface GraphNode {
    /** Meters east of the map origin */
    x: number
    /** Meters north of the map origin */
    y: number
    hasSignal: boolean
}


/** One directed road segment between two nodes. */
export interface GraphEdge {
    /** Index into RoadGraph.nodes */
    from: number
    /** Index into RoadGraph.nodes */
    to: number
    /** Length in meters */
    length: number
    /** Speed limit in meters per second */
    speedLimit: number
    lanes: number
    /** OSM highway class, e.g. "residential", "primary" */
    roadClass: string
    /** Flat polyline [x0, y0, x1, y1, ...] in meters, running from -> to */
    geometry: number[]
}


export interface Bounds {
    minX: number
    minY: number
    maxX: number
    maxY: number
}


export interface RoadGraph {
    name: string
    nodes: GraphNode[]
    edges: GraphEdge[]
    bounds: Bounds
}