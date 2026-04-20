/**
 * Visual style constants following Structurizr's default C4 diagram theme.
 *
 * Reference: https://structurizr.com/help/styles
 *
 * Structurizr defaults (as of 2024):
 *   - Relationships: solid grey lines (#707070), closed arrowhead, thickness 2
 *   - Person:        dark navy fill  (#08427B), white text
 *   - Internal node: blue fill       (#1168BD), white text  (System / Container / Component)
 *   - External node: grey fill       (#999999), white text  (out-of-scope Systems)
 *   - Database node: dark green fill (#0b6e4f), white text  (subType = 'database')
 *   - Boundary box:  dashed border   (#AAAAAA), transparent fill
 */

// ── Element fill colours ─────────────────────────────────────────────────────

/** Person / actor (user, group, external user). */
export const COLOR_PERSON = '#08427B';

/** Internal software system, container, or component. */
export const COLOR_INTERNAL = '#1168BD';

/** External / out-of-scope software system. */
export const COLOR_EXTERNAL = '#999999';

/** Database container (subType === 'database'). */
export const COLOR_DATABASE = '#0b6e4f';

/** Text colour used on all filled elements. */
export const COLOR_TEXT_ON_FILL = '#FFFFFF';

// ── Boundary ─────────────────────────────────────────────────────────────────

/** Dashed border colour for the subject boundary box. */
export const COLOR_BOUNDARY_BORDER = '#AAAAAA';

/** Subtle tinted background inside the boundary. */
export const COLOR_BOUNDARY_BG = 'rgba(255,255,255,0.55)';

// ── Relationships ─────────────────────────────────────────────────────────────

/**
 * Relationship line colour.
 * Structurizr default: #707070 (medium grey).
 */
export const COLOR_RELATIONSHIP = '#707070';

/**
 * Relationship line thickness in pixels.
 * Structurizr default: 2.
 */
export const RELATIONSHIP_STROKE_WIDTH = 2;

/**
 * Whether relationships use a dashed stroke.
 * Structurizr default: false (solid).
 * Some teams override this to distinguish async/event relationships.
 */
export const RELATIONSHIP_DASHED = false;

/**
 * Arrowhead size (width × height in px) for the closed arrow marker.
 * Structurizr renders a standard closed/filled arrowhead.
 */
export const RELATIONSHIP_MARKER_SIZE = 16;

// ── Layout ────────────────────────────────────────────────────────────────────

/**
 * Dagre graph layout direction.
 *
 * C4 model convention (Simon Brown) and Structurizr default: **top-to-bottom** ('TB').
 * Official examples on c4model.com all use top-to-bottom layouts.
 * Left-to-right ('LR') can be used for process/flow diagrams but is not the C4 norm.
 *
 * Reference: https://c4model.com/#Examples
 */
export const LAYOUT_DIRECTION: 'LR' | 'TB' = 'TB';

/** Width of a standard C4 node box — must match the `width` in C4NodeTypes BASE style. */
export const NODE_W = 180;

/** Height hint for dagre — accounts for name + technology + description lines. */
export const NODE_H = 100;

/** Padding around internal nodes inside the boundary. */
export const BOUNDARY_PAD = 60;

/** Dagre rank separation (distance between node columns/rows). */
export const RANK_SEP = 120;

/** Dagre node separation (distance between sibling nodes). */
export const NODE_SEP = 60;
