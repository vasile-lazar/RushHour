/** A function returning a random number in [0, 1). */
export type Rng = () => number

/** Mulberry32: a tiny, fast, seedable random number generator. */
export function createRng(seed: number): Rng {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}