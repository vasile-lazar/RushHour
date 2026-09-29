import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const alias = {
    '@core': resolve('src/core'),
    '@data': resolve('src/data'),
    '@shared': resolve('src/shared')
}

export default defineConfig({
    main: { resolve: { alias } },
    preload: { resolve: { alias } },
    renderer: {
        root: 'src/renderer',
        resolve: { alias },
        build: {
            rollupOptions: { input: resolve('src/renderer/index.html') }
        }
    }
})