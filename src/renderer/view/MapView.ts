import type { RoadGraph } from '@core/graph/types'
import { Viewport } from './Viewport'
import { LANE_WIDTH_M } from '@core/graph/laneGeometry'

/** Base road width in meters when zoomed in, clamped in pixels when zoomed out. */
const ROAD_WIDTH_M = 7
const MIN_ROAD_PX = 0.8
const MAX_ROAD_PX = 6

/** From this zoom on (pixels per meter) roads are drawn as real lanes. */
const LANE_VIEW_MIN_SCALE = 0.6

/** Speed relative to the limit, from flowing to stopped. Drawn in this order, so the red ones end up on top. */
const VEHICLE_COLORS = ['#06d6a0', '#ffd166', '#ef476f']
const FLOWING_RATIO = 0.7
const SLOW_RATIO = 0.3

/** Vehicles are drawn about this many meters wide when zoomed in, clamped in pixels when zoomed out. */
const VEHICLE_SIZE_M = 6
const VEHICLE_MIN_PX = 2.5
const VEHICLE_MAX_PX = 8

/** How long the view must stay still before the roads are redrawn in full detail. */
const SETTLE_MS = 120

function speedBucket(ratio: number): number {
    if (ratio >= FLOWING_RATIO) return 0
    if (ratio >= SLOW_RATIO) return 1
    return 2
}

interface RoadTier {
    classes: ReadonlySet<string>
    /** Only drawn once the zoom reaches this many pixels per meter */
    minScale: number
    color: string
    /** Multiplier applied to the base road width */
    widthFactor: number
}

/** Ordered from most to least important. Unknown road classes fall into the last tier. */
const TIERS: readonly RoadTier[] = [
    {
        classes: new Set(['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link']),
        minScale: 0,
        color: '#8fb2d6',
        widthFactor: 1.6
    },
    {
        classes: new Set(['secondary', 'tertiary', 'secondary_link', 'tertiary_link']),
        minScale: 0.005, // 1 pixel = 200 m
        color: '#6f92b5',
        widthFactor: 1.2
    },
    {
        classes: new Set(['unclassified', 'residential', 'living_street']),
        minScale: 0.015, // 1 pixel = 67 m
        color: '#4f6d8c',
        widthFactor: 1
    },
    {
        classes: new Set(['service']),
        minScale: 0.08, // 1 pixel = 12 m
        color: '#3a5068',
        widthFactor: 0.7
    }
]

function tierIndexOf(roadClass: string): number {
    const index = TIERS.findIndex((tier) => tier.classes.has(roadClass))
    return index === -1 ? TIERS.length - 1 : index
}

/** The view a road layer was rendered with, used to reposition it while it is stale. */
interface LayerView {
    scale: number
    offsetX: number
    offsetY: number
}

export class MapView {
    private readonly canvas: HTMLCanvasElement
    private readonly ctx: CanvasRenderingContext2D
    private readonly viewport = new Viewport()

    /** Roads are drawn once into this off-screen canvas; each frame just copies it. */
    private readonly roadLayer = document.createElement('canvas')
    private readonly roadCtx: CanvasRenderingContext2D
    private roadLayerView: LayerView | null = null
    private settleTimer: ReturnType<typeof setTimeout> | null = null

    private roads: Path2D[] | null = null
    private graph: RoadGraph | null = null
    /** Latest vehicle positions from the simulation: x0, y0, x1, y1, ... in world meters */
    private vehicles: Float32Array = new Float32Array(0)
    /** Each vehicle's speed relative to its road's limit (0 to 1), same order as `vehicles` */
    private speeds: Float32Array = new Float32Array(0)
    /** Each vehicle's lane on its road (0 = leftmost), same order as `vehicles` */
    private lanes: Uint8Array = new Uint8Array(0)
    private fitBounds: RoadGraph['bounds'] | null = null
    private drawQueued = false
    private lastPointer: { x: number; y: number } | null = null

    
    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d')
        const roadCtx = this.roadLayer.getContext('2d')
        if (!ctx || !roadCtx) throw new Error('Canvas 2D is not available')
        this.canvas = canvas
        this.ctx = ctx
        this.roadCtx = roadCtx

        new ResizeObserver(() => this.resize()).observe(canvas)

        canvas.style.cursor = 'grab'
        canvas.addEventListener('pointerdown', this.onPointerDown)
        canvas.addEventListener('pointermove', this.onPointerMove)
        canvas.addEventListener('pointerup', this.onPointerUp)
        canvas.addEventListener('pointercancel', this.onPointerUp)
        canvas.addEventListener('wheel', this.onWheel, { passive: false })
        canvas.addEventListener('dblclick', this.onDoubleClick)
    }

    setGraph(graph: RoadGraph): void {
        this.roads = buildRoadPaths(graph)
        this.graph = graph
        this.vehicles = new Float32Array(0)
        this.speeds = new Float32Array(0)
        this.lanes = new Uint8Array(0)
        this.fitBounds = graph.bounds
        this.viewport.fit(graph.bounds)
        this.renderRoadLayer()
        this.requestDraw()
    }

    setVehicles(positions: Float32Array, speeds: Float32Array, lanes: Uint8Array): void {
        this.vehicles = positions
        this.speeds = speeds
        this.lanes = lanes
        this.requestDraw()
    }
    // --- drawing ---------------------------------------------------------

    /** The slow part: strokes every road into the off-screen layer. */
    private renderRoadLayer(): void {
        const { roadCtx: ctx, roadLayer, viewport } = this
        if (!this.roads) return

        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, roadLayer.width, roadLayer.height)

        // World meters -> device pixels (including the flip of the y axis)
        const dpr = window.devicePixelRatio || 1
        ctx.setTransform(
            dpr * viewport.scale, 0,
            0, -dpr * viewport.scale,
            dpr * viewport.offsetX, dpr * viewport.offsetY
        )

        if (this.graph && viewport.scale >= LANE_VIEW_MIN_SCALE) {
            this.drawLaneRoads(this.graph)
        } else {
            const baseWidthPx = Math.min(MAX_ROAD_PX, Math.max(MIN_ROAD_PX, viewport.scale * ROAD_WIDTH_M))
            // Round joins and caps are expensive and invisible on hairline roads
            const smooth = baseWidthPx > 2
            ctx.lineJoin = smooth ? 'round' : 'miter'
            ctx.lineCap = smooth ? 'round' : 'butt'

            // Least important first, so major roads end up on top
            for (let i = TIERS.length - 1; i >= 0; i--) {
                const tier = TIERS[i]
                if (viewport.scale < tier.minScale) continue
                ctx.strokeStyle = tier.color
                ctx.lineWidth = (baseWidthPx * tier.widthFactor) / viewport.scale
                ctx.stroke(this.roads[i])
            }
        }

        this.roadLayerView = {
            scale: viewport.scale,
            offsetX: viewport.offsetX,
            offsetY: viewport.offsetY
        }
    }

    /** Zoomed-in roads: a carriageway per edge, lane dividers, and a line along the centre. */
    private drawLaneRoads(graph: RoadGraph): void {
        const { roadCtx: ctx, viewport } = this
        const margin = 30
        const minX = -viewport.offsetX / viewport.scale - margin
        const maxX = (viewport.width - viewport.offsetX) / viewport.scale + margin
        const maxY = viewport.offsetY / viewport.scale + margin
        const minY = (viewport.offsetY - viewport.height) / viewport.scale - margin

        // One path per tier and lane count (key = tier * 100 + lanes), so each is stroked once
        const carriageways = new Map<number, Path2D>()
        const centre = new Path2D()
        const dividers = new Path2D()
        for (const edge of graph.edges) {
            const g = edge.geometry
            if (!touchesBox(g, minX, minY, maxX, maxY)) continue
            const lanes = Math.max(1, edge.lanes)
            const key = tierIndexOf(edge.roadClass) * 100 + lanes
            let path = carriageways.get(key)
            if (!path) {
                path = new Path2D()
                carriageways.set(key, path)
            }
            addOffsetLine(path, g, (lanes * LANE_WIDTH_M) / 2)
            addOffsetLine(centre, g, 0)
            for (let i = 1; i < lanes; i++) addOffsetLine(dividers, g, i * LANE_WIDTH_M)
        }

        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        // Least important tiers first (highest key), so major roads end up on top
        for (const key of [...carriageways.keys()].sort((a, b) => b - a)) {
            ctx.strokeStyle = TIERS[Math.floor(key / 100)].color
            ctx.lineWidth = (key % 100) * LANE_WIDTH_M
            ctx.stroke(carriageways.get(key) as Path2D)
        }

        ctx.lineCap = 'butt'
        ctx.lineWidth = Math.max(0.12, 1 / viewport.scale) // at least one pixel
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.stroke(centre)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.setLineDash([2, 4])
        ctx.stroke(dividers)
        ctx.setLineDash([])
    }
    
    /** The fast part, run every frame: copy the finished road layer onto the screen. */
    private draw(): void {
        const { ctx, canvas, roadLayer, viewport } = this
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const layer = this.roadLayerView
        if (layer && roadLayer.width > 0 && roadLayer.height > 0) {
            // Move and scale the (possibly stale) road picture to match the current view
            const dpr = window.devicePixelRatio || 1
            const k = viewport.scale / layer.scale
            ctx.setTransform(
                k, 0,
                0, k,
                dpr * (viewport.offsetX - layer.offsetX * k),
                dpr * (viewport.offsetY - layer.offsetY * k)
            )
            ctx.drawImage(roadLayer, 0, 0)
        }

        this.drawVehicles()
    }

    /** Vehicles change every frame, so they are drawn fresh, always at the exact current view. */
    private drawVehicles(): void {
        const { ctx, viewport, vehicles, speeds } = this
        const dpr = window.devicePixelRatio || 1
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0) // work in CSS pixels

        const size = Math.min(VEHICLE_MAX_PX, Math.max(VEHICLE_MIN_PX, viewport.scale * VEHICLE_SIZE_M))
        const half = size / 2
        const count = Math.min(speeds.length, vehicles.length / 2)

        // One pass per color: switching the fill color for every vehicle would be slow
        for (let bucket = 0; bucket < VEHICLE_COLORS.length; bucket++) {
            ctx.fillStyle = VEHICLE_COLORS[bucket]
            for (let i = 0; i < count; i++) {
                if (speedBucket(speeds[i]) !== bucket) continue
                const x = vehicles[2 * i] * viewport.scale + viewport.offsetX
                const y = -vehicles[2 * i + 1] * viewport.scale + viewport.offsetY
                // Skip vehicles outside the window
                if (x < -size || y < -size || x > viewport.width + size || y > viewport.height + size) continue
                ctx.fillRect(x - half, y - half, size, size)
            }
        }
    }
    
    private requestDraw(): void {
        if (this.drawQueued) return
        this.drawQueued = true
        requestAnimationFrame(() => {
            this.drawQueued = false
            this.draw()
        })
    }

    /** Call after any pan or zoom: show the stale picture now, redraw properly once things settle. */
    private viewChanged(): void {
        this.requestDraw()
        if (this.settleTimer) clearTimeout(this.settleTimer)
        this.settleTimer = setTimeout(() => {
            this.settleTimer = null
            this.renderRoadLayer()
            this.requestDraw()
        }, SETTLE_MS)
    }

    private resize(): void {
        const rect = this.canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        // Canvas bitmaps are in device pixels, while the viewport works in CSS pixels
        const width = Math.round(rect.width * dpr)
        const height = Math.round(rect.height * dpr)
        this.canvas.width = width
        this.canvas.height = height
        this.roadLayer.width = width // resizing also clears the layer, so it is redrawn right away
        this.roadLayer.height = height
        this.viewport.resize(rect.width, rect.height)
        this.renderRoadLayer()
        this.requestDraw()
    }

    // --- input -----------------------------------------------------------

    private localPosition(event: MouseEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect()
        return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }

    private onPointerDown = (event: PointerEvent): void => {
        this.canvas.setPointerCapture(event.pointerId)
        this.lastPointer = this.localPosition(event)
        this.canvas.style.cursor = 'grabbing'
    }

    private onPointerMove = (event: PointerEvent): void => {
        if (!this.lastPointer) return
        const current = this.localPosition(event)
        this.viewport.panBy(current.x - this.lastPointer.x, current.y - this.lastPointer.y)
        this.lastPointer = current
        this.viewChanged()
    }

    private onPointerUp = (): void => {
        this.lastPointer = null
        this.canvas.style.cursor = 'grab'
    }

    private onWheel = (event: WheelEvent): void => {
        event.preventDefault() // don't scroll the page
        const { x, y } = this.localPosition(event)
        this.viewport.zoomAt(x, y, Math.exp(-event.deltaY * 0.0015))
        this.viewChanged()
    }

    private onDoubleClick = (): void => {
        if (!this.fitBounds) return
        this.viewport.fit(this.fitBounds)
        this.viewChanged()
    }
}

/** One big path per tier, so each tier can be stroked in a single call. */
function buildRoadPaths(graph: RoadGraph): Path2D[] {
    const paths = TIERS.map(() => new Path2D())
    for (const edge of graph.edges) {
        const path = paths[tierIndexOf(edge.roadClass)]
        const g = edge.geometry
        path.moveTo(g[0], g[1])
        for (let i = 2; i < g.length; i += 2) {
            path.lineTo(g[i], g[i + 1])
        }
    }
    return paths
}

function touchesBox(g: ArrayLike<number>, minX: number, minY: number, maxX: number, maxY: number): boolean {
    let loX = Infinity
    let hiX = -Infinity
    let loY = Infinity
    let hiY = -Infinity
    for (let i = 0; i < g.length; i += 2) {
        loX = Math.min(loX, g[i])
        hiX = Math.max(hiX, g[i])
        loY = Math.min(loY, g[i + 1])
        hiY = Math.max(hiY, g[i + 1])
    }
    return hiX >= minX && loX <= maxX && hiY >= minY && loY <= maxY
}

/** Adds the polyline shifted `distance` meters to the right of its direction of travel. */
function addOffsetLine(path: Path2D, g: ArrayLike<number>, distance: number): void {
    const n = g.length / 2
    for (let i = 0; i < n; i++) {
        // Right-hand normals of the segments before and after this vertex, summed
        let nx = 0
        let ny = 0
        if (i > 0) {
            const dx = g[2 * i] - g[2 * i - 2]
            const dy = g[2 * i + 1] - g[2 * i - 1]
            const len = Math.hypot(dx, dy) || 1
            nx += dy / len
            ny -= dx / len
        }
        if (i < n - 1) {
            const dx = g[2 * i + 2] - g[2 * i]
            const dy = g[2 * i + 3] - g[2 * i + 1]
            const len = Math.hypot(dx, dy) || 1
            nx += dy / len
            ny -= dx / len
        }
        // At a bend the sum is shorter than 2: stretch it so the line keeps its distance (capped)
        const len = Math.hypot(nx, ny) || 1
        const f = i > 0 && i < n - 1 ? (distance * Math.min(2, 2 / len)) / len : distance
        const x = g[2 * i] + nx * f
        const y = g[2 * i + 1] + ny * f
        if (i === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
    }
}