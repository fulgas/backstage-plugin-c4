import type { C4Node, C4Relationship } from '@fulgas/plugin-c4-node';
import { classify } from './classify';

function node(
  id: string,
  depth: number,
  parentId?: string,
  extra: Partial<C4Node> = {},
): C4Node {
  return { id, depth, parentId, name: id, description: '', tags: [], ...extra };
}
function rel(sourceId: string, targetId: string): C4Relationship {
  return {
    id: `${sourceId}-${targetId}`,
    sourceId,
    targetId,
    description: '',
    tags: [],
  };
}

describe('classify', () => {
  it('separates internal (children of subject) from external nodes', () => {
    const subject = node('sys', 1);
    const child = node('svc', 2, 'sys');
    const external = node('ext', 1, 'other-domain');
    const r = classify(
      [subject, child, external],
      [],
      [rel('svc', 'ext')],
      'sys',
    );
    expect(r.internalNodes.map(n => n.id)).toContain('svc');
    expect(r.externalNodes.map(n => n.id)).toContain('ext');
    expect(r.internalNodes.map(n => n.id)).not.toContain('ext');
  });

  it('marks owned resources (db/queue) as internal for depth-2 subject', () => {
    const subject = node('svc', 2, 'sys');
    const db = node('db', 2, 'sys', { subType: 'database' });
    const r = classify([subject, db], [], [rel('svc', 'db')], 'svc');
    expect(r.internalNodes.map(n => n.id)).toContain('db');
    expect(r.ownedResourceIds.has('db')).toBe(true);
  });

  it('detects subdomains in landscape view (depth-0 subject)', () => {
    const domain = node('dom', 0);
    const sub = node('sub', 0, 'dom');
    const sys = node('sys', 1, 'sub');
    const r = classify([domain, sub, sys], [], [], 'dom');
    expect(r.subdomainNodes.map(n => n.id)).toContain('sub');
    expect(r.subdomainIds.has('sub')).toBe(true);
    expect(r.subdomainSystemNodes.map(n => n.id)).toContain('sys');
    expect(r.directInternalNodes).toHaveLength(0);
  });

  it('deduplicates relationships into edgeMap', () => {
    const subject = node('sys', 1);
    const a = node('a', 2, 'sys');
    const b = node('b', 2, 'sys');
    const r1 = rel('a', 'b');
    const r2: C4Relationship = { ...r1, id: 'r2', description: 'also' };
    const result = classify([subject, a, b], [], [r1, r2], 'sys');
    expect(result.edgeMap.size).toBe(1);
    expect(result.edgeMap.get('a→b')).toHaveLength(2);
  });

  it('detects subjectHasSubcomponents for depth-2 with depth-3 children', () => {
    const svc = node('svc', 2, 'sys');
    const comp = node('comp', 3, 'svc');
    const r = classify([svc, comp], [], [], 'svc');
    expect(r.subjectHasSubcomponents).toBe(true);
  });

  it('excludes relationships with unknown node ids from edgeMap', () => {
    const subject = node('sys', 1);
    const a = node('a', 2, 'sys');
    const r = classify([subject, a], [], [rel('a', 'unknown')], 'sys');
    expect(r.edgeMap.size).toBe(0);
  });
});
