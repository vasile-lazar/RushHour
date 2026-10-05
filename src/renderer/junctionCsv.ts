import type { JunctionReport } from '@core/sim/ports'

/** The junction table as CSV text, in the order given (worst first). */
export function junctionCsv(rows: readonly JunctionReport[]): string {
    const lines = ['rank,node,x_m,y_m,passed,total_delay_s,avg_wait_s,max_queue']
    rows.forEach((row, i) => {
        lines.push(
            [
                i + 1,
                row.id,
                row.x.toFixed(1),
                row.y.toFixed(1),
                row.passed,
                row.delay.toFixed(1),
                row.average.toFixed(2),
                row.maxQueue
            ].join(',')
        )
    })
    return lines.join('\n')
}