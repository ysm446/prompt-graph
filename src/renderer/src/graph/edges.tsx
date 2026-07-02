import { BaseEdge, getSmoothStepPath, useStore, type EdgeProps } from '@xyflow/react'
import type { NodeKind } from '@shared/types'
import { ACCENT } from './nodes'

const FALLBACK_STROKE = '#6a728f'

// 接続元ノードの種別アクセントで着色する角丸 smoothstep エッジ（lm-graph 準拠）
function KindEdge({
  source,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerStart,
  markerEnd
}: EdgeProps) {
  const kind = useStore((s) => s.nodeLookup.get(source)?.type) as NodeKind | undefined
  const stroke = (kind && ACCENT[kind]) || FALLBACK_STROKE
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 40
  })
  return (
    <BaseEdge
      path={path}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={{
        stroke,
        strokeWidth: selected ? 3.5 : 2.6,
        opacity: selected ? 1 : 0.84
      }}
    />
  )
}

// 既定タイプを上書きするので、保存済みの type 未指定エッジにもそのまま適用される
export const edgeTypes = { default: KindEdge }
