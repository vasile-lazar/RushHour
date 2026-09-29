import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('trafficSim', {
    platform: process.platform
})