import type { C4Actor, C4Node } from './types';

/**
 * Returns the C4 type label for a node or actor.
 *
 * Matches the standard C4 notation:
 *   depth 0 → "Domain"
 *   depth 1 → "System"
 *   depth 2 → "Database" | "Queue" | "Resource" | "Container"  (+ optional ": technology")
 *   depth 3 → "Component"  (+ optional ": technology")
 *   actor   → "Person"
 */
export function c4TypeLabel(node: C4Node | C4Actor): string {
  if (!('depth' in node)) return 'Person';

  const { depth, technology, subType } = node as C4Node;

  if (depth === 0) return 'Domain';
  if (depth === 1) return 'System';

  if (depth === 2) {
    const base =
      subType === 'database'
        ? 'Database'
        : subType === 'queue'
        ? 'Queue'
        : subType === 'resource'
        ? 'Resource'
        : 'Container';
    return technology ? `${base}: ${technology}` : base;
  }

  // depth 3 — subcomponent
  return technology ? `Component: ${technology}` : 'Component';
}
