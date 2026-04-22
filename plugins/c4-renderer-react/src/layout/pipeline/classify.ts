import type { C4Actor, C4Node, C4Relationship } from '@fulgas/plugin-c4-node';
import type { ClassifiedState } from './types';

export function classify(
  nodes: C4Node[],
  actors: C4Actor[],
  relationships: C4Relationship[],
  subjectId: string,
): ClassifiedState {
  const subject = nodes.find(n => n.id === subjectId);

  // Depth-2 subjects: databases/queues/resources the subject directly depends on
  // are "owned" and rendered inside the boundary alongside the service.
  const ownedResourceIds = new Set<string>();
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

  const subjectHasSubcomponents =
    subject?.depth === 2 &&
    nodes.some(n => n.parentId === subjectId && n.depth === 3);

  const internalNodes = nodes.filter(
    n =>
      (n.id !== subjectId && n.parentId === subjectId) ||
      (subject &&
        subject.depth === 2 &&
        n.id === subjectId &&
        !subjectHasSubcomponents) ||
      ownedResourceIds.has(n.id) ||
      // Landscape view: systems inside depth-0 subdomain children of the subject.
      (subject?.depth === 0 &&
        n.depth !== 0 &&
        n.parentId !== subjectId &&
        nodes.some(
          sd =>
            sd.depth === 0 && sd.parentId === subjectId && sd.id === n.parentId,
        )),
  );

  const externalNodes = nodes.filter(
    n =>
      n.id !== subjectId &&
      !internalNodes.some(i => i.id === n.id) &&
      !ownedResourceIds.has(n.id),
  );

  const subdomainNodes =
    subject?.depth === 0 ? internalNodes.filter(n => n.depth === 0) : [];
  const subdomainIds = new Set(subdomainNodes.map(n => n.id));
  const directInternalNodes = internalNodes.filter(
    n => !subdomainIds.has(n.id) && n.parentId === subjectId,
  );
  const subdomainSystemNodes = internalNodes.filter(
    n => !subdomainIds.has(n.id) && n.parentId !== subjectId,
  );
  const internalIdSet = new Set(internalNodes.map(n => n.id));

  const allRealNodeIds = new Set([
    ...internalNodes.map(n => n.id),
    ...externalNodes.map(n => n.id),
    ...actors.map(a => a.id),
  ]);

  const edgeMap = new Map<string, C4Relationship[]>();
  for (const r of relationships) {
    if (!allRealNodeIds.has(r.sourceId) || !allRealNodeIds.has(r.targetId))
      continue;
    const key = `${r.sourceId}→${r.targetId}`;
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(r);
  }

  return {
    subject,
    boundaryId: `__boundary__${subjectId}`,
    internalNodes,
    externalNodes,
    subdomainNodes,
    subdomainIds,
    directInternalNodes,
    subdomainSystemNodes,
    internalIdSet,
    ownedResourceIds,
    subjectHasSubcomponents,
    edgeMap,
  };
}
