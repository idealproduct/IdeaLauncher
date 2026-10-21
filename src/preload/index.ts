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
  getDownloads: () => ipcRenderer.invoke('downloads:list'),
  getDownloadSettings: () => ipcRenderer.invoke('downloads:settings'),
  chooseDownloadDirectory: () => ipcRenderer.invoke('downloads:choose-directory'),
  resetDownloadDirectory: () => ipcRenderer.invoke('downloads:reset-directory'),
  openDownloadDirectory: (id?) => ipcRenderer.invoke('downloads:open-directory', id),
  openRestrictedDownloads: (id) => ipcRenderer.invoke('downloads:open-restricted', id),
  selectDownloadFiles: (id) => ipcRenderer.invoke('downloads:select-files', id),
  enqueuePack: (payload) => ipcRenderer.invoke('content:enqueue-pack', payload),
  onDownloadsChanged: (callback) => {
    const listener = (_event, tasks) => callback(tasks);
    ipcRenderer.on('downloads:changed', listener);
    return () => ipcRenderer.removeListener('downloads:changed', listener);
  },
  getContentConfiguration: () => ipcRenderer.invoke('content:configured'),
  searchContent: (query) => ipcRenderer.invoke('content:search', query),
  getContentFiles: (payload) => ipcRenderer.invoke('content:files', payload),
  openContentProject: (projectId) => ipcRenderer.invoke('content:open-project', projectId),
  installContent: (payload) => ipcRenderer.invoke('content:install', payload),
  preparePack: (selection?) => ipcRenderer.invoke('content:prepare-pack', selection),
  discardPack: (token) => ipcRenderer.invoke('content:discard-pack', token),
  importPack: (payload) => ipcRenderer.invoke('content:import-pack', payload),
  getGlobalSettings: () => ipcRenderer.invoke('get-global-settings'),
  saveGlobalSettings: (settings) => ipcRenderer.invoke('save-global-settings', settings),
  getProcessStates: () => ipcRenderer.invoke('get-process-states'),
  stopInstance: (instanceId) => ipcRenderer.invoke('stop-instance', instanceId),
  onProcessState: (cb) => {
    const listener = (_event, state) => cb(state);
    ipcRenderer.on('instance-process-state', listener);
    return () => ipcRenderer.removeListener('instance-process-state', listener);
  },
  updateInstance: (payload) => ipcRenderer.invoke('update-instance', payload),
  launchInstance: (instanceId) => ipcRenderer.invoke('launch-instance', instanceId),
  deleteInstance: (instanceId, deleteFiles = false) => ipcRenderer.invoke('delete-instance', { instanceId, deleteFiles }),
  createInstance: (payload) =>
    ipcRenderer.invoke('create-instance', payload),
  onInstanceInstallProgress: (cb) => {
    const listener = (_event, progress) => cb(progress);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
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
