import { describe, expect, it } from 'vitest'
import { buildGraph } from './GraphBuilder'
import type { OverpassNode, OverpassWay } from './OverpassClient'

const node = (id: number, lat: number, lon: number, tags?: Record<string, string>): OverpassNode => ({
    type: 'node',
    id,
    lat,
    lon,
    tags
})
const way = (id: number, nodes: number[], tags: Record<string, string>): OverpassWay => ({
    type: 'way',
    id,
    nodes,
    tags
})

describe('buildGraph', () => {
    it('turns a two-way street into two opposite edges', () => {
        const graph = buildGraph('test', {
            elements: [node(1, 47, 28), node(2, 47.001, 28), way(10, [1, 2], { highway: 'residential' })]
        })

        expect(graph.nodes).toHaveLength(2)
        expect(graph.edges).toHaveLength(2)
        expect(graph.edges[0].length).toBeCloseTo(111.19, 1)
        expect(graph.edges[1].from).toBe(graph.edges[0].to)
        expect(graph.edges[1].to).toBe(graph.edges[0].from)
        expect(graph.bounds.maxY - graph.bounds.minY).toBeCloseTo(111.19, 1)
    })

    it('turns a one-way street into a single edge', () => {
        const graph = buildGraph('test', {
            elements: [
                node(1, 47, 28),
                node(2, 47.001, 28),
                way(10, [1, 2], { highway: 'residential', oneway: 'yes' })
            ]
        })
        expect(graph.edges).toHaveLength(1)
    })

    it('cuts a way where another way crosses it', () => {
        // A T-junction: street 10 runs 1-2-3, side road 11 (one-way) leaves from node 2
        const graph = buildGraph('test', {
            elements: [
                node(1, 47, 28),
                node(2, 47.001, 28),
                node(3, 47.002, 28),
                node(4, 47.001, 28.001),
                way(10, [1, 2, 3], { highway: 'residential' }),
                way(11, [2, 4], { highway: 'residential', oneway: 'yes' })
            ]
        })
        // street 10: 2 segments x 2 directions = 4, side road: 1
        expect(graph.edges).toHaveLength(5)
        expect(graph.nodes).toHaveLength(4)
    })

    it('cuts a way at a traffic signal and marks that node', () => {
        const graph = buildGraph('test', {
            elements: [
                node(1, 47, 28),
                node(2, 47.001, 28, { highway: 'traffic_signals' }),
                node(3, 47.002, 28),
                way(10, [1, 2, 3], { highway: 'residential', oneway: 'yes' })
            ]
        })
        expect(graph.edges).toHaveLength(2)
        expect(graph.nodes.filter((n) => n.hasSignal)).toHaveLength(1)
    })

    it('reads speed and lanes from tags', () => {
        const graph = buildGraph('test', {
            elements: [
                node(1, 47, 28),
                node(2, 47.001, 28),
                way(10, [1, 2], { highway: 'primary', maxspeed: '36', lanes: '4' })
            ]
        })
        expect(graph.edges[0].speedLimit).toBeCloseTo(10, 5) // 36 km/h = 10 m/s
        expect(graph.edges[0].lanes).toBe(2) // 4 lanes total, two-way -> 2 per direction
    })

    it('throws when there are no roads', () => {
        expect(() => buildGraph('Nowhere', { elements: [] })).toThrow('No drivable roads')
    })
})