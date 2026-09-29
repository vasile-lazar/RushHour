import type { EdgeFilter } from './ports'

/** Vehicles drive everywhere except service roads (parking aisles, courtyards, driveways). */
export const isDrivable: EdgeFilter = (edge) => edge.roadClass !== 'service'