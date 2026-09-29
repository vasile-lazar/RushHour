/** Total length in meters of a flat polyline [x0, y0, x1, y1, ...]. */
export function polylineLength(points: number[]): number {
    let total = 0
    for (let i = 0; i + 3 < points.length; i += 2) {
        total += Math.hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1])
    }
    return total
}


/** Reverses a flat polyline while keeping each (x, y) pair together. */
export function reversePolyline(points: number[]): number[] {
    const reversed: number[] = []
    for (let i = points.length - 2; i >= 0; i -= 2) {
        reversed.push(points[i], points[i + 1])
    }
    return reversed
}


/**
 * Writes the point `distance` meters along the polyline into
 * out[at] (x) and out[at + 1] (y).
 * Distances past the end clamp to the last point, negative ones to the first.
 * Assumes the polyline has at least two points.
 */
export function pointAlong(
    points: number[],
    distance: number,
    out: Float32Array,
    at: number
): void {
    let remaining = Math.max(0, distance)
    for (let i = 0; i + 3 < points.length; i += 2) {
        const dx = points[i + 2] - points[i]
        const dy = points[i + 3] - points[i + 1]
        const segment = Math.hypot(dx, dy)
        const isLastSegment = i + 4 >= points.length

        if (remaining <= segment || isLastSegment) {
            const t = segment > 0 ? Math.min(remaining / segment, 1) : 0
            out[at] = points[i] + dx * t
            out[at + 1] = points[i + 1] + dy * t
            return
        }
        remaining -= segment
    }
}