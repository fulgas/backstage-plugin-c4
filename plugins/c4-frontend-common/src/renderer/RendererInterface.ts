import React from 'react';
import { C4Diagram, C4ViewDisplaySettings } from '../types';

/** Options passed from the viewer component to the renderer. */
export interface C4RenderOptions {
  /** Called when the user clicks a node. Receives the node's `catalogEntityRef` if set, otherwise its `id`. */
  onNodeClick?: (entityRef: string) => void;
  /**
   * Called when the user changes display settings (direction, spacing).
   * The caller is responsible for persisting these settings to the backend.
   */
  onSettingsChange?: (settings: C4ViewDisplaySettings) => void;
  /**
   * When true, node dragging is enabled and node clicks are suppressed.
   * The renderer should show a visual cue that the diagram is in edit mode.
   */
  editMode?: boolean;
  /**
   * Called whenever node positions change during drag.
   * Receives the full position map for all nodes (keyed by React Flow node ID).
   * Only called when editMode is true.
   */
  onPositionsChange?: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
  /**
   * Increment to force the renderer to discard in-progress drag state and
   * re-apply the original layout (ELK or saved positions). Used by Cancel.
   */
  resetKey?: number;
}

/**
 * Interface implemented by diagram renderer packages (e.g. `c4-renderer-react`).
 *
 * A renderer receives a computed `C4Diagram` and turns it into a React element.
 * It is responsible for layout, styling, and interaction — not for data fetching.
 *
 * @example
 * ```tsx
 * // In a renderer package:
 * export const myRenderer: C4Renderer = {
 *   render(diagram, options) {
 *     return <MyDiagramCanvas diagram={diagram} onNodeClick={options?.onNodeClick} />;
 *   },
 * };
 * ```
 */
export interface C4Renderer {
  render(diagram: C4Diagram, options?: C4RenderOptions): React.ReactElement;
}
