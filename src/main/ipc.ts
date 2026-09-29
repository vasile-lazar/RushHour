import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import { CachedMapProvider } from '@data/CachedMapProvider'
import type { MapProvider } from '@data/MapProvider'
import { OsmMapProvider } from '@data/osm/OsmMapProvider'
import { IpcChannel } from '@shared/ipc'

const MAX_NAME_LENGTH = 200

export function registerIpc(): void {
    const provider: MapProvider = new CachedMapProvider(
        new OsmMapProvider(),
        join(app.getPath('userData'), 'cities')
    )
    let loading = false

    ipcMain.handle(IpcChannel.LoadCity, async (event, name: unknown) => {
        // Never trust input coming from the renderer, even our own
        if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_NAME_LENGTH) {
            throw new Error('Please enter a city name')
        }
        // Overpass's usage rules ask for no parallel requests
        if (loading) throw new Error('Another city is still loading')

        loading = true
        try {
            return await provider.loadCity(name.trim(), (message) => {
                if (!event.sender.isDestroyed()) {
                    event.sender.send(IpcChannel.CityProgress, message)
                }
            })
        } finally {
            loading = false
        }
    })
}