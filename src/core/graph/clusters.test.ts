import { describe, expect, it } from 'vitest'
import { makeGraph } from '../testing/graphs'
import { buildClusters } from './clusters'

const drivable = () => true

describe('buildClusters', () => {
    it('merges nodes joined by a short link, in both directions', () => {
        const graph = makeGraph(
            [[0, 0], [4, 0], [100, 0]],
            [{ from: 0, to: 1 }, { from: 1, to: 0 }, { from: 1, to: 2 }, { from: 2, to: 1 }]
        )
        const clusters = buildClusters(graph, drivable)
        expect(clusters[0]).toBe(clusters[1])
        expect(clusters[2]).not.toBe(clusters[0])
    })

    it('chains several short links into one cluster', () => {
        const graph = makeGraph(
            [[0, 0], [5, 0], [10, 0], [200, 0]],
            [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }]
        )
        const clusters = buildClusters(graph, drivable)
        expect(clusters[0]).toBe(clusters[2])
        expect(clusters[3]).not.toBe(clusters[0])
    })

    it('does not merge roundabout rings or links that vehicles cannot use', () => {
        const ring = makeGraph([[0, 0], [5, 0]], [{ from: 0, to: 1, roundabout: true }])
        expect(buildClusters(ring, drivable)[0]).not.toBe(buildClusters(ring, drivable)[1])

        const service = makeGraph([[0, 0], [5, 0]], [{ from: 0, to: 1, roadClass: 'service' }])
        const clusters = buildClusters(service, (edge) => edge.roadClass !== 'service')
        expect(clusters[0]).not.toBe(clusters[1])
    })

    it('keeps short roads next to a roundabout out of the cluster', () => {
        const graph = makeGraph(
            [[0, 0], [5, 0], [10, 0]],
            [{ from: 0, to: 1, roundabout: true }, { from: 1, to: 2 }]
        )
        const clusters = buildClusters(graph, drivable)
        expect(clusters[1]).not.toBe(clusters[2])
    })
})