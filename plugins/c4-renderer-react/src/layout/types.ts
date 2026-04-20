import type { Node, Edge } from '@xyflow/react';
import type { C4Diagram } from '@fulgas/plugin-c4-node';

/** Supported layout engines. */
export type LayoutEngine = 'dagre' | 'elk';

/** Common return shape for all layout implementations. */
export type LayoutResult = { nodes: Node[]; edges: Edge[] };

/** Function signature shared by every layout implementation. */
export type LayoutFn = (diagram: C4Diagram) => Promise<LayoutResult>;
