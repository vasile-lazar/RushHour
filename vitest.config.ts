import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    resolve: {
        alias: {
            '@core': resolve('src/core'),
            '@data': resolve('src/data'),
            '@shared': resolve('src/shared')
        }
    }
})