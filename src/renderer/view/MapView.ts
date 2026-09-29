import type { RoadGraph } from '@core/graph/types'
import { Viewport } from './Viewport'

const ROAD_COLOR = '#5b7a99'
/** Roads are drawn about this many meters wide when zoomed in, but never thinner than MIN_ROAD_PX. */
const ROAD_WIDTH_M = 7
const MIN_ROAD_PX = 0.8
const MAX_ROAD_PX = 6

export class MapView {
    private readonly canvas: HTMLCanvasElement
    private readonly ctx: CanvasRenderingContext2D
    private readonly viewport = new Viewport()
    private roads: Path2D | null = null
    private drawQueued = false
    private lastPointer: { x: number; y: number } | null = null

    private fitBounds: RoadGraph['bounds'] | null = null

    constructor(canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas 2D is not available')
        this.canvas = canvas
        this.ctx = ctx

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
        this.roads = buildRoadPath(graph)
        this.fitBounds = graph.bounds
        this.viewport.fit(graph.bounds)
        this.requestDraw()
    }

    // --- drawing ---------------------------------------------------------

    private requestDraw(): void {
        if (this.drawQueued) return
        this.drawQueued = true
        requestAnimationFrame(() => {
            this.drawQueued = false
            this.draw()
        })
    }

    private draw(): void {
        const { ctx, canvas, viewport } = this
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (!this.roads) return

        // World meters -> device pixels (including the flip of the y axis)
        const dpr = window.devicePixelRatio || 1
        ctx.setTransform(
            dpr * viewport.scale, 0,
            0, -dpr * viewport.scale,
            dpr * viewport.offsetX, dpr * viewport.offsetY
        )

        // Line widths are in world units, so convert from the CSS pixels we want
        const widthPx = Math.min(MAX_ROAD_PX, Math.max(MIN_ROAD_PX, viewport.scale * ROAD_WIDTH_M))
        ctx.lineWidth = widthPx / viewport.scale
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.strokeStyle = ROAD_COLOR
        ctx.stroke(this.roads)
    }

    private resize(): void {
        const rect = this.canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        // The canvas bitmap is in device pixels, while the viewport works in CSS pixels
        this.canvas.width = Math.round(rect.width * dpr)
        this.canvas.height = Math.round(rect.height * dpr)
        this.viewport.resize(rect.width, rect.height)
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
        this.requestDraw()
    }

    private onPointerUp = (): void => {
        this.lastPointer = null
        this.canvas.style.cursor = 'grab'
    }

    private onWheel = (event: WheelEvent): void => {
        event.preventDefault() // don't scroll the page
        const { x, y } = this.localPosition(event)
        this.viewport.zoomAt(x, y, Math.exp(-event.deltaY * 0.0015))
        this.requestDraw()
    }

    private onDoubleClick = (): void => {
        if (!this.fitBounds) return
        this.viewport.fit(this.fitBounds)
        this.requestDraw()
    }
}

/** One big path holding every road, so it can be stroked in a single call. */
function buildRoadPath(graph: RoadGraph): Path2D {
    const path = new Path2D()
    for (const edge of graph.edges) {
        const g = edge.geometry
        path.moveTo(g[0], g[1])
        for (let i = 2; i < g.length; i += 2) {
            path.lineTo(g[i], g[i + 1])
        }
    }
    return path
}