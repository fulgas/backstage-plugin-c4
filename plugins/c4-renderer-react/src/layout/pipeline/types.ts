import type { C4Node, C4Relationship } from '@fulgas/plugin-c4-node';

export interface C4LayoutOptions {
  direction?: 'TB' | 'LR' | 'auto';
}

export interface Boundary {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface ClassifiedState {
  subject: C4Node | undefined;
  /** Synthetic React Flow node ID for the outer boundary box. */
  boundaryId: string;
  internalNodes: C4Node[];
  externalNodes: C4Node[];
  /** Depth-0 children of the subject (landscape view only). */
  subdomainNodes: C4Node[];
  subdomainIds: Set<string>;
  /** Depth-1 nodes that are direct children of the subject (not inside a subdomain). */
  directInternalNodes: C4Node[];
  /** Nodes inside subdomains (landscape view only). */
  subdomainSystemNodes: C4Node[];
  internalIdSet: Set<string>;
  ownedResourceIds: Set<string>;
  subjectHasSubcomponents: boolean;
  edgeMap: Map<string, C4Relationship[]>;
}
