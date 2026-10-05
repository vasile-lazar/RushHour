import { describe, expect, it } from 'vitest'
import { junctionCsv } from './junctionCsv'

describe('junctionCsv', () => {
    it('writes a header and one line per junction, worst first', () => {
        const csv = junctionCsv([
            { id: 7, x: 10.04, y: -20, passed: 3, delay: 12.34, maxQueue: 2, average: 4.113 },
            { id: 9, x: 0, y: 0, passed: 0, delay: 1, maxQueue: 1, average: 1 }
        ])
        const lines = csv.split('\n')
        expect(lines).toHaveLength(3)
        expect(lines[0]).toBe('rank,node,x_m,y_m,passed,total_delay_s,avg_wait_s,max_queue')
        expect(lines[1]).toBe('1,7,10.0,-20.0,3,12.3,4.11,2')
    })
})