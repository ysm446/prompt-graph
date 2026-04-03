import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GraphRepository } from './database'
import { LlamaServerManager } from './llamaServer'
import type { GraphEdgeRecord, GraphNodeRecord } from './types'

const repository = new GraphRepository()
const llamaServer = new LlamaServerManager()
const generationControllers = new Map<string, AbortController>()

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#d8d1c5',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
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
    const snapshot = repository.ensureDefaultProject()
    return { projects: repository.listProjects(), snapshot, settings: llamaServer.getSettings() }
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
  ipcMain.handle('edge:create', async (_event, projectId: string, sourceId: string, targetId: string) => {
    repository.createEdge(projectId, sourceId, targetId)
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
  ipcMain.handle('generation:start', async (event, payload: { projectId: string; sourceNodeId: string }) => {
    await llamaServer.ensureRunning()
    const snapshot = repository.getProjectSnapshot(payload.projectId)
    const sourceNode = snapshot.nodes.find((node) => node.id === payload.sourceNodeId)
    if (!sourceNode || sourceNode.type !== 'text') {
      throw new Error('Generation can only start from a text node.')
    }
    const context = collectContext(payload.sourceNodeId, snapshot.nodes, snapshot.edges)
    const newNode = repository.createNode({
      projectId: payload.projectId,
      type: 'text',
      title: sourceNode.title ? `${sourceNode.title} ->` : 'Generated',
      model: llamaServer.getSettings().llamaModelAlias,
      isGenerated: true,
      position: { x: sourceNode.position.x + 360, y: sourceNode.position.y }
    })
    repository.createEdge(payload.projectId, payload.sourceNodeId, newNode.id)
    const generationId = randomUUID()
    const controller = new AbortController()
    generationControllers.set(generationId, controller)
    void streamGeneration({
      event,
      generationId,
      targetNode: newNode,
      projectId: payload.projectId,
      systemPrompt: context.systemPrompt,
      userContext: context.userContext,
      signal: controller.signal
    }).finally(() => generationControllers.delete(generationId))
    return {
      generationId,
      targetNodeId: newNode.id,
      snapshot: repository.getProjectSnapshot(payload.projectId),
      projects: repository.listProjects()
    }
  })
}

async function streamGeneration(input: {
  event: Electron.IpcMainInvokeEvent
  generationId: string
  targetNode: GraphNodeRecord
  projectId: string
  systemPrompt: string
  userContext: string
  signal: AbortSignal
}): Promise<void> {
  try {
    const response = await fetch(`${llamaServer.getSettings().llamaBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: llamaServer.getSettings().llamaModelAlias,
        stream: true,
        messages: [
          { role: 'system', content: input.systemPrompt },
          { role: 'user', content: `${input.userContext}\n\n---\n以上の文脈に続けて書いてください。` }
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
    let content = ''
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
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
          const delta = parsed.choices?.[0]?.delta?.content ?? ''
          if (!delta) continue
          content += delta
          repository.updateNode({
            id: input.targetNode.id,
            content,
            isGenerated: true,
            model: llamaServer.getSettings().llamaModelAlias
          })
          input.event.sender.send('generation:delta', { generationId: input.generationId, nodeId: input.targetNode.id, content })
        }
      }
    }
    input.event.sender.send('generation:done', {
      generationId: input.generationId,
      nodeId: input.targetNode.id,
      snapshot: repository.getProjectSnapshot(input.projectId),
      projects: repository.listProjects()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown generation error'
    input.event.sender.send('generation:error', { generationId: input.generationId, message, nodeId: input.targetNode.id })
  }
}

function collectContext(nodeId: string, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const parentMap = new Map<string, string[]>()
  for (const edge of edges) {
    const parents = parentMap.get(edge.targetId) ?? []
    parents.push(edge.sourceId)
    parentMap.set(edge.targetId, parents)
  }
  const ordered = traverseUpstream(nodeId, nodeMap, parentMap, new Set<string>())
  const systemParts = ordered.filter((node) => node.type === 'instruction').map((node) => node.content.trim()).filter(Boolean)
  const userParts = ordered
    .filter((node) => node.type === 'text' || node.type === 'context')
    .map((node) => node.content.trim())
    .filter(Boolean)
  const localInstructions = ordered.map((node) => node.instruction?.trim()).filter((value): value is string => Boolean(value))
  const self = nodeMap.get(nodeId)
  return {
    systemPrompt: [...systemParts, ...localInstructions].join('\n\n') || 'You are a helpful writing assistant.',
    userContext: userParts.join('\n\n') || self?.content || self?.title || '空の文脈から続きを生成してください。'
  }
}

function traverseUpstream(
  nodeId: string,
  nodeMap: Map<string, GraphNodeRecord>,
  parentMap: Map<string, string[]>,
  visited: Set<string>
): GraphNodeRecord[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)
  const node = nodeMap.get(nodeId)
  if (!node) return []
  const parents = (parentMap.get(nodeId) ?? []).flatMap((parentId) => traverseUpstream(parentId, nodeMap, parentMap, visited))
  return [...parents, node]
}
