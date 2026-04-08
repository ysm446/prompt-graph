import { nativeImage, contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('graphChat', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  listModels: () => ipcRenderer.invoke('models:list'),
  selectModel: (modelPath: string) => ipcRenderer.invoke('models:select', modelPath),
  ejectModel: () => ipcRenderer.invoke('models:eject'),
  updateSettings: (input) => ipcRenderer.invoke('settings:update', input),
  savePreferences: (input) => ipcRenderer.invoke('preferences:save', input),
  setProjectDirty: (isDirty: boolean) => ipcRenderer.invoke('project:setDirty', isDirty),
  createProject: (name: string) => ipcRenderer.invoke('project:create', name),
  renameProject: (id: string, name: string) => ipcRenderer.invoke('project:rename', id, name),
  duplicateProject: (id: string, newName: string) => ipcRenderer.invoke('project:duplicate', id, newName),
  deleteProject: (id: string) => ipcRenderer.invoke('project:delete', id),
  openProject: (id: string) => ipcRenderer.invoke('project:open', id),
  saveProjectSnapshot: (snapshot) => ipcRenderer.invoke('project:saveSnapshot', snapshot),
  createNode: (input) => ipcRenderer.invoke('node:create', input),
  createImageNode: (input) => ipcRenderer.invoke('node:createImage', input),
  replaceImageNode: (nodeId: string) => ipcRenderer.invoke('node:replaceImage', nodeId),
  updateNode: (input) => ipcRenderer.invoke('node:update', input),
  deleteNode: (id: string) => ipcRenderer.invoke('node:delete', id),
  createEdge: (projectId: string, sourceId: string, targetId: string, sourceHandle, targetHandle) => ipcRenderer.invoke('edge:create', projectId, sourceId, targetId, sourceHandle, targetHandle),
  deleteEdge: (id: string, projectId: string) => ipcRenderer.invoke('edge:delete', id, projectId),
  startGeneration: (payload) => ipcRenderer.invoke('generation:start', payload),
  stopGeneration: (generationId: string) => ipcRenderer.invoke('generation:stop', generationId),
  exportReader: (name: string, content: string) => ipcRenderer.invoke('reader:export', name, content),
  toImageDataUrl: (filePath: string) => {
    const image = nativeImage.createFromPath(filePath)
    return image.isEmpty() ? null : image.toDataURL()
  },
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
  },
  startProofread: (proofreadId: string, text: string, systemPrompt?: string) => ipcRenderer.invoke('proofread:start', { proofreadId, text, systemPrompt }),
  stopProofread: (proofreadId: string) => ipcRenderer.invoke('proofread:stop', proofreadId),
  onProofreadDelta: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('proofread:delta', listener)
    return () => ipcRenderer.off('proofread:delta', listener)
  },
  onProofreadDone: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('proofread:done', listener)
    return () => ipcRenderer.off('proofread:done', listener)
  },
  onProofreadError: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('proofread:error', listener)
    return () => ipcRenderer.off('proofread:error', listener)
  },
  onPromptLog: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('debug:promptLog', listener)
    return () => ipcRenderer.off('debug:promptLog', listener)
  }
})

