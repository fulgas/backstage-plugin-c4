import { graphlib, layout } from '@dagrejs/dagre';
import type { C4Diagram, C4Node, C4Actor } from '@fulgas/plugin-c4-node';
import { MarkerType, type Node, type Edge } from '@xyflow/react';
import {
  NODE_W, NODE_H, BOUNDARY_PAD, RANK_SEP, NODE_SEP, LAYOUT_DIRECTION,
  COLOR_RELATIONSHIP, RELATIONSHIP_STROKE_WIDTH, RELATIONSHIP_MARKER_SIZE,
} from '../c4Style';
import type { LayoutResult } from './types';

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
 * Lay out a C4Diagram using dagre (synchronous, two-pass).
 *
 * Pass 1: internal sub-graph → computes boundary size.
 * Pass 2: boundary + external nodes + actors.
 *
 * Edges use React Flow's default bezier type; no obstacle avoidance.
 * For full obstacle-avoiding routing switch to the ELK engine.
 */
export async function dagreLayout(diagram: C4Diagram): Promise<LayoutResult> {
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

  // ── Internal layout ───────────────────────────────────────────────────────
  const internalG = new graphlib.Graph();
  internalG.setDefaultEdgeLabel(() => ({}));
  internalG.setGraph({ rankdir: LAYOUT_DIRECTION, ranksep: RANK_SEP, nodesep: NODE_SEP });

  for (const n of internalNodes) {
    internalG.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const r of relationships) {
    if (
      internalNodes.some(n => n.id === r.sourceId) &&
      internalNodes.some(n => n.id === r.targetId)
    ) {
      internalG.setEdge(r.sourceId, r.targetId);
    }
  }
  layout(internalG);

  let bw = NODE_W, bh = NODE_H;
  if (internalNodes.length > 0) {
    let maxX = 0, maxY = 0;
    for (const n of internalNodes) {
      const pos = internalG.node(n.id);
      maxX = Math.max(maxX, pos.x + NODE_W / 2);
      maxY = Math.max(maxY, pos.y + NODE_H / 2);
    }
    bw = maxX + BOUNDARY_PAD;
    bh = maxY + BOUNDARY_PAD;
  }

  // ── Outer layout ──────────────────────────────────────────────────────────
  const BOUNDARY_ID = `__boundary__${subjectId}`;
  const outerG = new graphlib.Graph();
  outerG.setDefaultEdgeLabel(() => ({}));
  outerG.setGraph({ rankdir: LAYOUT_DIRECTION, ranksep: RANK_SEP + 40, nodesep: NODE_SEP });

  outerG.setNode(BOUNDARY_ID, { width: bw, height: bh });
  for (const n of externalNodes) outerG.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const a of actors) outerG.setNode(a.id, { width: NODE_W, height: NODE_H });

  const internalIds = new Set([subjectId, ...internalNodes.map(n => n.id)]);
  const externalIds = new Set([...externalNodes.map(n => n.id), ...actors.map(a => a.id)]);

  for (const r of relationships) {
    const srcInternal = internalIds.has(r.sourceId);
    const tgtInternal = internalIds.has(r.targetId);
    if (srcInternal && externalIds.has(r.targetId)) {
      outerG.setEdge(BOUNDARY_ID, r.targetId);
    } else if (externalIds.has(r.sourceId) && tgtInternal) {
      outerG.setEdge(r.sourceId, BOUNDARY_ID);
    }
  }
  layout(outerG);

  const boundaryPos = outerG.node(BOUNDARY_ID);
  const bx = boundaryPos.x - bw / 2;
  const by = boundaryPos.y - bh / 2;

  // ── React Flow nodes ──────────────────────────────────────────────────────
  const flowNodes: Node[] = [];

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

  for (const n of internalNodes) {
    const pos = internalG.node(n.id);
    flowNodes.push({
      id: n.id,
      type: 'internal',
      parentId: BOUNDARY_ID,
      position: { x: pos.x - NODE_W / 2 + BOUNDARY_PAD / 2, y: pos.y - NODE_H / 2 + BOUNDARY_PAD },
      data: nodeData(n),
      draggable: false,
      selectable: false,
    });
  }

  for (const n of externalNodes) {
    const pos = outerG.node(n.id);
    flowNodes.push({
      id: n.id,
      type: 'external',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: nodeData(n),
      draggable: false,
      selectable: false,
    });
  }

  for (const a of actors) {
    const pos = outerG.node(a.id);
    flowNodes.push({
      id: a.id,
      type: 'actor',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: nodeData(a),
      draggable: false,
      selectable: false,
    });
  }

  // ── React Flow edges ──────────────────────────────────────────────────────
  const allNodeIds = new Set(flowNodes.map(n => n.id));
  allNodeIds.delete(BOUNDARY_ID);

  const absPos = new Map<string, { x: number; y: number }>();
  for (const n of flowNodes) {
    if ((n as any).parentId === BOUNDARY_ID) {
      absPos.set(n.id, { x: bx + n.position.x, y: by + n.position.y });
    } else {
      absPos.set(n.id, n.position);
    }
  }

  const edgeMap = new Map<string, typeof relationships>();
  for (const r of relationships) {
    if (!allNodeIds.has(r.sourceId) || !allNodeIds.has(r.targetId)) continue;
    const key = `${r.sourceId}→${r.targetId}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(r);
  }

  const flowEdges: Edge[] = [];
  for (const [, group] of edgeMap) {
    const r = group[0];
    const sp = absPos.get(r.sourceId)!;
    const tp = absPos.get(r.targetId)!;
    const dx = (tp.x + NODE_W / 2) - (sp.x + NODE_W / 2);
    const dy = (tp.y + NODE_H / 2) - (sp.y + NODE_H / 2);
    const { sh, th } = Math.abs(dx) >= Math.abs(dy)
      ? dx >= 0 ? { sh: 's-right', th: 't-left' } : { sh: 's-left', th: 't-right' }
      : dy >= 0 ? { sh: 's-bottom', th: 't-top' } : { sh: 's-top', th: 't-bottom' };

    const labelParts = Array.from(
      new Set(
        group
          .map(rel => (rel.technology ? `${rel.description} [${rel.technology}]` : rel.description))
          .filter(Boolean),
      ),
    );

    flowEdges.push({
      id: group.map(rel => rel.id).join('+'),
      source: r.sourceId,
      target: r.targetId,
      sourceHandle: sh,
      targetHandle: th,
      label: labelParts.join('\n') || undefined,
      type: 'default',
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
