import type { C4Actor, C4Diagram, C4Node } from '@fulgas/plugin-c4-node';
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { ElkExtendedEdge, ElkNode } from 'elkjs';
import {
  BOUNDARY_PAD,
  COLOR_RELATIONSHIP,
  NODE_H,
  NODE_W,
  RELATIONSHIP_MARKER_SIZE,
  RELATIONSHIP_STROKE_WIDTH,
} from '../c4Style';
import type { LayoutResult } from './types';

// Lazily loaded and cached — the UMD bundle must NOT be imported statically
// because webpack executes it at module-init time and corrupts React's module
// context (causes "$RefreshSig$ / useState is not a function" errors).
let _elk: InstanceType<typeof import('elkjs').default> | null = null;
async function getElk() {
  if (!_elk) {
    const mod = await import('elkjs/lib/elk.bundled.js');
    const ELKClass = ((mod as any).default ?? mod) as any;
    _elk = new ELKClass();
  }
  return _elk!;
}

function depthLabel(depth: number): string {
  if (depth === 0) return 'Domain';
  if (depth === 1) return 'System';
  return 'Container';
}

function nodeData(n: C4Node | C4Actor) {
  if ('depth' in n) {
    return {
      label: n.name,
      description: n.description,
      technology: n.technology,
      subType: n.subType,
      entityRef: n.catalogEntityRef ?? n.id,
    };
  }
  return {
    label: n.name,
    description: n.description,
    entityRef: (n as any).catalogEntityRef ?? n.id,
  };
}

// Fixed layout spacing — edges are straight lines overlaid as SVG, not obstacles ELK routes
// around, so spacing only needs to keep node boxes from touching, not reserve label room.
const NODE_SEP = 60;
const RANK_SEP = 80;

/**
 * Lay out a C4Diagram using ELK (Eclipse Layout Kernel).
 *
 * Internal nodes are arranged inside the boundary compound using MULTI_EDGE wrapping.
 * External nodes and actors are placed around the compound by ELK's layered algorithm.
 * ORTHOGONAL edge routing lets ELK route all edges around obstacles with right-angle bends.
 * Edges are defined at root level with hierarchyHandling = INCLUDE_CHILDREN so ELK
 * routes cross-boundary edges correctly; section coordinates are in root (absolute) space.
 */
export interface C4LayoutOptions {
  direction?: 'TB' | 'LR' | 'auto';
}

export async function elkLayout(
  diagram: C4Diagram,
  options: C4LayoutOptions = {},
): Promise<LayoutResult> {
  const dir = options.direction ?? 'TB';
  const { descriptor, nodes, actors, relationships } = diagram;
  const subjectId = descriptor.subjectId;
  const subject = nodes.find(n => n.id === subjectId);

  // For depth-2 subjects (Component), resources directly depended on by the
  // subject (same-system databases, queues, etc.) are "owned" and appear inside
  // the boundary alongside the service itself.
  const ownedResourceIds: Set<string> = new Set();
  if (subject?.depth === 2) {
    const directDeps = new Set(
      relationships.filter(r => r.sourceId === subjectId).map(r => r.targetId),
    );
    for (const n of nodes) {
      if (
        directDeps.has(n.id) &&
        (n.subType === 'database' ||
          n.subType === 'queue' ||
          n.subType === 'resource')
      ) {
        ownedResourceIds.add(n.id);
      }
    }
  }

  const internalNodes = nodes.filter(
    n =>
      (n.id !== subjectId && n.parentId === subjectId) ||
      (subject && subject.depth === 2 && n.id === subjectId) ||
      ownedResourceIds.has(n.id),
  );
  const externalNodes = nodes.filter(
    n =>
      n.id !== subjectId &&
      n.parentId !== subjectId &&
      !ownedResourceIds.has(n.id),
  );

  const BOUNDARY_ID = `__boundary__${subjectId}`;

  const allRealNodeIds = new Set([
    ...internalNodes.map(n => n.id),
    ...externalNodes.map(n => n.id),
    ...actors.map(a => a.id),
  ]);

  // Merge duplicate relationships (same source→target) into one edge.
  const edgeMap = new Map<string, typeof relationships>();
  for (const r of relationships) {
    if (!allRealNodeIds.has(r.sourceId) || !allRealNodeIds.has(r.targetId))
      continue;
    const key = `${r.sourceId}→${r.targetId}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(r);
  }

  // All edges at root level; paths overridden with straight lines post-layout so no
  // label space reservation needed — ELK only needs edges for node placement ordering.
  const elkEdges: ElkExtendedEdge[] = [];
  for (const [key, group] of edgeMap) {
    elkEdges.push({
      id: key,
      sources: [group[0].sourceId],
      targets: [group[0].targetId],
    });
  }

  const freePortOptions = { 'elk.portConstraints': 'FREE' };

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      ...(dir !== 'auto' && {
        'elk.direction': dir === 'LR' ? 'RIGHT' : 'DOWN',
      }),
      // ORTHOGONAL routing produces right-angle bends routed around all obstacles.
      // ELK computes accurate attachment points at node faces; no manual face-attachment fix needed.
      'elk.edgeRouting': 'ORTHOGONAL',
      // Route edges that cross the boundary compound node correctly.
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(RANK_SEP),
      'elk.spacing.nodeNode': String(NODE_SEP),
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      'elk.layered.allowNonFlowPortsToSwitchSides': 'true',
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: [
      {
        id: BOUNDARY_ID,
        layoutOptions: {
          'elk.padding': `[top=${BOUNDARY_PAD},left=${
            BOUNDARY_PAD / 2
          },bottom=${BOUNDARY_PAD / 2},right=${BOUNDARY_PAD / 2}]`,
          ...freePortOptions,
          // Wrap internal nodes into a 2-D grid so the boundary stays compact.
          'elk.layered.wrapping.strategy': 'MULTI_EDGE',
          'elk.aspectRatio': '1.7',
          'elk.layered.spacing.nodeNodeBetweenLayers': String(RANK_SEP),
          'elk.spacing.nodeNode': String(NODE_SEP),
          'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        },
        children: internalNodes.map(n => ({
          id: n.id,
          width: NODE_W,
          height: NODE_H,
          layoutOptions: freePortOptions,
        })),
      },
      ...externalNodes.map(n => ({
        id: n.id,
        width: NODE_W,
        height: NODE_H,
        layoutOptions: freePortOptions,
      })),
      ...actors.map(a => ({
        id: a.id,
        width: NODE_W,
        height: NODE_H,
        layoutOptions: freePortOptions,
      })),
    ],
    edges: elkEdges,
  };

  const elk = await getElk();
  const result = await elk.layout(elkGraph);

  const boundaryElk = result.children!.find(c => c.id === BOUNDARY_ID)!;
  const bx = boundaryElk.x ?? 0;
  const by = boundaryElk.y ?? 0;
  const bw = boundaryElk.width ?? NODE_W * 2;
  const bh = boundaryElk.height ?? NODE_H * 2;

  // ── React Flow nodes ──────────────────────────────────────────────────────
  const flowNodes: Node[] = [];

  // Boundary must come before its children in the array (React Flow requirement).
  flowNodes.push({
    id: BOUNDARY_ID,
    type: 'boundary',
    position: { x: bx, y: by },
    data: {
      label: subject
        ? `${depthLabel(subject.depth)}: ${subject.name}`
        : 'Boundary',
      width: bw,
      height: bh,
    },
    style: { width: bw, height: bh },
    selectable: false,
    draggable: false,
  });

  // Internal nodes — ELK positions are relative to boundary compound (matches React Flow parentId).
  for (const elkChild of boundaryElk.children ?? []) {
    const n = internalNodes.find(in_ => in_.id === elkChild.id);
    if (!n) continue;
    flowNodes.push({
      id: n.id,
      type: 'internal',
      parentId: BOUNDARY_ID,
      position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
      style: { width: NODE_W, height: NODE_H },
      data: nodeData(n),
      draggable: false,
      selectable: false,
    });
  }

  // ── Build absolute rect map for internal nodes ────────────────────────────
  // Internal node ELK positions are compound-local; add (bx, by) for root-absolute.
  type Rect = { x: number; y: number; w: number; h: number };
  const absRect = new Map<string, Rect>();
  for (const elkChild of boundaryElk.children ?? []) {
    absRect.set(elkChild.id, {
      x: bx + (elkChild.x ?? 0),
      y: by + (elkChild.y ?? 0),
      w: NODE_W,
      h: NODE_H,
    });
  }

  // ── Reposition external nodes to the closest side of the boundary ─────────
  // ELK places externals in rank layers (above/below), ignoring which internal
  // node they connect to. We instead place each external adjacent to the boundary
  // side nearest to the internal node(s) it connects to, then pack along that side.
  {
    const internalIdSet2 = new Set(internalNodes.map(n => n.id));
    const externalIdSet = new Set([
      ...externalNodes.map(n => n.id),
      ...actors.map(a => a.id),
    ]);
    const bCx = bx + bw / 2;
    const bCy = by + bh / 2;
    const EXT_GAP = 60;

    type Side = 'left' | 'right' | 'top' | 'bottom';
    const sideGroups: Record<Side, { id: string; coord: number }[]> = {
      left: [],
      right: [],
      top: [],
      bottom: [],
    };

    for (const extId of externalIdSet) {
      // Find the centroid of all internal nodes this external connects to.
      const connectedRects: Rect[] = [];
      for (const [, group] of edgeMap) {
        const s = group[0].sourceId,
          t = group[0].targetId;
        if (s === extId && internalIdSet2.has(t)) {
          const r = absRect.get(t);
          if (r) connectedRects.push(r);
        }
        if (t === extId && internalIdSet2.has(s)) {
          const r = absRect.get(s);
          if (r) connectedRects.push(r);
        }
      }

      let side: Side;
      let coord: number;
      if (connectedRects.length === 0) {
        side = 'right';
        coord = bCy;
      } else {
        const cx =
          connectedRects.reduce((s, r) => s + r.x + r.w / 2, 0) /
          connectedRects.length;
        const cy =
          connectedRects.reduce((s, r) => s + r.y + r.h / 2, 0) /
          connectedRects.length;
        const dx = cx - bCx,
          dy = cy - bCy;
        if (Math.abs(dx) >= Math.abs(dy)) {
          side = dx >= 0 ? 'right' : 'left';
          coord = cy;
        } else {
          side = dy >= 0 ? 'bottom' : 'top';
          coord = cx;
        }
      }
      sideGroups[side].push({ id: extId, coord });
    }

    // Sort and spread along each side to avoid overlaps.
    const sides: Side[] = ['left', 'right', 'top', 'bottom'];
    for (const side of sides) {
      const items = sideGroups[side];
      if (!items.length) continue;
      items.sort((a, b) => a.coord - b.coord);
      const minSpacing =
        side === 'left' || side === 'right' ? NODE_H + 20 : NODE_W + 20;
      for (let i = 1; i < items.length; i++) {
        items[i].coord = Math.max(
          items[i].coord,
          items[i - 1].coord + minSpacing,
        );
      }
      for (const { id, coord } of items) {
        let x: number, y: number;
        if (side === 'right') {
          x = bx + bw + EXT_GAP;
          y = coord - NODE_H / 2;
        } else if (side === 'left') {
          x = bx - EXT_GAP - NODE_W;
          y = coord - NODE_H / 2;
        } else if (side === 'bottom') {
          x = coord - NODE_W / 2;
          y = by + bh + EXT_GAP;
        } else {
          x = coord - NODE_W / 2;
          y = by - EXT_GAP - NODE_H;
        }
        absRect.set(id, { x, y, w: NODE_W, h: NODE_H });
      }
    }
  }

  // External nodes and actors — use repositioned absRect positions.
  for (const [id, rect] of absRect) {
    if (internalNodes.some(n => n.id === id)) continue; // already added above
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

  /** Closest face attachment points between two axis-aligned rectangles. */
  function closestFace(src: Rect, tgt: Rect) {
    const srcCx = src.x + src.w / 2,
      srcCy = src.y + src.h / 2;
    const tgtCx = tgt.x + tgt.w / 2,
      tgtCy = tgt.y + tgt.h / 2;
    const dx = tgtCx - srcCx,
      dy = tgtCy - srcCy;
    const vOverlap =
      Math.min(src.y + src.h, tgt.y + tgt.h) - Math.max(src.y, tgt.y);
    const hOverlap =
      Math.min(src.x + src.w, tgt.x + tgt.w) - Math.max(src.x, tgt.x);
    let sx: number, sy: number, tx: number, ty: number;
    if (vOverlap > 0) {
      const cy =
        (Math.max(src.y, tgt.y) + Math.min(src.y + src.h, tgt.y + tgt.h)) / 2;
      if (dx >= 0) {
        sx = src.x + src.w;
        sy = cy;
        tx = tgt.x;
        ty = cy;
      } else {
        sx = src.x;
        sy = cy;
        tx = tgt.x + tgt.w;
        ty = cy;
      }
    } else if (hOverlap > 0) {
      const cx =
        (Math.max(src.x, tgt.x) + Math.min(src.x + src.w, tgt.x + tgt.w)) / 2;
      if (dy >= 0) {
        sx = cx;
        sy = src.y + src.h;
        tx = cx;
        ty = tgt.y;
      } else {
        sx = cx;
        sy = src.y;
        tx = cx;
        ty = tgt.y + tgt.h;
      }
    } else if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx >= 0) {
        sx = src.x + src.w;
        sy = srcCy;
        tx = tgt.x;
        ty = tgtCy;
      } else {
        sx = src.x;
        sy = srcCy;
        tx = tgt.x + tgt.w;
        ty = tgtCy;
      }
    } else {
      if (dy >= 0) {
        sx = srcCx;
        sy = src.y + src.h;
        tx = tgtCx;
        ty = tgt.y;
      } else {
        sx = srcCx;
        sy = src.y;
        tx = tgtCx;
        ty = tgt.y + tgt.h;
      }
    }
    return { sx, sy, tx, ty };
  }

  // ── React Flow edges ──────────────────────────────────────────────────────
  // Three cases for section coordinates:
  // - internal→internal: ELK routes in compound-local space → offset by (bx, by)
  // - cross-boundary (one internal, one external): ELK routes around the compound
  //   as an obstacle → produces zigzag. Replace with a straight face-attached line.
  // - external→external: ELK root-space ORTHOGONAL routing is correct as-is.
  const internalIdSet = new Set(internalNodes.map(n => n.id));

  function straightSection(src: Rect, tgt: Rect) {
    const { sx, sy, tx, ty } = closestFace(src, tgt);
    return [
      {
        startPoint: { x: sx, y: sy },
        bendPoints: [],
        endPoint: { x: tx, y: ty },
      },
    ];
  }

  const flowEdges: Edge[] = [];

  for (const elkEdge of result.edges ?? []) {
    const group = edgeMap.get(elkEdge.id);
    if (!group) continue;

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

    const rawSections = (elkEdge as any).sections ?? [];
    const srcId = group[0].sourceId;
    const tgtId = group[0].targetId;
    const srcInternal = internalIdSet.has(srcId);
    const tgtInternal = internalIdSet.has(tgtId);
    const srcRect = absRect.get(srcId);
    const tgtRect = absRect.get(tgtId);

    let sections: any[];
    let labelFraction = 0.5;
    const isCrossBoundary = srcInternal !== tgtInternal;
    if (srcRect && tgtRect && (srcInternal || tgtInternal)) {
      // Any edge touching an internal node: use straight face-attached line.
      // ELK's ORTHOGONAL routing takes long detours — around the compound for
      // cross-boundary edges, and through unnecessary bends for internal-internal.
      sections = straightSection(srcRect, tgtRect);
      if (isCrossBoundary) {
        // Bias label toward the external end so it clears the boundary box.
        labelFraction = srcInternal ? 0.65 : 0.35;
      }
    } else {
      // Both external — ELK root-space ORTHOGONAL routing is correct
      sections = rawSections;
    }

    flowEdges.push({
      id: elkEdge.id,
      source: group[0].sourceId,
      target: group[0].targetId,
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

  return { nodes: flowNodes, edges: flowEdges };
}
