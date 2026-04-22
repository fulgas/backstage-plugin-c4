import { useTheme } from '@material-ui/core/styles';
import {
  RiArrowDownLine,
  RiArrowRightLine,
  RiCheckLine,
  RiCloseLine,
  RiDownloadLine,
  RiPencilLine,
  RiRefreshLine,
} from '@remixicon/react';
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
import { elkLayout, recomputeEdgeSections } from './layout/elkLayout';
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
      <RiDownloadLine size={16} />
    </ControlButton>
  );
}

/** Override node positions with saved values; sections are cleared so recomputeEdgeSections can rebuild them from the new positions. */
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

/** Expand all boundary nodes to contain their children (with padding). */
function resizeBoundary(nodes: Node[]): Node[] {
  const boundaries = nodes.filter(n => n.type === 'boundary');
  if (!boundaries.length) return nodes;

  let result = [...nodes];
  // Process innermost boundaries first so outer boundaries see correct child sizes
  const sorted = [...boundaries].sort((a, b) => {
    const aDepth = a.parentId ? 1 : 0;
    const bDepth = b.parentId ? 1 : 0;
    return bDepth - aDepth;
  });

  for (const boundary of sorted) {
    const children = result.filter(n => n.parentId === boundary.id);
    if (children.length === 0) continue;

    const minX = Math.min(...children.map(n => n.position.x));
    const minY = Math.min(...children.map(n => n.position.y));
    const maxX = Math.max(
      ...children.map(
        n => n.position.x + ((n.style?.width as number) ?? NODE_W),
      ),
    );
    const maxY = Math.max(
      ...children.map(
        n => n.position.y + ((n.style?.height as number) ?? NODE_H),
      ),
    );

    const shiftX = Math.max(0, BOUNDARY_PAD - minX);
    const shiftY = Math.max(0, BOUNDARY_PAD - minY);
    const newW = maxX + shiftX + BOUNDARY_PAD;
    const newH = maxY + shiftY + BOUNDARY_PAD;

    result = result.map(n => {
      if (n.parentId === boundary.id && (shiftX > 0 || shiftY > 0)) {
        return {
          ...n,
          position: { x: n.position.x + shiftX, y: n.position.y + shiftY },
        };
      }
      if (n.id === boundary.id) {
        return { ...n, style: { ...n.style, width: newW, height: newH } };
      }
      return n;
    });
  }

  return result;
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
    elkLayout(diagram, { direction }).then(result => {
      if (!cancelled) {
        const hasSaved = Object.keys(diagram.nodePositions ?? {}).length > 0;
        if (hasSaved) {
          const withPos = applyPositions(result, diagram.nodePositions);
          const withSections = recomputeEdgeSections(withPos);
          setFlow({
            ...withSections,
            nodes: resizeBoundary(withSections.nodes),
          });
        } else {
          setFlow(result);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagram, resetKey, direction]);

  const { palette } = useTheme();
  const colorMode = palette.type;

  const editMode = options?.editMode ?? false;

  // Seed pendingPositions as soon as edit mode activates so save is always
  // available — user shouldn't have to drag something first.
  useEffect(() => {
    if (editMode && flow) {
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of flow.nodes) positions[n.id] = n.position;
      options?.onPositionsChange?.(positions);
    }
    if (!editMode) {
      // Recompute edge sections from current node positions when exiting edit mode
      // so viewing mode reflects where nodes ended up after dragging.
      setFlow(prev => (prev ? recomputeEdgeSections(prev) : prev));
    }
    // Only re-run when editMode toggles, not on every flow change.
  }, [editMode]); // eslint-disable-line

  type CSSProps = { [k: string]: string | number | undefined };
  const activeBtn = (isActive: boolean, extra?: CSSProps): CSSProps => ({
    background: isActive ? 'var(--c4-color-active, #1976d2)' : undefined,
    color: isActive ? 'var(--c4-color-active-text, #ffffff)' : undefined,
    opacity: isActive ? 1 : 0.5,
    ...extra,
  });

  const handleNodesChange = (changes: NodeChange[]) => {
    if (!editMode) return;
    setFlow(prev => {
      if (!prev) return prev;
      const nodes = applyNodeChanges(changes, prev.nodes);
      const hasChange = changes.some(
        c => c.type === 'position' || c.type === 'dimensions',
      );
      if (hasChange) {
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

  // After drag ends, reassign handles based on the new node positions so edges
  // always connect to the closest available handle on each face.
  const handleNodeDragStop = useCallback(() => {
    setFlow(prev => (prev ? recomputeEdgeSections(prev) : prev));
  }, []);

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
      {/* Remove React Flow's default white node background */}
      <style>{`.react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; box-shadow: none !important; }`}</style>
      {editMode && (
        <style>{`
          .react-flow__node:not([data-type="boundary"]) { cursor: grab; }
          .react-flow__node:not([data-type="boundary"]):active { cursor: grabbing; }
          .react-flow__handle {
            width: 10px !important; height: 10px !important;
            opacity: 0.75 !important;
            background: var(--c4-color-active-text, #ffffff) !important;
            border: 2px solid var(--c4-color-active, #1976d2) !important;
            border-radius: 50% !important;
          }
          .react-flow__handle:hover { opacity: 1 !important; background: var(--c4-color-active, #1976d2) !important; }
          .react-flow__edgeupdater {
            cursor: crosshair !important;
            r: 8 !important;
            fill: var(--c4-color-active, #1976d2) !important;
            stroke: var(--c4-color-active-text, #ffffff) !important;
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
        colorMode={colorMode}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={editMode}
        nodesConnectable={false}
        elementsSelectable={editMode}
        edgesReconnectable={editMode}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onReconnect={handleReconnect}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={(_e, node) => {
          if (editMode) return;
          if (!options?.onNodeClick) return;
          const data = node.data as any;
          if (!data.navigable) return;
          options.onNodeClick(data.entityRef ?? node.id);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false}>
          <DownloadButton title={diagram.descriptor.title} />
          {editMode ? (
            <>
              <ControlButton
                title="Auto layout (ELK decides direction)"
                onClick={() =>
                  options?.onSettingsChange?.({ direction: 'auto' })
                }
                style={activeBtn(direction === 'auto', {
                  fontSize: 10,
                  fontWeight: 700,
                })}
              >
                A
              </ControlButton>
              <ControlButton
                title="Vertical layout (top-to-bottom)"
                onClick={() => options?.onSettingsChange?.({ direction: 'TB' })}
                style={activeBtn(direction === 'TB')}
              >
                <RiArrowDownLine size={16} />
              </ControlButton>
              <ControlButton
                title="Horizontal layout (left-to-right)"
                onClick={() => options?.onSettingsChange?.({ direction: 'LR' })}
                style={activeBtn(direction === 'LR')}
              >
                <RiArrowRightLine size={16} />
              </ControlButton>

              <ControlButton
                title="Reset Layout"
                onClick={options?.onResetLayout}
              >
                <RiRefreshLine size={16} />
              </ControlButton>
              <ControlButton title="Cancel" onClick={options?.onCancelEdit}>
                <RiCloseLine size={16} />
              </ControlButton>
              <ControlButton
                title="Save Layout"
                onClick={options?.canSave ? options?.onSaveLayout : undefined}
                style={{ opacity: options?.canSave ? 1 : 0.4 }}
              >
                <RiCheckLine size={16} />
              </ControlButton>
            </>
          ) : (
            <ControlButton
              title="Edit Layout"
              onClick={options?.onEnterEditMode}
            >
              <RiPencilLine size={16} />
            </ControlButton>
          )}
        </Controls>
      </ReactFlow>
    </div>
  );
}
