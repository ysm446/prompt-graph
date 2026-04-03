import type { AppSettings, GraphEdgeRecord, GraphNodeRecord, ProjectRecord, ProjectSnapshot } from '../../main/types'

export type { AppSettings, GraphEdgeRecord, GraphNodeRecord, ProjectRecord, ProjectSnapshot }

export interface ReaderState {
  nodeId: string
  title: string
  content: string
}
