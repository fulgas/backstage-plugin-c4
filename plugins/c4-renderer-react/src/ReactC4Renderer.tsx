import React from 'react';
import type { C4Renderer, C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import { ReactFlowDiagram } from './ReactFlowDiagram';

export class ReactC4Renderer implements C4Renderer {
  render(diagram: C4Diagram, options?: C4RenderOptions): React.ReactElement {
    return <ReactFlowDiagram diagram={diagram} options={options} />;
  }
}
