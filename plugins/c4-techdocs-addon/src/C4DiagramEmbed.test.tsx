import { ApiProvider } from '@backstage/core-app-api';
import { TestApiRegistry } from '@backstage/test-utils';
import {
  C4Api,
  c4ApiRef,
  C4Diagram,
  C4ViewDescriptor,
} from '@fulgas/plugin-c4-frontend-common';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { SWRConfig } from 'swr';
import { C4DiagramEmbed } from './C4DiagramEmbed';

jest.mock('@backstage/core-components', () => ({
  Progress: () => <div data-testid="c4-progress" />,
  ErrorPanel: ({ error }: { error: Error }) => (
    <div data-testid="c4-error">{error.message}</div>
  ),
}));

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render(diagram: C4Diagram) {
      return <div data-testid="c4-diagram">{diagram.descriptor.title}</div>;
    }
  },
}));

const makeDescriptor = (id: string, title: string): C4ViewDescriptor => ({
  id,
  title,
  subjectId: `system:default/${id}`,
  source: 'catalog',
  entityRef: `system:default/${id}`,
});

const makeDiagram = (descriptor: C4ViewDescriptor): C4Diagram => ({
  descriptor,
  nodes: [],
  actors: [],
  relationships: [],
  nodePositions: {},
});

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  const d1 = makeDescriptor('ordering', 'Ordering — System Context');
  const d2 = makeDescriptor('ordering-container', 'Ordering — Container');
  return {
    getViewDescriptors: jest.fn().mockResolvedValue([d1, d2]),
    getDiagram: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve(makeDiagram(makeDescriptor(id, `Diagram ${id}`))),
      ),
    getEntityViewDescriptors: jest.fn().mockResolvedValue([d1, d2]),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
    updateViewSettings: jest.fn().mockResolvedValue(undefined),
    saveNodePositions: jest.fn().mockResolvedValue(undefined),
    resetNodePositions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Fresh SWR cache per test to prevent cross-test cache pollution.
function wrap(api: C4Api) {
  const reg = TestApiRegistry.from([c4ApiRef, api]);
  return ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => new Map() }}>
      <ApiProvider apis={reg}>{children}</ApiProvider>
    </SWRConfig>
  );
}

describe('C4DiagramEmbed — viewId mode', () => {
  it('renders the diagram when loaded by view ID', async () => {
    const api = mockApi();
    render(<C4DiagramEmbed viewId="ordering" />, { wrapper: wrap(api) });

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );
    expect(api.getDiagram).toHaveBeenCalledWith('ordering');
  });

  it('shows progress while loading', () => {
    const api = mockApi({
      getDiagram: jest.fn(() => new Promise(() => {})),
    });
    render(<C4DiagramEmbed viewId="ordering" />, { wrapper: wrap(api) });
    expect(screen.queryByTestId('c4-diagram')).not.toBeInTheDocument();
  });

  it('shows error panel and no diagram when fetch fails', async () => {
    const api = mockApi({
      getDiagram: jest.fn().mockRejectedValue(new Error('Network error')),
    });
    render(<C4DiagramEmbed viewId="ordering" />, { wrapper: wrap(api) });
    await waitFor(() =>
      expect(screen.getByTestId('c4-error')).toBeInTheDocument(),
    );
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.queryByTestId('c4-diagram')).not.toBeInTheDocument();
  });
});

describe('C4DiagramEmbed — entityRef mode', () => {
  it('renders diagram and shows tab strip for multiple views', async () => {
    const api = mockApi();
    render(<C4DiagramEmbed entityRef="system:default/ordering" />, {
      wrapper: wrap(api),
    });

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /Ordering — System Context/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Ordering — Container/i }),
    ).toBeInTheDocument();
  });

  it('switches diagram when tab is clicked', async () => {
    const user = userEvent.setup();
    const api = mockApi();
    render(<C4DiagramEmbed entityRef="system:default/ordering" />, {
      wrapper: wrap(api),
    });

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: /Ordering — Container/i }),
    );

    await waitFor(() =>
      expect(api.getDiagram).toHaveBeenCalledWith('ordering-container'),
    );
  });

  it('shows fallback when no views exist', async () => {
    const api = mockApi({
      getEntityViewDescriptors: jest.fn().mockResolvedValue([]),
    });
    render(<C4DiagramEmbed entityRef="system:default/unknown" />, {
      wrapper: wrap(api),
    });

    await waitFor(() =>
      expect(
        screen.getByText(/No C4 diagrams for system:default\/unknown/i),
      ).toBeInTheDocument(),
    );
  });

  it('hides tab strip when only one view exists', async () => {
    const d = makeDescriptor('ordering', 'Ordering — System Context');
    const api = mockApi({
      getEntityViewDescriptors: jest.fn().mockResolvedValue([d]),
    });
    render(<C4DiagramEmbed entityRef="system:default/ordering" />, {
      wrapper: wrap(api),
    });

    await waitFor(() =>
      expect(screen.getByTestId('c4-diagram')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
