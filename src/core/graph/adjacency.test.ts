import { describe, expect, it } from 'vitest'
import { twoWayLine } from '../testing/graphs'
import {buildAdjacency, buildIncoming} from './adjacency'

describe('buildAdjacency', () => {
    it('lists the edges leaving each node', () => {
        // edges: 0: n0->n1, 1: n1->n0, 2: n1->n2, 3: n2->n1
        const graph = twoWayLine([[0, 0], [100, 0], [200, 0]])
        expect(buildAdjacency(graph)).toEqual([[0], [1, 2], [3]])
    })
})

describe('buildIncoming', () => {
    it('lists the edges arriving at each node', () => {
        // edges: 0: n0->n1, 1: n1->n0, 2: n1->n2, 3: n2->n1
        const graph = twoWayLine([[0, 0], [100, 0], [200, 0]])
        expect(buildIncoming(graph)).toEqual([[1], [0, 3], [2]])
    })
})