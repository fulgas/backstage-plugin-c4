import type { C4Actor, C4Node } from '@fulgas/plugin-c4-node';
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
      navigable: (n as C4Node).navigable ?? false,
      entityRef: n.catalogEntityRef ?? n.id,
    };
  }
  return {
    label: n.name,
    description: n.description,
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
    const labelFraction = isCrossBoundary
      ? internalIdSet.has(srcId)
        ? 0.65
        : 0.35
      : 0.5;

    const {
      sections: handleSections,
      sourceHandle,
      targetHandle,
    } = router.select(srcRect, tgtRect, usage.ctx(srcId, tgtId));
    usage.mark(srcId, sourceHandle, tgtId, targetHandle);
    // Prefer ELK-computed sections (obstacle-aware) over HandleRouter heuristic.
    const sections = elkEdgeSections.get(key) ?? handleSections;

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

  return { flowNodes, flowEdges };
}
