import { useMemo, useState } from 'react'
import type { GraphEdge, GraphNode, NodeKind } from '@shared/types'
import { compileScene } from '@shared/compile'
import { useGraphStore } from '../store/graphStore'

export function CompilePanel() {
  const nodes = useGraphStore((s) => s.nodes)
  const edges = useGraphStore((s) => s.edges)
  const [copied, setCopied] = useState<string | null>(null)

  const compiled = useMemo(() => {
    const gNodes: GraphNode[] = nodes.map((n) => ({
      id: n.id,
      kind: n.type as NodeKind,
      position: n.position,
      data: n.data
    }))
    const gEdges: GraphEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null
    }))
    const scenes = gNodes.filter((n) => n.kind === 'scene')
    return scenes.map((scene) => ({
      scene,
      result: compileScene(scene, gNodes, gEdges)
    }))
  }, [nodes, edges])

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200)
  }

  return (
    <div className="flex flex-col gap-3 text-xs text-[#c0caf5]">
      <h2 className="text-sm font-semibold">プロンプト合成</h2>
      {compiled.length === 0 && <p className="text-[#565f89]">Scene ノードを追加してください</p>}
      {compiled.map(({ scene, result }) => (
        <section key={scene.id} className="rounded border border-[#2a2e3f] p-2">
          <div className="mb-1 font-semibold text-[#ff9e64]">
            🎬 {scene.data.kind === 'scene' ? scene.data.label : 'Scene'}
            {result.seed && <span className="ml-2 text-[10px] text-[#565f89]">seed: {result.seed}</span>}
          </div>

          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] uppercase text-[#565f89]">positive</span>
            <button
              className="text-[10px] text-[#7aa2f7] hover:underline"
              onClick={() => copy(result.positive, `${scene.id}-pos`)}
            >
              {copied === `${scene.id}-pos` ? 'copied!' : 'copy'}
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded bg-[#11131a] p-2 text-[11px] text-[#9ece6a]">
            {result.positive || '(空)'}
          </pre>

          {result.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[10px] text-[#e0af68]">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
