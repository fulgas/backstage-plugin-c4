import type { ElkExtendedEdge, ElkNode } from 'elkjs';
import { NODE_H, NODE_W } from '../../c4Style';
import type { C4LayoutOptions, ClassifiedState } from './types';

const NODE_SEP = 60;
const RANK_SEP = 80;
const SD_PAD_TOP = 48; // vertical room for the subdomain label header
const SD_PAD_SIDE = 20;

export function buildElkGraph(
  classified: ClassifiedState,
  dir: C4LayoutOptions['direction'],
): ElkNode {
  const {
    internalIdSet,
    subdomainIds,
    subdomainNodes,
    subdomainSystemNodes,
    directInternalNodes,
    internalNodes,
    edgeMap,
  } = classified;

  const resolvedDir = dir ?? 'TB';
  const dirOption =
    resolvedDir !== 'auto'
      ? { 'elk.direction': resolvedDir === 'LR' ? 'RIGHT' : 'DOWN' }
      : {};

  // When subdomains exist, cross-hierarchy edges (flat node ↔ compound child)
  // confuse ELK's layered algorithm and cause flat nodes to overlap subdomain
  // boundaries. Lift each edge to its common ancestor: subdomain ID for nodes
  // inside a subdomain, own ID for flat nodes. Same-subdomain edges go into
  // each compound node's own edge list.
  let elkRootEdges: ElkExtendedEdge[];
  const sdInternalEdgeMap = new Map<string, ElkExtendedEdge[]>();

  if (subdomainNodes.length === 0) {
    elkRootEdges = [];
    for (const [key, group] of edgeMap) {
      const { sourceId: s, targetId: t } = group[0];
      if (internalIdSet.has(s) && internalIdSet.has(t)) {
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

    for (const [key, group] of edgeMap) {
      const { sourceId: s, targetId: t } = group[0];
      if (!internalIdSet.has(s) || !internalIdSet.has(t)) continue;
      const rs = repId(s);
      const rt = repId(t);
      if (rs === rt && subdomainIds.has(rs)) {
        if (!sdInternalEdgeMap.has(rs)) sdInternalEdgeMap.set(rs, []);
        sdInternalEdgeMap
          .get(rs)!
          .push({ id: key, sources: [s], targets: [t] });
      } else if (rs !== rt) {
        const rootKey = `${rs}→${rt}`;
        if (!rootEdgeSet.has(rootKey)) {
          rootEdgeSet.set(rootKey, {
            id: rootKey,
            sources: [rs],
            targets: [rt],
          });
        }
      }
    }
    elkRootEdges = Array.from(rootEdgeSet.values());
  }

  return {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
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
    edges: elkRootEdges,
  };
}
