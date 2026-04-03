import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('graphChat', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  listModels: () => ipcRenderer.invoke('models:list'),
  selectModel: (modelPath: string) => ipcRenderer.invoke('models:select', modelPath),
  ejectModel: () => ipcRenderer.invoke('models:eject'),
  updateSettings: (input) => ipcRenderer.invoke('settings:update', input),
  createProject: (name: string) => ipcRenderer.invoke('project:create', name),
  renameProject: (id: string, name: string) => ipcRenderer.invoke('project:rename', id, name),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),
  openProject: (id: string) => ipcRenderer.invoke('project:open', id),
  createNode: (input) => ipcRenderer.invoke('node:create', input),
  updateNode: (input) => ipcRenderer.invoke('node:update', input),
  deleteNode: (id: string) => ipcRenderer.invoke('node:delete', id),
  createEdge: (projectId: string, sourceId: string, targetId: string) => ipcRenderer.invoke('edge:create', projectId, sourceId, targetId),
  deleteEdge: (id: string, projectId: string) => ipcRenderer.invoke('edge:delete', id, projectId),
  startGeneration: (payload) => ipcRenderer.invoke('generation:start', payload),
  stopGeneration: (generationId: string) => ipcRenderer.invoke('generation:stop', generationId),
  exportReader: (name: string, content: string) => ipcRenderer.invoke('reader:export', name, content),
  onGenerationDelta: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('generation:delta', listener)
    return () => ipcRenderer.off('generation:delta', listener)
  },
  onGenerationDone: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('generation:done', listener)
    return () => ipcRenderer.off('generation:done', listener)
  },
  onGenerationError: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('generation:error', listener)
    return () => ipcRenderer.off('generation:error', listener)
  }
})
