import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type TrafficSimApi } from '@shared/ipc'

const api: TrafficSimApi = {
    loadCity: (name) => ipcRenderer.invoke(IpcChannel.LoadCity, name),

    onCityProgress: (listener) => {
        const handler = (_event: unknown, message: string): void => listener(message)
        ipcRenderer.on(IpcChannel.CityProgress, handler)
        return () => ipcRenderer.off(IpcChannel.CityProgress, handler)
    }
}

contextBridge.exposeInMainWorld('trafficSim', api)