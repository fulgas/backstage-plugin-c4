import {
  applyEdgeChanges,
  applyNodeChanges,
  ControlButton,
  Controls,
  getNodesBounds,
  getViewportForBounds,
  ReactFlow,
  reconnectEdge,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

/** Download button rendered inside <Controls> — needs useReactFlow which requires being a child of <ReactFlow>. */
function DownloadButton({ title }: { title: string }) {
  const { getNodes } = useReactFlow();

  const handleDownload = useCallback(() => {
    const nodes = getNodes();
    if (!nodes.length) return;
    const bounds = getNodesBounds(nodes);
    const W = Math.max(bounds.width + 80, 400);
    const H = Math.max(bounds.height + 80, 300);
    const viewport = getViewportForBounds(bounds, W, H, 0.5, 2, 40);
    const el = document.querySelector(
      '.react-flow__viewport',
    ) as HTMLElement | null;
    if (!el) return;
    import('html-to-image').then(({ toPng }) =>
      toPng(el, {
        backgroundColor: '#ffffff',
        width: W,
        height: H,
        style: {
          width: `${W}px`,
          height: `${H}px`,
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
        },
      }).then(dataUrl => {
        const a = document.createElement('a');
        a.download = `${title || 'diagram'}.png`;
        a.href = dataUrl;
        a.click();
      }),
    );
  }, [getNodes, title]);

  return (
    <ControlButton title="Download PNG" onClick={handleDownload}>
      {/* Download icon */}
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5" />
        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708z" />
      </svg>
    </ControlButton>
  );
}

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

  const savedDirection = diagram.descriptor.displaySettings?.direction;
  const direction: 'TB' | 'LR' | 'auto' =
    savedDirection === 'LR' ? 'LR' : savedDirection === 'auto' ? 'auto' : 'TB';

  useEffect(() => {
    setFlow(null);
    let cancelled = false;
    elkLayout(diagram, {
      direction: direction === 'auto' ? 'auto' : direction,
    }).then(result => {
      if (!cancelled) {
        const hasSaved = Object.keys(diagram.nodePositions ?? {}).length > 0;
        if (hasSaved) {
          const withPos = applyPositions(result, diagram.nodePositions);
          setFlow({ ...withPos, nodes: resizeBoundary(withPos.nodes) });
        } else {
          setFlow(result);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagram, resetKey, direction]);

  const editMode = options?.editMode ?? false;

  const handleNodesChange = (changes: NodeChange[]) => {
    if (!editMode) return;
    setFlow(prev => {
      if (!prev) return prev;
      const hasPositionChange = changes.some(c => c.type === 'position');
      const nodes = applyNodeChanges(changes, prev.nodes);
      if (hasPositionChange) {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of nodes) positions[n.id] = n.position;
        options?.onPositionsChange?.(positions);
      }
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

  const displayNodes = useMemo(
    () =>
      editMode
        ? (flow?.nodes ?? []).map(n =>
            n.type === 'boundary'
              ? { ...n, draggable: true, data: { ...n.data, editMode: true } }
              : { ...n, draggable: true },
          )
        : flow?.nodes ?? [],
    [flow?.nodes, editMode],
  );

  const displayEdges = useMemo(
    () =>
      editMode
        ? (flow?.edges ?? []).map(e => ({
            ...e,
            reconnectable: true,
            data: { ...(e.data as object), sections: undefined },
          }))
        : flow?.edges ?? [],
    [flow?.edges, editMode],
  );

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
        nodes={displayNodes}
        edges={displayEdges}
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
        <Controls showInteractive={false}>
          <DownloadButton title={diagram.descriptor.title} />
          {!editMode && (
            <>
              <ControlButton
                title="Auto layout (ELK decides direction)"
                onClick={() =>
                  options?.onSettingsChange?.({ direction: 'auto' })
                }
                style={{
                  opacity: direction === 'auto' ? 1 : 0.45,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                A
              </ControlButton>
              <ControlButton
                title="Vertical layout (top-to-bottom)"
                onClick={() => options?.onSettingsChange?.({ direction: 'TB' })}
                style={{ opacity: direction === 'TB' ? 1 : 0.45 }}
              >
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1" />
                </svg>
              </ControlButton>
              <ControlButton
                title="Horizontal layout (left-to-right)"
                onClick={() => options?.onSettingsChange?.({ direction: 'LR' })}
                style={{ opacity: direction === 'LR' ? 1 : 0.45 }}
              >
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M1 8a.5.5 0 0 1 .5-.5h11.793l-3.147-3.146a.5.5 0 0 1 .708-.708l4 4a.5.5 0 0 1 0 .708l-4 4a.5.5 0 0 1-.708-.708L13.293 8.5H1.5A.5.5 0 0 1 1 8" />
                </svg>
              </ControlButton>
            </>
          )}
          {editMode ? (
            <>
              <ControlButton
                title="Reset Layout"
                onClick={options?.onResetLayout}
              >
                {/* Reset / refresh icon */}
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z" />
                  <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466" />
                </svg>
              </ControlButton>
              <ControlButton title="Cancel" onClick={options?.onCancelEdit}>
                {/* X icon */}
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708" />
                </svg>
              </ControlButton>
              <ControlButton
                title="Save Layout"
                onClick={options?.canSave ? options?.onSaveLayout : undefined}
                style={{ opacity: options?.canSave ? 1 : 0.4 }}
              >
                {/* Checkmark icon */}
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0" />
                </svg>
              </ControlButton>
            </>
          ) : (
            <ControlButton
              title="Edit Layout"
              onClick={options?.onEnterEditMode}
            >
              {/* Pencil icon */}
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325" />
              </svg>
            </ControlButton>
          )}
        </Controls>
      </ReactFlow>
    </div>
  );
}
