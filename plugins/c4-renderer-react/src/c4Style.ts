/**
 * Layout constants for the C4 diagram renderer.
 *
 * Visual colours are CSS custom properties defined in c4Theme.css.
 * Override any --c4-color-* variable in your app CSS to customise the theme.
 */

// ── Relationships ─────────────────────────────────────────────────────────────

/**
 * Relationship line colour. Used for both the edge stroke and SVG arrowhead marker.
 * SVG marker `color` attributes don't reliably support CSS custom properties,
 * so this remains a constant. Override --c4-color-edge in CSS to change the stroke;
 * this constant controls the marker colour only.
 */
export const COLOR_RELATIONSHIP = '#707070';

/** Relationship line thickness in pixels. Structurizr default: 2. */
export const RELATIONSHIP_STROKE_WIDTH = 2;

/** Whether relationships use a dashed stroke. Structurizr default: false (solid). */
export const RELATIONSHIP_DASHED = false;

/** Arrowhead size (width × height in px) for the closed arrow marker. */
export const RELATIONSHIP_MARKER_SIZE = 16;

// ── Layout ────────────────────────────────────────────────────────────────────

/** Width of a standard C4 node box — must match the `width` in C4NodeTypes BASE style. */
export const NODE_W = 180;

/** Height of a standard C4 node box. */
export const NODE_H = 100;

/** Padding around internal nodes inside the boundary. */
export const BOUNDARY_PAD = 60;
