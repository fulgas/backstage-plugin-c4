import type { C4Actor } from '@fulgas/plugin-c4-node';
import type { ElkExtendedEdge, ElkNode } from 'elkjs';
import { BOUNDARY_PAD, NODE_H, NODE_W } from '../../c4Style';
import type { C4LayoutOptions, ClassifiedState } from './types';

const NODE_SEP = 60;
const RANK_SEP = 80;
const SD_PAD_TOP = 48; // vertical room for the subdomain label header
const SD_PAD_SIDE = 20;

export interface ElkGraphResult {
  elkGraph: ElkNode;
  /** Maps ELK representative edge id → original flow edge keys (for cross-subdomain edges). */
  repKeyMap: Map<string, string[]>;
}

export function buildElkGraph(
  classified: ClassifiedState,
  dir: C4LayoutOptions['direction'],
  actors: C4Actor[] = [],
): ElkGraphResult {
  const {
    internalIdSet,
    subdomainIds,
    subdomainNodes,
    subdomainSystemNodes,
    directInternalNodes,
    internalNodes,
    externalNodes,
    edgeMap,
  } = classified;

  const resolvedDir = dir ?? 'TB';
  const dirOption: Record<string, string> =
    resolvedDir !== 'auto'
      ? { 'elk.direction': resolvedDir === 'LR' ? 'RIGHT' : 'DOWN' }
      : {};

  // External + actor nodes sit at root level outside the boundary compound.
  const externalElkNodes = [
    ...externalNodes.map(n => ({ id: n.id, width: NODE_W, height: NODE_H })),
    ...actors.map(a => ({ id: a.id, width: NODE_W, height: NODE_H })),
  ];

  let elkRootEdges: ElkExtendedEdge[];
  const sdInternalEdgeMap = new Map<string, ElkExtendedEdge[]>();
  const boundaryInternalEdges: import('elkjs').ElkExtendedEdge[] = [];
  // Maps ELK representative edge id → original flow edge keys (cross-subdomain edges only).
  const repKeyMap = new Map<string, string[]>();

  if (subdomainNodes.length === 0) {
    elkRootEdges = [];
    for (const [key, group] of edgeMap) {
      const { sourceId: s, targetId: t } = group[0];
      const sInternal = internalIdSet.has(s);
      const tInternal = internalIdSet.has(t);
      if (sInternal && tInternal) {
        // Same-compound edge: route inside __boundary__ so ELK doesn't go around it.
        boundaryInternalEdges.push({ id: key, sources: [s], targets: [t] });
      } else {
        elkRootEdges.push({ id: key, sources: [s], targets: [t] });
      }
    }
  } else {
    const nodeToSd = new Map<string, string>();
    for (const sys of subdomainSystemNodes) {
      if (sys.parentId && subdomainIds.has(sys.parentId)) {
        nodeToSd.set(sys.id, sys.parentId);
      }
    }
    const repId = (id: string) => nodeToSd.get(id) ?? id;
    const rootEdgeSet = new Map<string, ElkExtendedEdge>();
    const boundaryEdgeSet = new Map<string, ElkExtendedEdge>();

    for (const [key, group] of edgeMap) {
      const { sourceId: s, targetId: t } = group[0];
      const sInternal = internalIdSet.has(s);
      const tInternal = internalIdSet.has(t);

      if (!sInternal || !tInternal) {
        // Edge involves an external node — root level for global obstacle routing.
        if (!rootEdgeSet.has(key)) {
          rootEdgeSet.set(key, { id: key, sources: [s], targets: [t] });
        }
        continue;
      }

      const rs = repId(s);
      const rt = repId(t);
      if (rs === rt && subdomainIds.has(rs)) {
        // Same-subdomain: inside subdomain compound AND in __boundary__ edges.
        if (!sdInternalEdgeMap.has(rs)) sdInternalEdgeMap.set(rs, []);
        sdInternalEdgeMap
          .get(rs)!
          .push({ id: key, sources: [s], targets: [t] });
        if (!boundaryEdgeSet.has(key)) {
          boundaryEdgeSet.set(key, { id: key, sources: [s], targets: [t] });
        }
      } else if (rs !== rt) {
        if (subdomainIds.has(rs) || subdomainIds.has(rt)) {
          // At least one side is a subdomain compound: root level with representative IDs
          // so INCLUDE_CHILDREN routing sees the compound as an obstacle.
          const rootKey = `${rs}→${rt}`;
          if (!rootEdgeSet.has(rootKey)) {
            rootEdgeSet.set(rootKey, {
              id: rootKey,
              sources: [rs],
              targets: [rt],
            });
          }
          // Track original flow edge keys → representative ELK id.
          if (!repKeyMap.has(rootKey)) repKeyMap.set(rootKey, []);
          repKeyMap.get(rootKey)!.push(key);
        } else {
          // Both nodes are direct children of __boundary__ (no subdomain on either side).
          // Route inside the compound so ELK doesn't send the edge around the exterior.
          boundaryInternalEdges.push({ id: key, sources: [s], targets: [t] });
        }
      }
    }
    elkRootEdges = Array.from(rootEdgeSet.values());
    for (const e of boundaryEdgeSet.values()) boundaryInternalEdges.push(e);
  }

  // __boundary__ compound wraps all internal nodes. External nodes are root-level
  // siblings, so ELK places them outside the compound naturally.
  // INCLUDE_CHILDREN + ORTHOGONAL: the global router sees ALL nodes (including
  // compound children) as obstacles, preventing edges from passing through them.
  const boundaryCompound: ElkNode = {
    id: '__boundary__',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.padding': `[top=${BOUNDARY_PAD},left=${BOUNDARY_PAD},bottom=${BOUNDARY_PAD},right=${BOUNDARY_PAD}]`,
      ...dirOption,
      'elk.spacing.nodeNode': String(NODE_SEP),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(RANK_SEP),
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: [
      ...(subdomainNodes.length > 0 ? directInternalNodes : internalNodes).map(
        n => ({
          id: n.id,
          width: NODE_W,
          height: NODE_H,
        }),
      ),
      ...subdomainNodes.map(sd => ({
        id: sd.id,
        layoutOptions: {
          'elk.padding': `[top=${SD_PAD_TOP},left=${SD_PAD_SIDE},bottom=${SD_PAD_SIDE},right=${SD_PAD_SIDE}]`,
          'elk.algorithm': 'layered',
          ...dirOption,
          'elk.spacing.nodeNode': String(NODE_SEP),
          'elk.layered.spacing.nodeNodeBetweenLayers': String(RANK_SEP),
        },
        children: subdomainSystemNodes
          .filter(s => s.parentId === sd.id)
          .map(s => ({ id: s.id, width: NODE_W, height: NODE_H })),
        edges: sdInternalEdgeMap.get(sd.id) ?? [],
      })),
    ],
    // Internal-internal edges go here (not root) so INCLUDE_CHILDREN routes them
    // inside the compound, preventing paths from going around the compound exterior.
    edges: boundaryInternalEdges,
  };

  const elkGraph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.edgeRouting': 'ORTHOGONAL',
      // INCLUDE_CHILDREN: all nodes (including inside __boundary__) participate in
      // global routing, so edges avoid all obstacles regardless of hierarchy level.
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      ...dirOption,
      'elk.spacing.nodeNode': String(NODE_SEP),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(RANK_SEP),
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: [boundaryCompound, ...externalElkNodes],
    edges: elkRootEdges,
  };

  return { elkGraph, repKeyMap };
}
