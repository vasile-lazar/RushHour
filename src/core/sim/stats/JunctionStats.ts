import type { RoadGraph } from '../../graph/types'
import type { JunctionReport, JunctionStatsSink } from '../ports'

export class JunctionStats implements JunctionStatsSink {
    private readonly graph: RoadGraph
    /** Per node: the id of its junction cluster */
    private readonly clusters: Int32Array
    // The arrays below are indexed by cluster id (a node number)
    private readonly passes: Int32Array
    private readonly delay: Float64Array
    private readonly maxQueue: Int32Array
    /** Vehicles delayed at each junction during the current step */
    private readonly waiting: Int32Array
    /** Clusters with a non-zero `waiting` this step, so the reset stays cheap */
    private readonly touched: number[] = []

    constructor(graph: RoadGraph, clusters: Int32Array) {
        this.graph = graph
        this.clusters = clusters
        const size = graph.nodes.length
        this.passes = new Int32Array(size)
        this.delay = new Float64Array(size)
        this.maxQueue = new Int32Array(size)
        this.waiting = new Int32Array(size)
    }

    passed(node: number): void {
        this.passes[this.clusters[node]]++
    }

    delayed(node: number, dt: number): void {
        const id = this.clusters[node]
        this.delay[id] += dt
        if (this.waiting[id]++ === 0) this.touched.push(id)
    }

    endStep(): void {
        for (const id of this.touched) {
            if (this.waiting[id] > this.maxQueue[id]) this.maxQueue[id] = this.waiting[id]
            this.waiting[id] = 0
        }
        this.touched.length = 0
    }

    top(count: number, includeQuiet = false): JunctionReport[] {
        const ids: number[] = []
        for (let id = 0; id < this.delay.length; id++) {
            if (this.delay[id] > 0 || (includeQuiet && this.passes[id] > 0)) ids.push(id)
        }
        ids.sort((a, b) => this.delay[b] - this.delay[a])
        return ids.slice(0, count).map((id) => ({
            id,
            x: this.graph.nodes[id].x,
            y: this.graph.nodes[id].y,
            passed: this.passes[id],
            delay: this.delay[id],
            maxQueue: this.maxQueue[id],
            average: this.delay[id] / Math.max(1, this.passes[id])
        }))
    }
}