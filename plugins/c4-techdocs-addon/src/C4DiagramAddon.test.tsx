import { ApiProvider } from '@backstage/core-app-api';
import { errorApiRef } from '@backstage/core-plugin-api';
import { TestApiRegistry } from '@backstage/test-utils';
import {
  C4Api,
  c4ApiRef,
  C4Diagram,
  C4ViewDescriptor,
} from '@fulgas/plugin-c4-frontend-common';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
// Test the internal implementation directly — C4DiagramAddonImpl is a plugin
// extension (createTechDocsAddonExtension) not a plain component.
import { C4DiagramAddonImpl } from './C4DiagramAddon';

jest.mock('./plugin', () => ({
  c4TechDocsAddonPlugin: { provide: (_: any) => _ },
}));

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render(diagram: C4Diagram) {
      return <div data-testid="c4-diagram">{diagram.descriptor.title}</div>;
    }
  },
}));

// useShadowElements (our hook) calls useTechDocsReaderPage().shadowRoot.
// We stub it to return a real DOM element that acts as the shadow root.
// The hook then calls shadowRoot.firstChild.querySelectorAll(selector).
// Tests set _shadowRoot to a div whose firstChild contains the placeholder elements.
let _shadowRoot: HTMLDivElement | null = null;

jest.mock('@backstage/plugin-techdocs-react', () => ({
  useTechDocsReaderPage: () => ({
    shadowRoot: _shadowRoot,
    setShadowRoot: () => {},
  }),
  TechDocsAddonLocations: {
    Content: 'Content',
    Header: 'Header',
    PrimarySidebar: 'PrimarySidebar',
    SecondarySidebar: 'SecondarySidebar',
  },
  createTechDocsAddonExtension: (opts: any) => opts.component,
}));

const descriptor: C4ViewDescriptor = {
  id: 'ordering-ctx',
  title: 'Ordering System Context',
  subjectId: 'system:default/ordering',
  source: 'catalog',
  entityRef: 'system:default/ordering',
};

const diagram: C4Diagram = {
  descriptor,
  nodes: [],
  actors: [],
  relationships: [],
  nodePositions: {},
};

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue([descriptor]),
    getDiagram: jest.fn().mockResolvedValue(diagram),
    getEntityViewDescriptors: jest.fn().mockResolvedValue([descriptor]),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
    updateViewSettings: jest.fn().mockResolvedValue(undefined),
    saveNodePositions: jest.fn().mockResolvedValue(undefined),
    resetNodePositions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const mockErrorApi = { post: jest.fn(), error$: jest.fn() };

function Wrapper({ api, children }: { api: C4Api; children: React.ReactNode }) {
  const reg = TestApiRegistry.from(
    [c4ApiRef, api],
    [errorApiRef, mockErrorApi],
  );
  return <ApiProvider apis={reg}>{children}</ApiProvider>;
}

/**
 * Build a "shadow root" for tests: a real div that acts as the shadow root node.
 * Our hook calls shadowRoot.querySelectorAll(selector) directly, so placeholder
 * elements can be appended anywhere inside this div.
 */
function makeShadowRoot(
  setup?: (root: HTMLDivElement) => void,
): HTMLDivElement {
  const root = document.createElement('div');
  if (setup) setup(root);
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  _shadowRoot = null;
});

describe('C4DiagramAddon', () => {
  it('renders nothing when shadow root is null', () => {
    const { container } = render(
      <Wrapper api={mockApi()}>
        <C4DiagramAddonImpl />
      </Wrapper>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no placeholder elements in shadow DOM', async () => {
    _shadowRoot = makeShadowRoot(); // empty shadow root
    const { container } = render(
      <Wrapper api={mockApi()}>
        <C4DiagramAddonImpl />
      </Wrapper>,
    );
    // Allow effect to run — still empty (no placeholders)
    await new Promise(r => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    document.body.removeChild(_shadowRoot);
  });

  it('hydrates a data-c4-view-id placeholder with the diagram', async () => {
    _shadowRoot = makeShadowRoot(content => {
      const el = document.createElement('div');
      el.setAttribute('data-c4-view-id', 'ordering-ctx');
      content.appendChild(el);
    });

    render(
      <Wrapper api={mockApi()}>
        <C4DiagramAddonImpl />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );

    document.body.removeChild(_shadowRoot);
  });

  it('hydrates a data-c4-entity placeholder and resolves entity views', async () => {
    _shadowRoot = makeShadowRoot(content => {
      const el = document.createElement('div');
      el.setAttribute('data-c4-entity', 'system:default/ordering');
      content.appendChild(el);
    });

    const api = mockApi();
    render(
      <Wrapper api={api}>
        <C4DiagramAddonImpl />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );
    expect(api.getEntityViewDescriptors).toHaveBeenCalledWith(
      'system',
      'default',
      'ordering',
    );

    document.body.removeChild(_shadowRoot);
  });

  it('respects min-height from placeholder style', async () => {
    _shadowRoot = makeShadowRoot(content => {
      const el = document.createElement('div');
      el.setAttribute('data-c4-view-id', 'ordering-ctx');
      el.style.minHeight = '700px';
      content.appendChild(el);
    });

    render(
      <Wrapper api={mockApi()}>
        <C4DiagramAddonImpl />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );
    const placeholder =
      _shadowRoot.querySelector<HTMLDivElement>('[data-c4-view-id]')!;
    const wrapper =
      placeholder.querySelector<HTMLDivElement>('div[style*="700"]');
    expect(wrapper).not.toBeNull();

    document.body.removeChild(_shadowRoot);
  });
});
