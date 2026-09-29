import { describe, expect, it } from 'vitest'
import { MAX_SCALE, Viewport } from './Viewport'

function fitted(): Viewport {
    const viewport = new Viewport()
    viewport.resize(1000, 500)
    viewport.fit({ minX: -100, minY: -50, maxX: 100, maxY: 50 })
    return viewport
}

describe('Viewport', () => {
    it('fits bounds with a margin, centered', () => {
        const viewport = fitted()
        expect(viewport.scale).toBeCloseTo(4.5) // min(1000/200, 500/100) * 0.9
        const center = viewport.toScreen(0, 0)
        expect(center.x).toBeCloseTo(500)
        expect(center.y).toBeCloseTo(250)
        const corner = viewport.toScreen(100, 50)
        expect(corner.x).toBeCloseTo(950)
        expect(corner.y).toBeCloseTo(25)
    })

    it('draws north (positive y) toward the top of the screen', () => {
        const viewport = fitted()
        expect(viewport.toScreen(0, 10).y).toBeLessThan(viewport.toScreen(0, 0).y)
    })

    it('converts between world and screen coordinates both ways', () => {
        const viewport = fitted()
        const screen = viewport.toScreen(37, -12)
        const world = viewport.toWorld(screen.x, screen.y)
        expect(world.x).toBeCloseTo(37)
        expect(world.y).toBeCloseTo(-12)
    })

    it('pans by a screen offset', () => {
        const viewport = fitted()
        const before = viewport.toScreen(10, 10)
        viewport.panBy(30, -20)
        const after = viewport.toScreen(10, 10)
        expect(after.x - before.x).toBeCloseTo(30)
        expect(after.y - before.y).toBeCloseTo(-20)
    })

    it('zooms around the cursor without moving the point under it', () => {
        const viewport = fitted()
        const before = viewport.toWorld(300, 200)
        viewport.zoomAt(300, 200, 2)
        const after = viewport.toWorld(300, 200)
        expect(viewport.scale).toBeCloseTo(9)
        expect(after.x).toBeCloseTo(before.x)
        expect(after.y).toBeCloseTo(before.y)
    })

    it('clamps the zoom level', () => {
        const viewport = fitted()
        viewport.zoomAt(500, 250, 1e9)
        expect(viewport.scale).toBe(MAX_SCALE)
    })

    it('keeps the center of the view fixed when resized', () => {
        const viewport = fitted()
        const centerBefore = viewport.toWorld(500, 250)
        viewport.resize(800, 600)
        const centerAfter = viewport.toWorld(400, 300)
        expect(centerAfter.x).toBeCloseTo(centerBefore.x)
        expect(centerAfter.y).toBeCloseTo(centerBefore.y)
    })
})