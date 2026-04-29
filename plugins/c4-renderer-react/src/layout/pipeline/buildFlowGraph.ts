import { c4TypeLabel, type C4Actor, type C4Node } from '@fulgas/plugin-c4-node';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { ElkNode } from 'elkjs';
import {
  COLOR_RELATIONSHIP,
  NODE_H,
  NODE_W,
  RELATIONSHIP_MARKER_SIZE,
  RELATIONSHIP_STROKE_WIDTH,
} from '../../c4Style';
import type { Rect } from '../geometry';
import { HandleRouter, HandleUsageTracker } from '../routing/HandleRouter';
import type { ElkSection } from './runElk';
import type { Boundary, ClassifiedState } from './types';

// ── Dynamic port handles ──────────────────────────────────────────────────────

/** A handle positioned at the exact ELK port location on a node face. */
export interface PortHandle {
  id: string;
  type: 'source' | 'target';
  /** Which face the handle sits on. */
  face: 'top' | 'bottom' | 'left' | 'right';
  /** 0–1 fraction along the face (0 = left/top edge, 1 = right/bottom edge). */
  fraction: number;
  /** Temporary ghost port injected during edge reconnect drag; cleared on drop. */
  ghost?: boolean;
}

const PORT_TOL = 18; // px tolerance for face detection

/** Canonical handle ID from type, face, and fraction. */
export function portHandleId(
  type: 'source' | 'target',
  face: PortHandle['face'],
  fraction: number,
): string {
  return `${type[0]}-${face}-${fraction.toFixed(3)}`;
}

function elkPointToPortHandle(
  pt: { x: number; y: number },
  rect: Rect,
  type: 'source' | 'target',
): PortHandle | null {
  const { x, y, w, h } = rect;
  const inX = pt.x >= x - PORT_TOL && pt.x <= x + w + PORT_TOL;
  const inY = pt.y >= y - PORT_TOL && pt.y <= y + h + PORT_TOL;
  const clamp = (v: number) => Math.max(0.01, Math.min(0.99, v));

  if (Math.abs(pt.y - y) < PORT_TOL && inX) {
    const frac = clamp((pt.x - x) / w);
    return {
      id: portHandleId(type, 'top', frac),
      type,
      face: 'top',
      fraction: frac,
    };
  }
  if (Math.abs(pt.y - (y + h)) < PORT_TOL && inX) {
    const frac = clamp((pt.x - x) / w);
    return {
      id: portHandleId(type, 'bottom', frac),
      type,
      face: 'bottom',
      fraction: frac,
    };
  }
  if (Math.abs(pt.x - x) < PORT_TOL && inY) {
    const frac = clamp((pt.y - y) / h);
    return {
      id: portHandleId(type, 'left', frac),
      type,
      face: 'left',
      fraction: frac,
    };
  }
  if (Math.abs(pt.x - (x + w)) < PORT_TOL && inY) {
    const frac = clamp((pt.y - y) / h);
    return {
      id: portHandleId(type, 'right', frac),
      type,
      face: 'right',
      fraction: frac,
    };
  }
  return null;
}

/**
 * Convert a static handle id (e.g. 's-right-c') to a PortHandle using the known
 * slot fractions (l/t=0.25, c=0.5, r/b=0.75). Used for HandleRouter-selected handles.
 */
function staticHandleToPortHandle(
  handleId: string,
  type: 'source' | 'target',
): PortHandle {
  const parts = handleId.split('-');
  const face = parts[1] as PortHandle['face'];
  const slot = parts[2] ?? 'c';
  const FRAC: Record<string, number> = {
    l: 0.25,
    t: 0.25,
    c: 0.5,
    r: 0.75,
    b: 0.75,
  };
  const fraction = FRAC[slot] ?? 0.5;
  return { id: handleId, type, face, fraction };
}

function depthLabel(depth: number): string {
  if (depth === 0) return 'Domain';
  if (depth === 1) return 'System';
  if (depth === 2) return 'Container';
  return 'Component';
}

interface NodeData {
  label: string;
  description?: string;
  technology?: string;
  subType?: string;
  c4Type?: string;
  navigable?: boolean;
  entityRef?: string;
  [key: string]: unknown;
}

function nodeData(n: C4Node | C4Actor): NodeData {
  if ('depth' in n) {
    return {
      label: n.name,
      description: n.description,
      technology: (n as C4Node).technology,
      subType: (n as C4Node).subType,
      c4Type: c4TypeLabel(n as C4Node),
      navigable: (n as C4Node).navigable ?? false,
      entityRef: n.catalogEntityRef ?? n.id,
    };
  }
  return {
    label: n.name,
    description: n.description,
    c4Type: 'Person',
    navigable: false,
    entityRef: n.catalogEntityRef ?? n.id,
  };
}

export function buildFlowGraph(
  classified: ClassifiedState,
  elkResult: ElkNode,
  boundary: Boundary,
  absRects: Map<string, Rect>,
  actors: C4Actor[],
  elkEdgeSections: Map<string, ElkSection[]> = new Map(),
): { flowNodes: Node[]; flowEdges: Edge[] } {
  const {
    subject,
    boundaryId,
    internalNodes,
    externalNodes,
    subdomainIds,
    internalIdSet,
    subjectHasSubcomponents,
    edgeMap,
  } = classified;
  const { x: bx, y: by, w: bw, h: bh } = boundary;

  const flowNodes: Node[] = [];

  // Boundary node must come before its children (React Flow requirement).
  const boundaryLabel = subject
    ? subjectHasSubcomponents && subject.depth === 2
      ? `Component: ${subject.name}`
      : `${depthLabel(subject.depth)}: ${subject.name}`
    : 'Boundary';

  flowNodes.push({
    id: boundaryId,
    type: 'boundary',
    position: { x: bx, y: by },
    data: { label: boundaryLabel, width: bw, height: bh, navigable: false },
    style: { width: bw, height: bh },
    selectable: false,
    draggable: false,
  });

  for (const child of elkResult.children ?? []) {
    const n = internalNodes.find(in_ => in_.id === child.id);
    if (!n) continue;

    if (subdomainIds.has(n.id)) {
      const sdw = child.width ?? NODE_W;
      const sdh = child.height ?? NODE_H;
      const sdBoundaryId = `__boundary__${n.id}`;
      flowNodes.push({
        id: sdBoundaryId,
        type: 'boundary',
        parentId: boundaryId,
        // ELK __boundary__ compound padding is already in child.x/y — don't add BOUNDARY_PAD.
        position: {
          x: child.x ?? 0,
          y: child.y ?? 0,
        },
        data: {
          label: `${depthLabel(n.depth)}: ${n.name}`,
          width: sdw,
          height: sdh,
          navigable: true,
          entityRef: n.catalogEntityRef ?? n.id,
        },
        style: { width: sdw, height: sdh },
        selectable: false,
        draggable: false,
      });
      for (const sys of child.children ?? []) {
        const sn = internalNodes.find(in_ => in_.id === sys.id);
        if (!sn) continue;
        flowNodes.push({
          id: sn.id,
          type: 'internal',
          parentId: sdBoundaryId,
          position: { x: sys.x ?? 0, y: sys.y ?? 0 },
          style: { width: NODE_W, height: NODE_H },
          data: nodeData(sn),
          draggable: false,
          selectable: false,
        });
      }
    } else {
      flowNodes.push({
        id: n.id,
        type: 'internal',
        parentId: boundaryId,
        // ELK __boundary__ compound padding is already in child.x/y — don't add BOUNDARY_PAD.
        position: {
          x: child.x ?? 0,
          y: child.y ?? 0,
        },
        style: { width: NODE_W, height: NODE_H },
        data: nodeData(n),
        draggable: false,
        selectable: false,
      });
    }
  }

  for (const [id, rect] of absRects) {
    if (internalIdSet.has(id)) continue;
    const extNode = externalNodes.find(n => n.id === id);
    const actor = actors.find(a => a.id === id);
    if (extNode) {
      flowNodes.push({
        id: extNode.id,
        type: 'external',
        position: { x: rect.x, y: rect.y },
        style: { width: NODE_W, height: NODE_H },
        data: nodeData(extNode),
        draggable: false,
        selectable: false,
      });
    } else if (actor) {
      flowNodes.push({
        id: actor.id,
        type: 'actor',
        position: { x: rect.x, y: rect.y },
        style: { width: NODE_W, height: NODE_H },
        data: nodeData(actor),
        draggable: false,
        selectable: false,
      });
    }
  }

  const router = new HandleRouter();
  const usage = new HandleUsageTracker();

  // Collect dynamic port handles per node id from ELK section endpoints.
  const nodePortHandles = new Map<string, PortHandle[]>();
  function addPortHandle(nodeId: string, handle: PortHandle) {
    if (!nodePortHandles.has(nodeId)) nodePortHandles.set(nodeId, []);
    nodePortHandles.get(nodeId)!.push(handle);
  }

  const flowEdges: Edge[] = [];
  for (const [key, group] of edgeMap) {
    const srcId = group[0].sourceId;
    const tgtId = group[0].targetId;
    const srcRect = absRects.get(srcId);
    const tgtRect = absRects.get(tgtId);
    if (!srcRect || !tgtRect) continue;

    const labelParts = Array.from(
      new Set(
        group
          .map(rel =>
            rel.technology
              ? `${rel.description} [${rel.technology}]`
              : rel.description,
          )
          .filter(Boolean),
      ),
    );

    const isCrossBoundary =
      internalIdSet.has(srcId) !== internalIdSet.has(tgtId);
    // For cross-boundary edges, push label well away from the boundary-crossing
    // point so it sits clearly on the external portion of the path.
    const labelFraction = isCrossBoundary
      ? internalIdSet.has(srcId)
        ? 0.8
        : 0.2
      : 0.5;

    const {
      sections: handleSections,
      sourceHandle: routerSourceHandle,
      targetHandle: routerTargetHandle,
    } = router.select(srcRect, tgtRect, usage.ctx(srcId, tgtId));
    usage.mark(srcId, routerSourceHandle, tgtId, routerTargetHandle);

    // Prefer ELK-computed sections (obstacle-aware) over HandleRouter heuristic.
    const elkSections = elkEdgeSections.get(key);
    const sections = elkSections ?? handleSections;

    // Derive dynamic port handles: ELK section endpoints are most accurate;
    // fall back to static handle positions from HandleRouter.
    let sourceHandle: string = routerSourceHandle;
    let targetHandle: string = routerTargetHandle;
    if (elkSections?.[0]) {
      const srcPort = elkPointToPortHandle(
        elkSections[0].startPoint,
        srcRect,
        'source',
      );
      const tgtPort = elkPointToPortHandle(
        elkSections[0].endPoint,
        tgtRect,
        'target',
      );
      if (srcPort) {
        sourceHandle = srcPort.id;
        addPortHandle(srcId, srcPort);
      } else {
        // Section endpoint doesn't match the node face (e.g. stale section after
        // external-node redistribution). Register the static handle so React Flow
        // can find it and the edge remains visible.
        addPortHandle(
          srcId,
          staticHandleToPortHandle(routerSourceHandle, 'source'),
        );
      }
      if (tgtPort) {
        targetHandle = tgtPort.id;
        addPortHandle(tgtId, tgtPort);
      } else {
        addPortHandle(
          tgtId,
          staticHandleToPortHandle(routerTargetHandle, 'target'),
        );
      }
    } else {
      // HandleRouter edge (e.g. cross-subdomain): add static handle positions.
      addPortHandle(
        srcId,
        staticHandleToPortHandle(routerSourceHandle, 'source'),
      );
      addPortHandle(
        tgtId,
        staticHandleToPortHandle(routerTargetHandle, 'target'),
      );
    }

    flowEdges.push({
      id: key,
      source: srcId,
      target: tgtId,
      sourceHandle,
      targetHandle,
      label: labelParts.join('\n') || undefined,
      type: 'elk',
      data: { sections, labelFraction },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: COLOR_RELATIONSHIP,
        width: RELATIONSHIP_MARKER_SIZE,
        height: RELATIONSHIP_MARKER_SIZE,
      },
      style: {
        stroke: COLOR_RELATIONSHIP,
        strokeWidth: RELATIONSHIP_STROKE_WIDTH,
      },
      labelStyle: { fontSize: 10, fill: '#333', fontStyle: 'italic' },
      labelShowBg: false,
    });
  }

  // Inject port handles into node data so node components can render them.
  const flowNodesWithPorts = flowNodes.map(n => {
    const ports = nodePortHandles.get(n.id);
    return ports?.length
      ? { ...n, data: { ...n.data, portHandles: ports } }
      : n;
  });

  return { flowNodes: flowNodesWithPorts, flowEdges };
}
