import React from 'react';
import { C4Diagram } from '../types';

/** Options passed from the viewer component to the renderer. */
export interface C4RenderOptions {
  /** Called when the user clicks a node. Receives the node's `catalogEntityRef` if set, otherwise its `id`. */
  onNodeClick?: (entityRef: string) => void;
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
