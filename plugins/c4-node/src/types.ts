export type C4Source = string;

/**
 * The three C4 diagram levels, derived from node depth in the tree.
 * This type replaces the old C4ViewType enum.
 *
 * @see C4Node.depth
 */
export type C4DiagramLevel = 'landscape' | 'context' | 'container';

/**
 * A node in the C4 hierarchy.
 *
 * Position in the tree determines the node's role:
 * - `depth 0` — Domain: the subject of a **landscape** diagram
 * - `depth 1` — System: the subject of a **context** diagram
 * - `depth 2` — Container: the subject of a **container** diagram
 *
 * `depth` is stored as a denormalized field so it can be queried in O(1)
 * without traversing the full parentId chain.
 */
export interface C4Node {
  /** Stable identifier — typically the Backstage entity ref (e.g. `system:default/my-system`). */
  id: string;
  /** ID of the parent node. Undefined means this is a root (depth 0) node. */
  parentId?: string;
  /** Tree depth: 0 = domain, 1 = system, 2 = container. */
  depth: number;
  name: string;
  description: string;
  /** Relevant at depth 2 (e.g. "Node.js", "PostgreSQL"). */
  technology?: string;
  /** Visual shape hint for depth-2 nodes. */
  subType?: 'service' | 'database' | 'queue' | 'resource';
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
   * ID of the `C4Node` at the centre of this diagram.
   * Its `depth` determines the diagram level.
   */
  subjectId: string;
  /** The Backstage entity that "owns" this diagram (used for entity page lookup). */
  entityRef?: string;
  /** Provider that generated this descriptor, e.g. `'catalog'` or `'dsl'`. */
  source: C4Source;
}

/**
 * A fully computed, render-ready diagram.
 *
 * Never stored in the DB — always derived from the node tree via
 * `ModelStore.computeDiagram()`. Results are cached in-memory and
 * invalidated on every sync.
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
}
