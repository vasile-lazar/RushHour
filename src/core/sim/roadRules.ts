import type { EdgeFilter } from './ports'

const RANKS: Record<string, number> = {
    motorway: 6,
    motorway_link: 6,
    trunk: 5,
    trunk_link: 5,
    primary: 4,
    primary_link: 4,
    secondary: 3,
    secondary_link: 3,
    tertiary: 2,
    tertiary_link: 2,
    unclassified: 1,
    residential: 1,
    living_street: 1,
    service: 0
}

/** How important a road is: the higher the rank, the more priority it has at junctions. */
export function roadRank(roadClass: string): number {
    return RANKS[roadClass] ?? 1
}

/** Vehicles drive everywhere except service roads (parking aisles, courtyards, driveways). */
export const isDrivable: EdgeFilter = (edge) => edge.roadClass !== 'service'
