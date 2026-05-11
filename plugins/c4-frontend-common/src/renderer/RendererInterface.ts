import React from 'react';
import { C4Diagram, C4ViewDisplaySettings } from '../types';

/** Options passed from the viewer component to the renderer. */
export interface C4RenderOptions {
  /** Called when the user clicks a node. Receives the node's `catalogEntityRef` if set, otherwise its `id`. */
  onNodeClick?: (entityRef: string) => void;
  /** Called when the user changes display settings (direction, spacing). */
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
   * Increment to force the renderer to discard unsaved drag state and restore
   * the persisted layout. Used by the Cancel action.
   */
  resetKey?: number;
  /** Enter edit mode. Renderer surfaces this as a button in its control panel. */
  onEnterEditMode?: () => void;
  /** Save current drag positions. Only present when in edit mode. */
  onSaveLayout?: () => void;
  /** Reset positions to ELK auto-layout. Only present when in edit mode. */
  onResetLayout?: () => void;
  /** Cancel edit mode and restore the previous layout. Only present when in edit mode. */
  onCancelEdit?: () => void;
  /** Whether Save Layout is enabled (positions have been dragged). */
  canSave?: boolean;
  /**
   * When true, all edit controls (Edit Layout, direction buttons, download) are
   * hidden. Use for read-only embeds such as TechDocs pages.
   */
  readOnly?: boolean;
  /**
   * When set alongside `captureContainerEl`, fires once with a PNG data URL
   * after all nodes have been measured. Used by static embeds (e.g. TechDocs)
   * that render the diagram off-screen and show the resulting image.
   */
  onCapture?: (dataUrl: string) => void;
  /** The container element that holds the off-screen ReactFlow instance.
   *  Required so AutoCapture can scope its `.react-flow__viewport` query. */
  captureContainerEl?: HTMLElement;
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
