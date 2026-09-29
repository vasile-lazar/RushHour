import type { Bounds } from '@core/graph/types'

export interface Vec2 {
    x: number
    y: number
}

export const MIN_SCALE = 0.001 // pixels per meter: zoomed far out
export const MAX_SCALE = 50 // pixels per meter: zoomed far in


/**
 * Maps world coordinates (meters, y up) to screen coordinates (CSS pixels, y down):
 *   screenX =  worldX * scale + offsetX
 *   screenY = -worldY * scale + offsetY
 */
export class Viewport {
    scale = 1
    offsetX = 0
    offsetY = 0
    width = 0
    height = 0

    /** Resizes the view while keeping whatever is at its center at the center. */
    resize(width: number, height: number): void {
        this.offsetX += (width - this.width) / 2
        this.offsetY += (height - this.height) / 2
        this.width = width
        this.height = height
    }

    /** Zooms and centers so the whole area is visible, with a margin around it. */
    fit(bounds: Bounds, padding = 0.05): void {
        const worldWidth = Math.max(bounds.maxX - bounds.minX, 1)
        const worldHeight = Math.max(bounds.maxY - bounds.minY, 1)
        const usable = 1 - 2 * padding

        this.scale = Math.min(this.width / worldWidth, this.height / worldHeight) * usable

        const centerX = (bounds.minX + bounds.maxX) / 2
        const centerY = (bounds.minY + bounds.maxY) / 2
        this.offsetX = this.width / 2 - centerX * this.scale
        this.offsetY = this.height / 2 + centerY * this.scale
    }

    toScreen(x: number, y: number): Vec2 {
        return { x: x * this.scale + this.offsetX, y: -y * this.scale + this.offsetY }
    }

    toWorld(screenX: number, screenY: number): Vec2 {
        return { x: (screenX - this.offsetX) / this.scale, y: (this.offsetY - screenY) / this.scale }
    }

    panBy(dx: number, dy: number): void {
        this.offsetX += dx
        this.offsetY += dy
    }

    /** Zooms by `factor`, keeping the world point under (screenX, screenY) fixed. */
    zoomAt(screenX: number, screenY: number, factor: number): void {
        const world = this.toWorld(screenX, screenY)
        this.scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor))
        this.offsetX = screenX - world.x * this.scale
        this.offsetY = screenY + world.y * this.scale
    }
}