/** Longest single simulation step. Longer steps make vehicles jump and would destabilize braking later. */
export const MAX_STEP_SECONDS = 0.1

/** Splits a span of simulated time into equal steps, none longer than MAX_STEP_SECONDS. */
export function planSteps(simSeconds: number): { steps: number; dt: number } {
    const steps = Math.max(1, Math.ceil(simSeconds / MAX_STEP_SECONDS))
    return { steps, dt: simSeconds / steps }
}