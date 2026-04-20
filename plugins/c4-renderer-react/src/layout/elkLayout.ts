import type { ElkNode, ElkExtendedEdge } from 'elkjs';
import type { C4Diagram, C4Node, C4Actor } from '@fulgas/plugin-c4-node';
import { MarkerType, type Node, type Edge } from '@xyflow/react';
import {
  NODE_W, NODE_H, BOUNDARY_PAD, RANK_SEP, NODE_SEP,
  COLOR_RELATIONSHIP, RELATIONSHIP_STROKE_WIDTH, RELATIONSHIP_MARKER_SIZE,
} from '../c4Style';
import type { LayoutResult } from './types';

// Lazily loaded and cached — the UMD bundle must NOT be imported statically
// because webpack executes it at module-init time and corrupts React's module
// context (causes "$RefreshSig$ / useState is not a function" errors).
let _elk: InstanceType<typeof import('elkjs').default> | null = null;
async function getElk() {
  if (!_elk) {
    const mod = await import('elkjs/lib/elk.bundled.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ELKClass: any = (mod as any).default ?? mod;
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

/**
 * Lay out a C4Diagram using ELK (Eclipse Layout Kernel).
 *
 * ELK uses the `layered` algorithm with `ORTHOGONAL` edge routing and
 * `INCLUDE_CHILDREN` hierarchy handling so cross-boundary edges are routed
 * around node boxes — no crossing of elements.
 *
 * Edge paths are stored in `edge.data.sections` and rendered by `ElkEdge`.
 */
export async function elkLayout(diagram: C4Diagram): Promise<LayoutResult> {
  const { descriptor, nodes, actors, relationships } = diagram;
  const subjectId = descriptor.subjectId;
  const subject = nodes.find(n => n.id === subjectId);

  const internalNodes = nodes.filter(
    n =>
      (n.id !== subjectId && n.parentId === subjectId) ||
      (subject && subject.depth === 2 && n.id === subjectId),
  );
  const externalNodes = nodes.filter(
    n => n.id !== subjectId && n.parentId !== subjectId,
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
    if (!allRealNodeIds.has(r.sourceId) || !allRealNodeIds.has(r.targetId)) continue;
    const key = `${r.sourceId}→${r.targetId}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(r);
  }

  // All edges defined at the root level; ELK routes them around the boundary
  // compound node because `elk.hierarchyHandling = INCLUDE_CHILDREN`.
  const elkEdges: ElkExtendedEdge[] = [];
  for (const [key, group] of edgeMap) {
    elkEdges.push({ id: key, sources: [group[0].sourceId], targets: [group[0].targetId] });
  }

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.edgeRouting': 'ORTHOGONAL',
      // Routes edges that cross the boundary compound node correctly.
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.layered.spacing.nodeNodeBetweenLayers': String(RANK_SEP),
      'elk.spacing.nodeNode': String(NODE_SEP),
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
    children: [
      {
        id: BOUNDARY_ID,
        layoutOptions: {
          'elk.padding': `[top=${BOUNDARY_PAD},left=${BOUNDARY_PAD / 2},bottom=${BOUNDARY_PAD / 2},right=${BOUNDARY_PAD / 2}]`,
        },
        children: internalNodes.map(n => ({ id: n.id, width: NODE_W, height: NODE_H })),
      },
      ...externalNodes.map(n => ({ id: n.id, width: NODE_W, height: NODE_H })),
      ...actors.map(a => ({ id: a.id, width: NODE_W, height: NODE_H })),
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
      label: subject ? `${depthLabel(subject.depth)}: ${subject.name}` : 'Boundary',
      width: bw,
      height: bh,
    },
    style: { width: bw, height: bh },
    selectable: false,
    draggable: false,
  });

  // Internal nodes — ELK positions are relative to boundary ✓ (matches React Flow parentId)
  for (const elkChild of boundaryElk.children ?? []) {
    const n = internalNodes.find(in_ => in_.id === elkChild.id);
    if (!n) continue;
    flowNodes.push({
      id: n.id,
      type: 'internal',
      parentId: BOUNDARY_ID,
      position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
      data: nodeData(n),
      draggable: false,
      selectable: false,
    });
  }

  // External nodes and actors
  for (const elkChild of result.children ?? []) {
    if (elkChild.id === BOUNDARY_ID) continue;
    const extNode = externalNodes.find(n => n.id === elkChild.id);
    const actor = actors.find(a => a.id === elkChild.id);
    if (extNode) {
      flowNodes.push({
        id: extNode.id,
        type: 'external',
        position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
        data: nodeData(extNode),
        draggable: false,
        selectable: false,
      });
    } else if (actor) {
      flowNodes.push({
        id: actor.id,
        type: 'actor',
        position: { x: elkChild.x ?? 0, y: elkChild.y ?? 0 },
        data: nodeData(actor),
        draggable: false,
        selectable: false,
      });
    }
  }

  // ── React Flow edges ──────────────────────────────────────────────────────
  // ELK section coordinates are in root (absolute) space for all root-level
  // edges, which matches React Flow's SVG canvas coordinate system.
  const flowEdges: Edge[] = [];

  for (const elkEdge of result.edges ?? []) {
    const group = edgeMap.get(elkEdge.id);
    if (!group) continue;

    const labelParts = Array.from(
      new Set(
        group
          .map(rel =>
            rel.technology ? `${rel.description} [${rel.technology}]` : rel.description,
          )
          .filter(Boolean),
      ),
    );

    const sections = (elkEdge as any).sections ?? [];

    flowEdges.push({
      id: elkEdge.id,
      source: group[0].sourceId,
      target: group[0].targetId,
      label: labelParts.join('\n') || undefined,
      type: 'elk',
      data: { sections },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: COLOR_RELATIONSHIP,
        width: RELATIONSHIP_MARKER_SIZE,
        height: RELATIONSHIP_MARKER_SIZE,
      },
      style: { stroke: COLOR_RELATIONSHIP, strokeWidth: RELATIONSHIP_STROKE_WIDTH },
      labelStyle: { fontSize: 10, fill: '#333', fontStyle: 'italic' },
      labelShowBg: false,
    });
  }

  return { nodes: flowNodes, edges: flowEdges };
}
