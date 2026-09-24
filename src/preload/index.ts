import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  loginMicrosoft: () => ipcRenderer.invoke("auth:microsoft"),
  getAccounts: () => ipcRenderer.invoke("auth:getAccounts"),
  getSelectedAccount: () => ipcRenderer.invoke("auth:getSelectedAccount"),
  setSelectedAccount: (xuid) => ipcRenderer.invoke("auth:setSelectedAccount", xuid),
  logout: (xuid) => ipcRenderer.invoke("auth:logout", xuid),
  getMinecraftVersions: () => ipcRenderer.invoke('get-minecraft-versions'),
  getGpuAdapters: () => ipcRenderer.invoke('get-gpus'),
  getInstances: () => ipcRenderer.invoke('get-instances'),
  updateInstance: (payload) => ipcRenderer.invoke('update-instance', payload),
  launchInstance: (instanceId) => ipcRenderer.invoke('launch-instance', instanceId),
  deleteInstance: (instanceId, deleteFiles = false) => ipcRenderer.invoke('delete-instance', { instanceId, deleteFiles }),
  createInstance: (payload) =>
    ipcRenderer.invoke('create-instance', payload),
  onInstanceInstallProgress: (cb) =>
    ipcRenderer.on('install-progress', (_, p) => cb(p)),
  onInstanceLog: (cb) => {
    const listener = (_event, log) => cb(log);
    ipcRenderer.on('instance-log', listener);
    return () => ipcRenderer.removeListener('instance-log', listener);
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
