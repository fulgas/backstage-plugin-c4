import React from 'react';
import type { C4Renderer, C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import type { LayoutEngine } from './layout/types';
import { ReactFlowDiagram } from './ReactFlowDiagram';

export interface ReactC4RendererOptions {
  /**
   * Layout engine to use for computing node positions and edge routing.
   *
   * - `'elk'`   (default) — Eclipse Layout Kernel: proper obstacle-avoiding
   *             ORTHOGONAL edge routing; arrows never cross node boxes.
   * - `'dagre'` — simpler two-pass dagre layout; faster but edges may cross.
   */
  layoutEngine?: LayoutEngine;
}

export class ReactC4Renderer implements C4Renderer {
  private readonly layoutEngine: LayoutEngine;

  constructor(options: ReactC4RendererOptions = {}) {
    this.layoutEngine = options.layoutEngine ?? 'elk';
  }

  render(diagram: C4Diagram, options?: C4RenderOptions): React.ReactElement {
    return (
      <ReactFlowDiagram
        diagram={diagram}
        options={options}
        layoutEngine={this.layoutEngine}
      />
    );
  }
}
