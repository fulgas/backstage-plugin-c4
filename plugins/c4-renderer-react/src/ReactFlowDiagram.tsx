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
  useReactFlow,
  useUpdateNodeInternals,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import { BOUNDARY_PAD, NODE_H, NODE_W } from './c4Style';
import { ElkEdge } from './edges/ElkEdge';
import { elkLayout, recomputeEdgeSections } from './layout/elkLayout';
import {
  handleIdToPoint,
  orthogonalPath,
  resolveAbsolutePositions,
  type HandleFace,
} from './layout/geometry';
import { portHandleId } from './layout/pipeline/buildFlowGraph';
import type { PortHandle } from './layout/pipeline/buildFlowGraph';
import type { LayoutResult } from './layout/types';
import {
  ActorNode,
  BoundaryNode,
  ExternalNode,
  InternalNode,
} from './nodes/C4NodeTypes';

/** Flow-coord position of the active ghost handle face. Updated synchronously in onDocMouseMove. */
const ghostFacePosRef: { current: { x: number; y: number } | null } = {
  current: null,
};

/** Current React Flow viewport transform — kept in sync by FlowBridge via useViewport(). */
const viewportRef: { current: { x: number; y: number; zoom: number } } = {
  current: { x: 0, y: 0, zoom: 1 },
};

/** Distance from point to nearest point on rect boundary. 0 = inside rect. */
function distToRect(
  pt: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number },
): number {
  const cx = Math.max(rect.x, Math.min(pt.x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(pt.y, rect.y + rect.h));
  return Math.hypot(pt.x - cx, pt.y - cy);
}

/** Project a flow-coordinate point onto the nearest face of a rect. */
function projectToFace(
  pt: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number },
  type: 'source' | 'target',
): PortHandle {
  const { x, y, w, h } = rect;
  const clamp = (v: number) => Math.max(0.05, Math.min(0.95, v));
  const dTop = Math.abs(pt.y - y);
  const dBottom = Math.abs(pt.y - (y + h));
  const dLeft = Math.abs(pt.x - x);
  const dRight = Math.abs(pt.x - (x + w));
  const minD = Math.min(dTop, dBottom, dLeft, dRight);
  let face: PortHandle['face'];
  let fraction: number;
  if (minD === dTop) {
    face = 'top';
    fraction = clamp((pt.x - x) / w);
  } else if (minD === dBottom) {
    face = 'bottom';
    fraction = clamp((pt.x - x) / w);
  } else if (minD === dLeft) {
    face = 'left';
    fraction = clamp((pt.y - y) / h);
  } else {
    face = 'right';
    fraction = clamp((pt.y - y) / h);
  }
  return {
    id: portHandleId(type, face, fraction),
    type,
    face,
    fraction,
    ghost: true,
  };
}

/** Runs inside the ReactFlow provider to expose internal APIs via refs. */
function FlowBridge({
  screenToFlowRef,
  updateNodeInternalsRef,
}: {
  screenToFlowRef: React.MutableRefObject<
    ((p: { x: number; y: number }) => { x: number; y: number }) | null
  >;
  updateNodeInternalsRef: React.MutableRefObject<
    ((ids: string | string[]) => void) | null
  >;
}) {
  const { screenToFlowPosition } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const viewport = useViewport();
  screenToFlowRef.current = screenToFlowPosition;
  updateNodeInternalsRef.current = updateNodeInternals;
  viewportRef.current = viewport;
  return null;
}

/**
 * Remove the handle that an edge used to connect through when the connected node
 * itself changes after a reconnect. Without this, the stale ELK port handle stays
 * in the old node's portHandles and shows as a white dot in edit mode.
 */
function pruneStaleHandles(
  nodes: Node[],
  oldEdge: Edge,
  newConn: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  },
): Node[] {
  let result = nodes;

  function stripHandle(nodeId: string, handleId: string | null | undefined) {
    if (!handleId) return;
    result = result.map(n => {
      if (n.id !== nodeId) return n;
      const ports = n.data?.portHandles as PortHandle[] | undefined;
      if (!ports?.length) return n;
      const cleaned = ports.filter(h => h.id !== handleId);
      return cleaned.length !== ports.length
        ? { ...n, data: { ...n.data, portHandles: cleaned } }
        : n;
    });
  }

  if (newConn.target !== oldEdge.target)
    stripHandle(oldEdge.target, oldEdge.targetHandle);
  if (newConn.source !== oldEdge.source)
    stripHandle(oldEdge.source, oldEdge.sourceHandle);

  return result;
}

function stripGhostHandles(nodes: Node[]): Node[] {
  return nodes.map(n => {
    const ports = n.data?.portHandles as PortHandle[] | undefined;
    if (!ports?.some(h => h.ghost)) return n;
    return {
      ...n,
      data: { ...n.data, portHandles: ports.filter(h => !h.ghost) },
    };
  });
}

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

  // Keep flowRef in sync so document event listeners can read current state without stale closures.
  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  // After flow is set (ELK layout complete), force RF to measure all node handle bounds.
  // ResizeObserver fires asynchronously; before it does, edge updater circles may appear
  // at stale positions. Calling updateNodeInternals for all nodes immediately after render
  // ensures handle positions are correct on first paint.
  useEffect(() => {
    if (!flow?.nodes.length) return;
    const ids = flow.nodes.map(n => n.id);
    requestAnimationFrame(() => {
      updateNodeInternalsRef.current?.(ids);
    });
  }, [flow?.nodes]); // eslint-disable-line

  const { palette } = useTheme();
  const colorMode = palette.type;

  const editMode = options?.editMode ?? false;

  const [hasDragged, setHasDragged] = useState(false);
  // Ref mirrors hasDragged so the editMode useEffect can read it without a stale closure.
  const hasDraggedRef = useRef(false);
  // Drives .c4-reconnecting CSS class which hides all static handles during reconnect drag.
  const [isReconnecting, setIsReconnecting] = useState(false);

  // handleType = type of the FIXED end (opposite handle) per React Flow's onReconnectStart convention.
  const reconnectingRef = useRef<{
    fixedNodeId: string;
    ghostType: 'source' | 'target';
  } | null>(null);
  const reconnectSucceededRef = useRef(false);
  // Tracks the latest ghost handle synchronously — updated in the mousemove handler BEFORE
  // setFlow, so handleReconnectEnd always sees the correct value even in concurrent mode
  // where flowRef (updated via useEffect) may lag by one render cycle.
  const ghostHandleRef = useRef<{ nodeId: string; handle: PortHandle } | null>(
    null,
  );
  const screenToFlowRef = useRef<
    ((p: { x: number; y: number }) => { x: number; y: number }) | null
  >(null);
  const updateNodeInternalsRef = useRef<
    ((ids: string | string[]) => void) | null
  >(null);
  // Mirror of flow state for use inside document event listeners (avoids stale closure).
  const flowRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const lastMoveTimeRef = useRef(0);
  // SVG overlay path — React state so clearing is atomic with isReconnecting=false.
  const [overlayLinePath, setOverlayLinePath] = useState('');
  // Fixed endpoint in flow coords for the overlay line; face of the fixed handle.
  const reconnectFromFlowRef = useRef<{ x: number; y: number } | null>(null);
  const reconnectFromFaceRef = useRef<HandleFace>('right');

  // Seed pendingPositions as soon as edit mode activates so save is always
  // available — user shouldn't have to drag something first.
  useEffect(() => {
    if (editMode) {
      setHasDragged(false);
      hasDraggedRef.current = false;
      reconnectingRef.current = null;
      reconnectSucceededRef.current = false;
      if (flow) {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of flow.nodes) positions[n.id] = n.position;
        options?.onPositionsChange?.(positions);
      }
      // Re-register all handles now that nodesConnectable=true (editMode). Handles are
      // registered with their full bounds so getEdgePosition works during reconnect drag.
      requestAnimationFrame(() => {
        if (flow?.nodes.length) {
          updateNodeInternalsRef.current?.(flow.nodes.map(n => n.id));
        }
      });
    }
    if (!editMode) {
      reconnectingRef.current = null;
      reconnectSucceededRef.current = false;
      setFlow(prev => {
        if (!prev) return prev;
        const hasGhosts = prev.nodes.some(n =>
          (n.data?.portHandles as PortHandle[] | undefined)?.some(h => h.ghost),
        );
        if (!hasGhosts && !hasDraggedRef.current) return prev;
        const base = hasGhosts
          ? { ...prev, nodes: stripGhostHandles(prev.nodes) }
          : prev;
        return hasDraggedRef.current ? recomputeEdgeSections(base) : base;
      });
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
    const hasPositionChange = changes.some(
      c => c.type === 'position' || c.type === 'dimensions',
    );
    // Only count active drags (dragging: true) — React Flow also fires position
    // changes on internal sync events when entering edit mode, which must NOT
    // trigger hasDragged or the faceConnectEdit test would see moved endpoints.
    const isUserDrag = changes.some(
      c => c.type === 'position' && (c as { dragging?: boolean }).dragging,
    );
    if (isUserDrag && !hasDraggedRef.current) {
      hasDraggedRef.current = true;
      setHasDragged(true);
    }
    setFlow(prev => {
      if (!prev) return prev;
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
    if (reconnectingRef.current) return;
    setFlow(prev => {
      if (!prev) return prev;
      return { ...prev, edges: applyEdgeChanges(changes, prev.edges) };
    });
  };

  const handleReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      reconnectSucceededRef.current = true;
      hasDraggedRef.current = true;
      setHasDragged(true);
      setFlow(prev => {
        if (!prev) return prev;
        // Update the edge in-place (no ID change) — React Flow re-uses the existing
        // component, avoiding an unmount/remount that can silently drop the edge in
        // controlled-flow batched update cycles.
        const edges = prev.edges.map(e =>
          e.id !== oldEdge.id
            ? e
            : {
                ...e,
                source: newConnection.source,
                target: newConnection.target,
                sourceHandle: newConnection.sourceHandle,
                targetHandle: newConnection.targetHandle,
                data: { ...(e.data as object), sections: undefined },
              },
        );
        const nodes = pruneStaleHandles(prev.nodes, oldEdge, newConnection);
        return nodes !== prev.nodes
          ? { ...prev, edges, nodes }
          : { ...prev, edges };
      });
    },
    [],
  );

  // After drag ends mark hasDragged so displayEdges clears stale ELK sections
  // and ElkEdge re-routes from the stored handle IDs. recomputeEdgeSections
  // runs on exit from edit mode to rebuild clean sections for view mode.
  const handleNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    hasDraggedRef.current = true;
    setHasDragged(true);
    // After a node drag, RF's nodeLookup.handleBounds is stale (ResizeObserver
    // doesn't fire — node dimensions unchanged). Force an internals scan so
    // edge updater circles appear at the correct (post-drag) handle positions.
    requestAnimationFrame(() => {
      updateNodeInternalsRef.current?.(node.id);
    });
  }, []);

  const handleReconnectStart = useCallback(
    (_e: React.MouseEvent, edge: Edge, handleType: 'source' | 'target') => {
      // handleType = type of the FIXED end (opposite handle) per React Flow convention.
      // 'source' fixed → target is moving → ghost needs 'target' handles on candidate nodes.
      // 'target' fixed → source is moving → ghost needs 'source' handles.
      setIsReconnecting(true);
      reconnectingRef.current = {
        fixedNodeId: handleType === 'source' ? edge.source : edge.target,
        ghostType: handleType === 'source' ? 'target' : 'source',
      };
      reconnectSucceededRef.current = false;
      ghostFacePosRef.current = null;
      // Capture edge path and fixed endpoint for the SVG overlay during drag.
      // handleType='source' → source is fixed → sections[0].startPoint; else endPoint.
      type ElkSec = {
        startPoint: { x: number; y: number };
        bendPoints?: { x: number; y: number }[];
        endPoint: { x: number; y: number };
      };
      const sections = edge.data?.sections as ElkSec[] | undefined;
      const fixedHandleId =
        handleType === 'source' ? edge.sourceHandle : edge.targetHandle;
      reconnectFromFaceRef.current =
        (fixedHandleId?.split('-')?.[1] as HandleFace | undefined) ?? 'right';
      if (sections?.[0]) {
        reconnectFromFlowRef.current =
          handleType === 'source'
            ? sections[0].startPoint
            : sections[0].endPoint;
      } else {
        // sections cleared (hasDragged=true): derive from live node positions.
        const absPos = flowRef.current
          ? resolveAbsolutePositions(flowRef.current.nodes)
          : null;
        const fixedNodeId = handleType === 'source' ? edge.source : edge.target;
        const fixedPos = absPos?.get(fixedNodeId);
        if (fixedPos && fixedHandleId) {
          const rect = { x: fixedPos.x, y: fixedPos.y, w: NODE_W, h: NODE_H };
          reconnectFromFlowRef.current = handleIdToPoint(fixedHandleId, rect);
        } else {
          reconnectFromFlowRef.current = null;
        }
      }
    },
    [],
  );

  const handleReconnectEnd = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      edge: Edge,
      _handleType: 'source' | 'target',
    ) => {
      setIsReconnecting(false);
      setOverlayLinePath('');
      reconnectFromFlowRef.current = null;
      const succeeded = reconnectSucceededRef.current;
      const reconnecting = reconnectingRef.current;
      reconnectSucceededRef.current = false;
      reconnectingRef.current = null;

      // Read ghost state from the synchronously maintained ref — immune to React's
      // async rendering cycle. ghostHandleRef is set before every setFlow in the
      // mousemove handler and cleared here before setFlow runs.
      const ghostInfo = ghostHandleRef.current;
      ghostHandleRef.current = null;
      ghostFacePosRef.current = null;

      const hadGhost = !!ghostInfo;
      // Don't manual-reconnect when the ghost landed on the same node as the
      // current endpoint — drag looped back, no topology change intended.
      const ghostOnSameNode =
        ghostInfo &&
        reconnecting &&
        ((reconnecting.ghostType === 'target' &&
          ghostInfo.nodeId === edge.target) ||
          (reconnecting.ghostType === 'source' &&
            ghostInfo.nodeId === edge.source));
      const willManualReconnect =
        !succeeded && !!reconnecting && !!ghostInfo && !ghostOnSameNode;

      setFlow(prev => {
        if (!prev) return prev;

        const ghostNodeId = ghostInfo?.nodeId ?? null;
        const ghostHandle = ghostInfo?.handle ?? null;

        // Step 1: Strip ALL ghost handles from ALL nodes unconditionally.
        // The cursor may have passed through several nodes during the drag,
        // leaving stale ghost handles that async setFlow calls haven't cleared yet.
        let nodes = stripGhostHandles(prev.nodes);

        // Step 2: Add a promoted (non-ghost) handle to the reconnect target node
        // so the edge's handle ID stays registered in React Flow.
        if ((succeeded || willManualReconnect) && ghostNodeId && ghostHandle) {
          // When the native reconnect succeeded, prev.edges already reflects the
          // updated edge from handleReconnect. Use the actual new endpoint node so
          // we promote to the correct node — ghostNodeId may lag due to React 18
          // batching onDocMouseMove (native listener) after the React event batch.
          const promotionNodeId = (() => {
            if (!succeeded) return ghostNodeId;
            const updatedEdge = prev.edges.find(e => e.id === edge.id);
            if (!updatedEdge) return ghostNodeId;
            return reconnecting?.ghostType === 'target'
              ? updatedEdge.target
              : updatedEdge.source;
          })();
          nodes = nodes.map(n => {
            if (n.id !== promotionNodeId) return n;
            const ports =
              (n.data?.portHandles as PortHandle[] | undefined) ?? [];
            const promoted: PortHandle = { ...ghostHandle, ghost: false };
            if (ports.some(h => h.id === promoted.id)) return n; // already there
            return {
              ...n,
              data: { ...n.data, portHandles: [...ports, promoted] },
            };
          });
        }

        const base = { ...prev, nodes };

        // Step 3: Manual reconnect — update the edge and prune old endpoint handle.
        if (willManualReconnect && ghostHandle) {
          const { ghostType } = reconnecting!;
          const newConn: Connection = {
            source: ghostType === 'source' ? ghostNodeId! : edge.source,
            target: ghostType === 'target' ? ghostNodeId! : edge.target,
            sourceHandle:
              ghostType === 'source'
                ? ghostHandle.id
                : edge.sourceHandle ?? null,
            targetHandle:
              ghostType === 'target'
                ? ghostHandle.id
                : edge.targetHandle ?? null,
          };
          const edges = base.edges.map(e =>
            e.id !== edge.id
              ? e
              : {
                  ...e,
                  source: newConn.source,
                  target: newConn.target,
                  sourceHandle: newConn.sourceHandle,
                  targetHandle: newConn.targetHandle,
                  data: { ...(e.data as object), sections: undefined },
                },
          );
          const prunedNodes = pruneStaleHandles(base.nodes, edge, newConn);
          return { ...base, nodes: prunedNodes, edges };
        }

        return base;
      });

      if ((willManualReconnect || succeeded) && ghostInfo) {
        // New Handle component mounted for the promoted ghost handle. RF's nodeLookup.handleBounds
        // is NOT updated automatically (ResizeObserver doesn't fire when node dimensions are
        // unchanged). Force an internals scan so EdgeWrapper can resolve the handle position.
        //
        // internalsNodeId starts as ghostInfo.nodeId (correct for willManualReconnect).
        // For succeeded=true, promotionNodeId inside setFlow uses updatedEdge.target/source
        // which may differ from ghostInfo.nodeId when React 18 batching causes ghostHandleRef
        // to lag. updateNodeInternalsNode captures the real promotion target so the rAF
        // targets the node that actually received the handle.
        const updateNodeInternalsNode = { current: ghostInfo.nodeId };
        requestAnimationFrame(() => {
          updateNodeInternalsRef.current?.(updateNodeInternalsNode.current);
        });

        if (succeeded) {
          // For native reconnect, the promotion target is determined by updatedEdge, not
          // ghostInfo. Queue a separate setFlow (reads the already-updated edges from the
          // preceding setFlow) to capture the actual target node ID.
          setFlow(prev => {
            if (!prev) return prev;
            const updatedEdge = prev.edges.find(e => e.id === edge.id);
            if (updatedEdge) {
              updateNodeInternalsNode.current =
                reconnecting?.ghostType === 'target'
                  ? updatedEdge.target
                  : updatedEdge.source;
            }
            return prev;
          });
        }
      }

      // Deferred ghost cleanup: onDocMouseMove is a native DOM listener batched separately
      // from React event handlers. React 18 may process the handleReconnectEnd setFlow
      // (React batch) before the pending onDocMouseMove setFlow (native batch) runs,
      // leaving an orphaned ghost handle on a node. A nested requestAnimationFrame
      // fires after React has flushed all pending batches (including the native batch),
      // guaranteeing a clean ghost-free state.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlow(prev => {
            if (!prev) return prev;
            const hasGhosts = prev.nodes.some(n =>
              (n.data?.portHandles as PortHandle[] | undefined)?.some(
                h => h.ghost,
              ),
            );
            if (!hasGhosts) return prev;
            return { ...prev, nodes: stripGhostHandles(prev.nodes) };
          });
        });
      });

      if (succeeded || hadGhost) {
        hasDraggedRef.current = true;
        setHasDragged(true);
      }
    },
    [],
  );

  // Inject ghost port handles as the cursor moves near node faces during reconnect drag.
  useEffect(() => {
    if (!editMode) return;
    const GHOST_THRESH = 60; // px — proximity radius for ghost appearance (flow coords)

    const onDocMouseMove = (e: MouseEvent) => {
      if (!reconnectingRef.current) return;
      const now = performance.now();
      if (now - lastMoveTimeRef.current < 33) return; // ~30 fps cap
      lastMoveTimeRef.current = now;

      const screenToFlow = screenToFlowRef.current;
      const currentFlow = flowRef.current;
      if (!screenToFlow || !currentFlow) return;

      const flowPos = screenToFlow({ x: e.clientX, y: e.clientY });
      const { fixedNodeId, ghostType } = reconnectingRef.current;
      const absPos = resolveAbsolutePositions(currentFlow.nodes);

      let bestNodeId: string | null = null;
      let bestHandle: PortHandle | null = null;
      let bestDist = GHOST_THRESH;

      for (const node of currentFlow.nodes) {
        if (node.id === fixedNodeId) continue;
        if (node.type === 'boundary') continue;
        const pos = absPos.get(node.id);
        if (!pos) continue;
        const rect = { x: pos.x, y: pos.y, w: NODE_W, h: NODE_H };
        const dist = distToRect(flowPos, rect);
        if (dist < bestDist) {
          bestDist = dist;
          bestNodeId = node.id;
          bestHandle = projectToFace(flowPos, rect, ghostType);
        }
      }

      // Update synchronously BEFORE setFlow — handleReconnectEnd reads this ref
      // directly, bypassing the async React state update cycle entirely.
      ghostHandleRef.current =
        bestNodeId && bestHandle
          ? { nodeId: bestNodeId, handle: bestHandle }
          : null;

      // Compute the ghost face position in flow coords so CustomConnectionLine
      // can snap the dashed reconnect line to the ghost port face.
      if (bestNodeId && bestHandle) {
        const bestPos = absPos.get(bestNodeId);
        if (bestPos) {
          const bx = bestPos.x;
          const by = bestPos.y;
          switch (bestHandle.face) {
            case 'top':
              ghostFacePosRef.current = {
                x: bx + NODE_W * bestHandle.fraction,
                y: by,
              };
              break;
            case 'bottom':
              ghostFacePosRef.current = {
                x: bx + NODE_W * bestHandle.fraction,
                y: by + NODE_H,
              };
              break;
            case 'left':
              ghostFacePosRef.current = {
                x: bx,
                y: by + NODE_H * bestHandle.fraction,
              };
              break;
            default:
              ghostFacePosRef.current = {
                x: bx + NODE_W,
                y: by + NODE_H * bestHandle.fraction,
              };
          }
        }
      } else {
        ghostFacePosRef.current = null;
      }

      // Compute overlay line path; batched with setFlow below (React 18 native-listener batching).
      const { x: tx, y: ty, zoom } = viewportRef.current;
      const fromFlow = reconnectFromFlowRef.current;
      let newOverlayD = '';
      if (fromFlow) {
        const fromSvg = {
          x: fromFlow.x * zoom + tx,
          y: fromFlow.y * zoom + ty,
        };
        const ghostFlow = ghostFacePosRef.current;
        const toSvg = ghostFlow
          ? { x: ghostFlow.x * zoom + tx, y: ghostFlow.y * zoom + ty }
          : { x: flowPos.x * zoom + tx, y: flowPos.y * zoom + ty };
        const srcFace = reconnectFromFaceRef.current;
        const horiz = srcFace === 'left' || srcFace === 'right';
        const dx = toSvg.x - fromSvg.x;
        const dy = toSvg.y - fromSvg.y;
        const tgtFace: HandleFace =
          Math.abs(dx) > Math.abs(dy)
            ? dx > 0
              ? 'left'
              : 'right'
            : dy > 0
            ? 'top'
            : 'bottom';
        newOverlayD = orthogonalPath(
          fromSvg.x,
          fromSvg.y,
          toSvg.x,
          toSvg.y,
          horiz,
          srcFace,
          tgtFace,
        ).path;
      }
      setOverlayLinePath(newOverlayD);

      setFlow(prev => {
        if (!prev) return prev;

        // Avoid spurious updates when ghost hasn't changed.
        const prevGhostNode = prev.nodes.find(n =>
          (n.data?.portHandles as PortHandle[] | undefined)?.some(h => h.ghost),
        );
        if (!bestNodeId && !prevGhostNode) return prev;
        if (bestNodeId === prevGhostNode?.id) {
          const prevGhost = (
            prevGhostNode!.data.portHandles as PortHandle[]
          ).find(h => h.ghost);
          if (prevGhost?.id === bestHandle?.id) return prev;
        }

        let changed = false;
        const nodes = prev.nodes.map(n => {
          const ports = (n.data?.portHandles as PortHandle[] | undefined) ?? [];
          const realPorts = ports.filter(h => !h.ghost);
          if (n.id === bestNodeId && bestHandle) {
            changed = true;
            return {
              ...n,
              data: { ...n.data, portHandles: [...realPorts, bestHandle] },
            };
          }
          if (ports.some(h => h.ghost)) {
            changed = true;
            return { ...n, data: { ...n.data, portHandles: realPorts } };
          }
          return n;
        });
        return changed ? { ...prev, nodes } : prev;
      });
    };

    document.addEventListener('mousemove', onDocMouseMove);
    return () => document.removeEventListener('mousemove', onDocMouseMove);
  }, [editMode]); // eslint-disable-line

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
            // Clear ELK sections only after a drag so ElkEdge falls back to
            // HandleRouter (dynamic). Before any drag, keep ELK sections so
            // edit mode and view mode look identical.
            data: hasDragged
              ? { ...(e.data as object), sections: undefined }
              : e.data,
          }))
        : flow?.edges ?? [],
    [flow?.edges, editMode, hasDragged],
  );

  return (
    <div
      style={{
        width: '100%',
        height: 'calc(100vh - 300px)',
        minHeight: 400,
        position: 'relative',
      }}
      className={isReconnecting ? 'c4-reconnecting' : undefined}
    >
      {/* Remove React Flow's default white node background and visible handles */}
      <style>{`
        .react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; box-shadow: none !important; }
        .react-flow__handle { opacity: 0 !important; pointer-events: none !important; }
      `}</style>
      {editMode && (
        <style>{`
          .react-flow__node:not([data-type="boundary"]) { cursor: grab; }
          .react-flow__node:not([data-type="boundary"]):active { cursor: grabbing; }
          .react-flow__edgeupdater {
            cursor: crosshair !important;
            r: 8 !important;
            fill: var(--c4-color-active, #1976d2) !important;
            stroke: var(--c4-color-active-text, #ffffff) !important;
            stroke-width: 2 !important;
            opacity: 0.9 !important;
          }
          .react-flow__edgeupdater:hover { opacity: 1 !important; r: 10 !important; }
          @keyframes c4GhostPulse {
            from { box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.3), 0 0 4px rgba(25, 118, 210, 0.4); }
            to   { box-shadow: 0 0 0 6px rgba(25, 118, 210, 0.0), 0 0 10px rgba(25, 118, 210, 0.6); }
          }
          .react-flow__handle.c4-ghost-port {
            width: 14px !important;
            height: 14px !important;
            background: var(--c4-color-active, #1976d2) !important;
            border: 2px solid #ffffff !important;
            border-radius: 50% !important;
            opacity: 1 !important;
            pointer-events: auto !important;
            animation: c4GhostPulse 0.7s ease-in-out infinite alternate !important;
            z-index: 10 !important;
          }
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
        reconnectRadius={1}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onReconnect={handleReconnect}
        onReconnectStart={handleReconnectStart}
        onReconnectEnd={handleReconnectEnd}
        connectionLineComponent={undefined}
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
        <FlowBridge
          screenToFlowRef={screenToFlowRef}
          updateNodeInternalsRef={updateNodeInternalsRef}
        />
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
      {isReconnecting && (
        <svg
          className="c4-reconnect-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
            zIndex: 10,
          }}
        >
          <path
            d={overlayLinePath}
            fill="none"
            strokeWidth={2}
            stroke="var(--c4-color-active, #1976d2)"
            strokeDasharray="6 3"
          />
        </svg>
      )}
    </div>
  );
}
