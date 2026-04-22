export type C4Source = string;

/**
 * The four C4 diagram levels, derived from node depth in the tree.
 *
 * @see C4Node.depth
 */
export type C4DiagramLevel =
  | 'landscape'
  | 'context'
  | 'container'
  | 'component';

/**
 * A node in the C4 hierarchy.
 *
 * Position in the tree determines the node's role:
 * - `depth 0` — Domain: the subject of a **landscape** diagram
 * - `depth 1` — System: the subject of a **context** diagram
 * - `depth 2` — Container: the subject of a **container** diagram
 * - `depth 3` — Subcomponent: appears inside a **component** diagram (via `spec.subcomponentOf`)
 *
 * `depth` is stored as a denormalized field so it can be queried in O(1)
 * without traversing the full parentId chain.
 */
export interface C4Node {
  /** Stable identifier — typically the Backstage entity ref (e.g. `system:default/my-system`). */
  id: string;
  /** ID of the parent node. Undefined means this is a root (depth 0) node. */
  parentId?: string;
  /** Tree depth: 0 = domain, 1 = system, 2 = container, 3 = subcomponent. */
  depth: number;
  name: string;
  description: string;
  /** Relevant at depth 2 (e.g. "Node.js", "PostgreSQL"). */
  technology?: string;
  /** Visual shape hint for depth-2 nodes. */
  subType?: 'service' | 'database' | 'queue' | 'resource';
  /** Whether clicking this node navigates to its own diagram page. Set by the backend. */
  navigable?: boolean;
  tags: string[];
  /** The Backstage entity this node was derived from. */
  catalogEntityRef?: string;
}

/**
 * A human actor (User or Group) that interacts with the system.
 *
 * Actors are **not** part of the node hierarchy — they have no depth
 * and no parentId. They appear in diagrams as external participants.
 */
export interface C4Actor {
  id: string;
  name: string;
  description: string;
  tags: string[];
  /** The Backstage entity this actor was derived from. */
  catalogEntityRef?: string;
}

/**
 * A directed relationship between any two nodes or actors.
 *
 * Relationships are stored at multiple depths:
 * - depth-2 edges: raw `dependsOn` / API edges between containers
 * - depth-1 edges: rolled-up system→system edges
 * - depth-0 edges: rolled-up domain→domain edges
 *
 * This means every diagram level has ready-to-use edges without
 * requiring a roll-up at render time.
 */
export interface C4Relationship {
  id: string;
  /** ID of a `C4Node` or `C4Actor`. */
  sourceId: string;
  /** ID of a `C4Node` or `C4Actor`. */
  targetId: string;
  description: string;
  /** E.g. "HTTPS", "gRPC", "API". */
  technology?: string;
  tags: string[];
}

/**
 * The raw model produced by a sync provider and persisted to the DB.
 *
 * Models contain no views — views are projections computed on demand
 * from the node tree. Multiple providers can contribute to the same
 * overall model by registering via `c4ModelProviderExtensionPoint`.
 */
export interface C4Model {
  nodes: C4Node[];
  actors: C4Actor[];
  relationships: C4Relationship[];
}

/**
 * Shared display preferences for a diagram view.
 *
 * Stored in `c4_view_settings` and returned as part of every `C4ViewDescriptor`
 * so all users loading the same diagram see the same layout choices.
 */
export interface C4ViewDisplaySettings {
  /** Layout direction. Defaults to `'TB'` when not set. */
  direction?: 'TB' | 'LR' | 'auto';
  /** ELK node separation in pixels (horizontal gap between nodes). */
  nodeSep?: number;
  /** ELK rank separation in pixels (vertical gap between layers). */
  rankSep?: number;
}

/**
 * A thin descriptor stored in the DB that declares a diagram exists.
 *
 * The actual diagram content (nodes, relationships) is **not** stored here —
 * it is computed on demand by walking the node tree from `subjectId`.
 * Storing only the descriptor keeps DB writes cheap and ensures the
 * diagram is always consistent with the latest sync.
 *
 * The diagram level is implicit in the subject node's depth:
 * - subject depth 0 → landscape diagram
 * - subject depth 1 → context diagram
 * - subject depth 2 → container diagram
 */
export interface C4ViewDescriptor {
  id: string;
  title: string;
  /**
   * ID of the `C4Node` at the shcentre of this diagram.
   * Its `depth` determines the diagram level.
   */
  subjectId: string;
  /**
   * Diagram level derived from the subject node's depth at read time.
   * Not stored in the DB — computed via join with `c4_nodes`.
   * Optional when constructing a descriptor before persisting; always present after reading from DB.
   */
  level?: C4DiagramLevel;
  /** The Backstage entity that "owns" this diagram (used for entity page lookup). */
  entityRef?: string;
  /** Provider that generated this descriptor, e.g. `'catalog'` or `'dsl'`. */
  source: C4Source;
  /** Shared display preferences (direction, spacing). Saved by users, shared across all viewers. */
  displaySettings?: C4ViewDisplaySettings;
  /** Display name of the subject's parent node (e.g. system name for a container diagram). Not stored — derived at read time via join. */
  parentTitle?: string;
  /** Catalog entity ref of the subject's parent node. Not stored — derived at read time via join. Used for navigation. */
  parentEntityRef?: string;
}

/**
 * A fully computed, render-ready diagram.
 *
 * Never stored in the DB — always derived from the node tree via
 * `ModelStore.computeDiagram()`. Results cached via Backstage CacheService;
 * invalidated after sync or when positions/settings change.
 *
 * Node roles within the diagram:
 * - **Subject** (`descriptor.subjectId`): the boundary box
 * - **Internal nodes**: direct children of the subject
 * - **External nodes/actors**: connected via relationship but outside the boundary
 */
export interface C4Diagram {
  descriptor: C4ViewDescriptor;
  /** Includes subject + internal children + external neighbors. */
  nodes: C4Node[];
  /** External actors (Users/Groups) connected to internal nodes. */
  actors: C4Actor[];
  /** Only edges where both sides are present in `nodes` or `actors`. */
  relationships: C4Relationship[];
  /**
   * Saved node positions keyed by node ID. The boundary is stored under a
   * synthetic key derived from the subject ID. Empty object = no saved layout.
   */
  nodePositions: Record<string, { x: number; y: number }>;
}
