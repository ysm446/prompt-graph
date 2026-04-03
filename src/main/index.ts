import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GraphRepository } from './database'
import { LlamaServerManager } from './llamaServer'
import type { GraphEdgeRecord, GraphNodeRecord, NodeType, ProjectSnapshot, TextInputHandle, UiPreferences } from './types'

const repository = new GraphRepository()
const llamaServer = new LlamaServerManager()
const generationControllers = new Map<string, AbortController>()
const preferencesPath = join(app.getPath('userData'), 'preferences.json')
const defaultUiPreferences: UiPreferences = {
  contextLength: 32768,
  isSidebarOpen: true,
  isInspectorOpen: true,
  isMiniMapVisible: true,
  leftSidebarWidth: 288,
  rightInspectorWidth: 380,
  generalSections: {
    context: true,
    interface: true
  }
}
let uiPreferencesCache: UiPreferences = { ...defaultUiPreferences, generalSections: { ...defaultUiPreferences.generalSections } }
let hasUnsavedChanges = false

function createWindow(): void {
  const iconPath = join(app.getAppPath(), 'assets', 'icon.ico')
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#d8d1c5',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  window.setMenuBarVisibility(false)

  let forceClose = false
  window.on('close', (event) => {
    if (forceClose || !hasUnsavedChanges) return
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Cancel', 'Close Without Saving'],
      defaultId: 0,
      cancelId: 0,
      title: 'Unsaved Changes',
      message: 'There are unsaved project changes.',
      detail: 'Close the app without saving?'
    })
    if (choice === 0) {
      event.preventDefault()
      return
    }
    forceClose = true
    hasUnsavedChanges = false
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await llamaServer.stop()
  if (process.platform !== 'darwin') app.quit()
})

function registerIpc(): void {
  ipcMain.handle('bootstrap', async () => {
    uiPreferencesCache = await loadUiPreferences()
    const settings = await llamaServer.updateSettings({ contextLength: uiPreferencesCache.contextLength })
    const snapshot = repository.ensureDefaultProject()
    return { projects: repository.listProjects(), snapshot, settings, uiPreferences: uiPreferencesCache }
  })
  ipcMain.handle('models:list', async () => llamaServer.getSettings())
  ipcMain.handle('models:select', async (_event, modelPath: string) => {
    const settings = await llamaServer.selectModel(modelPath)
    return { settings }
  })
  ipcMain.handle('models:eject', async () => {
    await llamaServer.stop()
    return { settings: llamaServer.getSettings() }
  })
  ipcMain.handle('settings:update', async (_event, input: { contextLength?: number }) => {
    const settings = await llamaServer.updateSettings(input)
    if (input.contextLength !== undefined) {
      uiPreferencesCache = await saveUiPreferences({ contextLength: settings.contextLength })
    }
    return { settings }
  })
  ipcMain.handle('preferences:save', async (_event, input: Partial<UiPreferences>) => {
    const uiPreferences = await saveUiPreferences(input)
    return { uiPreferences }
  })
  ipcMain.handle('project:setDirty', async (_event, isDirty: boolean) => {
    hasUnsavedChanges = isDirty
    return { ok: true }
  })
  ipcMain.handle('project:create', async (_event, name: string) => {
    const project = repository.createProject(name)
    return { projects: repository.listProjects(), snapshot: repository.getProjectSnapshot(project.id) }
  })
  ipcMain.handle('project:rename', async (_event, id: string, name: string) => {
    repository.renameProject(id, name)
    return { projects: repository.listProjects(), snapshot: repository.getProjectSnapshot(id) }
  })
  ipcMain.handle('project:delete', async (_event, id: string) => {
    repository.deleteProject(id)
    const projects = repository.listProjects()
    const snapshot = projects[0] ? repository.getProjectSnapshot(projects[0].id) : repository.ensureDefaultProject()
    return { projects: repository.listProjects(), snapshot }
  })
  ipcMain.handle('project:open', async (_event, id: string) => repository.getProjectSnapshot(id))
  ipcMain.handle('project:saveSnapshot', async (_event, snapshot: ProjectSnapshot) => {
    const saved = repository.saveProjectSnapshot(snapshot)
    return { projects: repository.listProjects(), snapshot: saved }
  })
  ipcMain.handle('node:create', async (_event, input) => {
    const node = repository.createNode(input)
    return { node, snapshot: repository.getProjectSnapshot(node.projectId), projects: repository.listProjects() }
  })
  ipcMain.handle('node:update', async (_event, input) => repository.updateNode(input))
  ipcMain.handle('node:delete', async (_event, id: string) => {
    const node = repository.getNode(id)
    repository.deleteNode(id)
    return { snapshot: repository.getProjectSnapshot(node.projectId), projects: repository.listProjects() }
  })
  ipcMain.handle('edge:create', async (_event, projectId: string, sourceId: string, targetId: string, sourceHandle: GraphEdgeRecord['sourceHandle'], targetHandle: GraphEdgeRecord['targetHandle']) => {
    repository.createEdge(projectId, sourceId, targetId, sourceHandle, targetHandle)
    return { snapshot: repository.getProjectSnapshot(projectId), projects: repository.listProjects() }
  })
  ipcMain.handle('edge:delete', async (_event, id: string, projectId: string) => {
    repository.deleteEdge(id)
    return { snapshot: repository.getProjectSnapshot(projectId), projects: repository.listProjects() }
  })
  ipcMain.handle('reader:export', async (_event, name: string, content: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Export Reader View',
      defaultPath: `${name || 'reader'}.md`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] }
      ]
    })
    if (result.canceled || !result.filePath) return { saved: false }
    await writeFile(result.filePath, content, 'utf8')
    return { saved: true, filePath: result.filePath }
  })
  ipcMain.handle('generation:stop', async (_event, generationId: string) => {
    generationControllers.get(generationId)?.abort()
    generationControllers.delete(generationId)
  })
  ipcMain.handle('generation:start', async (event, payload: { projectId: string; sourceNodeId: string; snapshot?: ProjectSnapshot }) => {
    const snapshot = payload.snapshot ?? repository.getProjectSnapshot(payload.projectId)
    const sourceNode = snapshot.nodes.find((node) => node.id === payload.sourceNodeId)
    if (!sourceNode || sourceNode.type !== 'text') {
      throw new Error('Generation can only start from a text node.')
    }
    const context = collectContext(payload.sourceNodeId, snapshot.nodes, snapshot.edges)
    const generationId = randomUUID()
    const controller = new AbortController()
    generationControllers.set(generationId, controller)
    void streamGeneration({
      event,
      generationId,
      snapshot,
      persistToRepository: payload.snapshot === undefined,
      targetNode: sourceNode,
      projectId: payload.projectId,
      systemPrompt: context.systemPrompt,
      userContext: context.userContext,
      initialContent: '',
      signal: controller.signal
    }).finally(() => generationControllers.delete(generationId))
    return {
      generationId,
      targetNodeId: sourceNode.id,
      snapshot,
      projects: repository.listProjects()
    }
  })
}

async function streamGeneration(input: {
  event: Electron.IpcMainInvokeEvent
  generationId: string
  snapshot: ProjectSnapshot
  persistToRepository: boolean
  targetNode: GraphNodeRecord
  projectId: string
  systemPrompt: string
  userContext: string
  initialContent: string
  signal: AbortSignal
}): Promise<void> {
  try {
    await llamaServer.ensureRunning()
    const response = await fetch(`${llamaServer.getSettings().llamaBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llamaServer.getSettings().llamaModelAlias,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: input.userContext + '\\n\\n---\\nWrite the target text based on the context above.' }
        ]
      }),
      signal: input.signal
    })
    if (!response.ok || !response.body) {
      throw new Error(`Generation request failed: ${response.status}`)
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = input.initialContent
    let finishReason: string | null = null
    let completionTokens: number | null = null
    const startedAt = Date.now()
    let workingSnapshot = input.snapshot
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''
      for (const chunk of chunks) {
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
            usage?: { completion_tokens?: number }
          }
          finishReason = parsed.choices?.[0]?.finish_reason ?? finishReason
          completionTokens = parsed.usage?.completion_tokens ?? completionTokens
          const delta = parsed.choices?.[0]?.delta?.content ?? ''
          if (!delta) continue
          content += delta
          const visibleContent = stripThinkTags(content)
          if (input.persistToRepository) {
            repository.updateNode({
              id: input.targetNode.id,
              content: visibleContent,
              isGenerated: true,
              model: llamaServer.getSettings().llamaModelAlias
            })
          } else {
            workingSnapshot = updateSnapshotNode(workingSnapshot, input.targetNode.id, {
              content: visibleContent,
              isGenerated: true,
              model: llamaServer.getSettings().llamaModelAlias
            })
          }
          input.event.sender.send('generation:delta', { generationId: input.generationId, nodeId: input.targetNode.id, content: visibleContent })
        }
      }
    }
    const generationMeta = buildGenerationMeta({
      completionTokens,
      durationMs: Date.now() - startedAt,
      finishReason
    })
    if (input.persistToRepository) {
      repository.updateNode({
        id: input.targetNode.id,
        content: stripThinkTags(content),
        isGenerated: true,
        model: llamaServer.getSettings().llamaModelAlias,
        generationMeta
      })
    } else {
      workingSnapshot = updateSnapshotNode(workingSnapshot, input.targetNode.id, {
        content: stripThinkTags(content),
        isGenerated: true,
        model: llamaServer.getSettings().llamaModelAlias,
        generationMeta
      })
    }
    input.event.sender.send('generation:done', {
      generationId: input.generationId,
      nodeId: input.targetNode.id,
      snapshot: input.persistToRepository ? repository.getProjectSnapshot(input.projectId) : workingSnapshot,
      projects: repository.listProjects()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    input.event.sender.send('generation:error', { generationId: input.generationId, message, nodeId: input.targetNode.id })
  }
}

function updateSnapshotNode(snapshot: ProjectSnapshot, nodeId: string, patch: Partial<GraphNodeRecord>): ProjectSnapshot {
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((node) => node.id === nodeId ? { ...node, ...patch, updatedAt: new Date().toISOString() } : node)
  }
}
function buildGenerationMeta(input: { completionTokens: number | null; durationMs: number; finishReason: string | null }) {
  const durationSeconds = input.durationMs > 0 ? Number((input.durationMs / 1000).toFixed(2)) : null
  const tokensPerSecond =
    input.completionTokens !== null && durationSeconds && durationSeconds > 0
      ? Number((input.completionTokens / durationSeconds).toFixed(1))
      : null

  return {
    completionTokens: input.completionTokens,
    tokensPerSecond,
    durationSeconds,
    finishReason: input.finishReason
  }
}
function collectContext(nodeId: string, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const self = nodeMap.get(nodeId)
  const directTextParents = getHandleParents(nodeId, 'text', edges, nodeMap)
  const directContextParents = getHandleParents(nodeId, 'context', edges, nodeMap)
  const directInstructionParents = getHandleParents(nodeId, 'instruction', edges, nodeMap)
  const upstreamTexts = collectUpstreamTextNodes(directTextParents, edges, nodeMap)

  const globalInstructionParts = directInstructionParents
    .filter((node) => node.type === 'instruction' && !node.isLocal)
    .map((node) => node.content.trim())
    .filter(Boolean)
  const localInstructionParts = directInstructionParents
    .filter((node) => node.type === 'instruction' && node.isLocal)
    .map((node) => node.content.trim())
    .filter(Boolean)
  const directParentTexts = directTextParents
    .filter((node) => node.content.trim())
    .map((node, index) => `# Direct Parent Text ${index + 1}${node.title ? `: ${node.title}` : ''}
${node.content.trim()}`)
  const upstreamTextParts = upstreamTexts
    .filter((node) => node.content.trim())
    .map((node, index) => `# Upstream Text ${index + 1}${node.title ? `: ${node.title}` : ''}
${node.content.trim()}`)
  const contextParts = directContextParents
    .filter((node) => node.content.trim())
    .map((node, index) => `# ${node.isLocal ? 'Local Context' : 'Context'} ${index + 1}${node.title ? `: ${node.title}` : ''}
${node.content.trim()}`)
  const targetInfo = self
    ? `# Target Node${self.title ? `: ${self.title}` : ''}
Write the final content for this target node.`
    : `# Target Node
Write the final content for this target node.`

  return {
    systemPrompt: [...globalInstructionParts, ...localInstructionParts].join('\\n\\n') || 'You are a helpful writing assistant.',
    userContext: [
      directParentTexts.length > 0 ? 'Use the direct parent texts below as the highest-priority source material.' : '',
      ...directParentTexts,
      ...upstreamTextParts,
      ...contextParts,
      targetInfo
    ].filter(Boolean).join('\n\n') || self?.title || 'Write the final content for the target node.'
  }
}

function stripThinkTags(content: string): string {
  return content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimStart()
}

function getHandleParents(
  targetId: string,
  handle: TextInputHandle,
  edges: GraphEdgeRecord[],
  nodeMap: Map<string, GraphNodeRecord>
): GraphNodeRecord[] {
  return edges
    .filter((edge) => edge.targetId === targetId && resolveTargetHandle(edge, nodeMap) === handle)
    .map((edge) => nodeMap.get(edge.sourceId))
    .filter((node): node is GraphNodeRecord => Boolean(node))
}

function collectUpstreamTextNodes(
  directParents: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  nodeMap: Map<string, GraphNodeRecord>
): GraphNodeRecord[] {
  const results: GraphNodeRecord[] = []
  const visited = new Set<string>()

  for (const parent of directParents) {
    for (const upstream of traverseTextParents(parent.id, edges, nodeMap, visited)) {
      results.push(upstream)
    }
  }

  return results
}

function traverseTextParents(
  nodeId: string,
  edges: GraphEdgeRecord[],
  nodeMap: Map<string, GraphNodeRecord>,
  visited: Set<string>
): GraphNodeRecord[] {
  const results: GraphNodeRecord[] = []
  for (const edge of edges) {
    if (edge.targetId !== nodeId || resolveTargetHandle(edge, nodeMap) !== 'text') continue
    const parent = nodeMap.get(edge.sourceId)
    if (!parent || parent.type !== 'text' || visited.has(parent.id)) continue
    visited.add(parent.id)
    results.push(parent)
    results.push(...traverseTextParents(parent.id, edges, nodeMap, visited))
  }
  return results
}

function resolveTargetHandle(edge: GraphEdgeRecord, nodeMap: Map<string, GraphNodeRecord>): TextInputHandle | null {
  if (edge.targetHandle) return edge.targetHandle
  const sourceType = nodeMap.get(edge.sourceId)?.type
  return sourceType ? defaultTargetHandleForNodeType(sourceType) : null
}

function defaultTargetHandleForNodeType(type: NodeType): TextInputHandle | null {
  if (type === 'text') return 'text'
  if (type === 'context') return 'context'
  return 'instruction'
}

async function loadUiPreferences(): Promise<UiPreferences> {
  try {
    const raw = await readFile(preferencesPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<UiPreferences>
    return mergeUiPreferences(parsed)
  } catch {
    return { ...defaultUiPreferences, generalSections: { ...defaultUiPreferences.generalSections } }
  }
}

async function saveUiPreferences(input: Partial<UiPreferences>): Promise<UiPreferences> {
  uiPreferencesCache = mergeUiPreferences({ ...uiPreferencesCache, ...input })
  await writeFile(preferencesPath, JSON.stringify(uiPreferencesCache, null, 2), 'utf8')
  return uiPreferencesCache
}

function mergeUiPreferences(input: Partial<UiPreferences>): UiPreferences {
  return {
    contextLength: input.contextLength ?? defaultUiPreferences.contextLength,
    isSidebarOpen: input.isSidebarOpen ?? defaultUiPreferences.isSidebarOpen,
    isInspectorOpen: input.isInspectorOpen ?? defaultUiPreferences.isInspectorOpen,
    isMiniMapVisible: input.isMiniMapVisible ?? defaultUiPreferences.isMiniMapVisible,
    leftSidebarWidth: input.leftSidebarWidth ?? defaultUiPreferences.leftSidebarWidth,
    rightInspectorWidth: input.rightInspectorWidth ?? defaultUiPreferences.rightInspectorWidth,
    generalSections: {
      context: input.generalSections?.context ?? defaultUiPreferences.generalSections.context,
      interface: input.generalSections?.interface ?? defaultUiPreferences.generalSections.interface
    }
  }
}



