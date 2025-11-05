import React from 'react';
import type { C4Renderer, C4RenderOptions, C4ViewModel } from '@fulgas/plugin-c4-frontend-common';

export class ReactC4Renderer implements C4Renderer {
  render(viewModel: C4ViewModel, _options?: C4RenderOptions): React.ReactElement {
    return <div data-testid="c4-diagram">{viewModel.view.title}</div>;
  }
}
