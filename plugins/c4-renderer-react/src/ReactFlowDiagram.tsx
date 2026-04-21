import {
  applyEdgeChanges,
  applyNodeChanges,
  Controls,
  ReactFlow,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { useEffect, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import { BOUNDARY_PAD, NODE_H, NODE_W } from './c4Style';
import { ElkEdge } from './edges/ElkEdge';
import { elkLayout } from './layout/elkLayout';
import type { LayoutResult } from './layout/types';
import {
  ActorNode,
  BoundaryNode,
  ExternalNode,
  InternalNode,
} from './nodes/C4NodeTypes';

const nodeTypes: NodeTypes = {
  boundary: BoundaryNode as any,
  internal: InternalNode as any,
  external: ExternalNode as any,
  actor: ActorNode as any,
};

const edgeTypes: EdgeTypes = {
  elk: ElkEdge as any,
};

/**
 * Override node positions with saved values, clearing ELK edge sections so
 * ElkEdge falls back to the smooth-step path (which uses live node positions).
 */
function applyPositions(
  result: LayoutResult,
  positions: Record<string, { x: number; y: number }>,
): LayoutResult {
  const nodes = result.nodes.map(n => {
    const saved = positions[n.id];
    return saved ? { ...n, position: saved } : n;
  });
  const edges = result.edges.map(e => ({
    ...e,
    data: { ...(e.data as object), sections: undefined },
  }));
  return { nodes, edges };
}

/** Expand the boundary node to contain all its children (with padding). */
function resizeBoundary(nodes: Node[]): Node[] {
  const boundary = nodes.find(n => n.type === 'boundary');
  if (!boundary) return nodes;
  const children = nodes.filter(n => n.parentId === boundary.id);
  if (children.length === 0) return nodes;

  const minX = Math.min(...children.map(n => n.position.x));
  const minY = Math.min(...children.map(n => n.position.y));
  const maxX = Math.max(...children.map(n => n.position.x + NODE_W));
  const maxY = Math.max(...children.map(n => n.position.y + NODE_H));

  // If nodes drifted above/left of the boundary origin, shift them back in
  const shiftX = Math.max(0, BOUNDARY_PAD - minX);
  const shiftY = Math.max(0, BOUNDARY_PAD - minY);
  const newW = maxX + shiftX + BOUNDARY_PAD;
  const newH = maxY + shiftY + BOUNDARY_PAD;

  return nodes.map(n => {
    if (n.parentId === boundary.id && (shiftX > 0 || shiftY > 0)) {
      return {
        ...n,
        position: { x: n.position.x + shiftX, y: n.position.y + shiftY },
      };
    }
    if (n.type === 'boundary') {
      return { ...n, style: { ...n.style, width: newW, height: newH } };
    }
    return n;
  });
}

interface Props {
  diagram: C4Diagram;
  options?: C4RenderOptions;
}

/** React Flow canvas for a single C4Diagram. Uses ELK for layout when no saved positions exist. */
export function ReactFlowDiagram({ diagram, options }: Props) {
  // Avoid array destructuring — rspack's swc-loader would compile it to
  // `var _s = _sliced_to_array(…)` which collides with react-refresh's `_s`.
  const flowState = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const flow = flowState[0];
  const setFlow = flowState[1];

  const resetKey = options?.resetKey;

  useEffect(() => {
    setFlow(null);
    let cancelled = false;
    elkLayout(diagram).then(result => {
      if (!cancelled) {
        const hasSaved = Object.keys(diagram.nodePositions ?? {}).length > 0;
        setFlow(
          hasSaved ? applyPositions(result, diagram.nodePositions) : result,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagram, resetKey]);

  const editMode = options?.editMode ?? false;

  const handleNodesChange = (changes: NodeChange[]) => {
    if (!editMode) return;
    setFlow(prev => {
      if (!prev) return prev;
      const nodes = resizeBoundary(applyNodeChanges(changes, prev.nodes));
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) positions[n.id] = n.position;
      options?.onPositionsChange?.(positions);
      return { ...prev, nodes };
    });
  };

  const handleEdgesChange = (changes: EdgeChange[]) => {
    if (!editMode) return;
    setFlow(prev => {
      if (!prev) return prev;
      return { ...prev, edges: applyEdgeChanges(changes, prev.edges) };
    });
  };

  const handleReconnect = (oldEdge: Edge, newConnection: Connection) => {
    setFlow(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        edges: reconnectEdge(oldEdge, newConnection, prev.edges),
      };
    });
  };

  return (
    <div
      style={{ width: '100%', height: 'calc(100vh - 300px)', minHeight: 400 }}
    >
      {/* Strip React Flow's default white node background */}
      <style>{`.react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; box-shadow: none !important; }`}</style>
      {editMode && (
        <style>{`
          .react-flow__node:not([data-type="boundary"]) { cursor: grab; }
          .react-flow__node:not([data-type="boundary"]):active { cursor: grabbing; }
          .react-flow__handle {
            width: 10px !important; height: 10px !important;
            opacity: 0.75 !important;
            background: #fff !important;
            border: 2px solid #1976d2 !important;
            border-radius: 50% !important;
          }
          .react-flow__handle:hover { opacity: 1 !important; background: #1976d2 !important; }
          .react-flow__edgeupdater {
            cursor: crosshair !important;
            r: 8 !important;
            fill: #1976d2 !important;
            stroke: #fff !important;
            stroke-width: 2 !important;
            opacity: 0.9 !important;
          }
          .react-flow__edgeupdater:hover { opacity: 1 !important; r: 10 !important; }
        `}</style>
      )}
      <ReactFlow
        nodes={
          editMode
            ? (flow?.nodes ?? []).map(n =>
                n.type === 'boundary' ? n : { ...n, draggable: true },
              )
            : flow?.nodes ?? []
        }
        edges={
          editMode
            ? (flow?.edges ?? []).map(e => ({
                ...e,
                reconnectable: true,
                data: { ...(e.data as object), sections: undefined },
              }))
            : flow?.edges ?? []
        }
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={editMode}
        nodesConnectable={false}
        elementsSelectable={editMode}
        edgesReconnectable={editMode}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onReconnect={handleReconnect}
        onNodeClick={(_e, node) => {
          if (editMode) return;
          if (!options?.onNodeClick) return;
          if (node.type === 'boundary') return;
          const entityRef = (node.data as any).entityRef ?? node.id;
          options.onNodeClick(entityRef);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
