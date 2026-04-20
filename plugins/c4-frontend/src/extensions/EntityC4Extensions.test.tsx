import { Entity } from '@backstage/catalog-model';
import { ApiProvider } from '@backstage/core-app-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { C4Api, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { EntityC4CardContent } from './EntityC4CardExtension';
import { EntityC4TabContent } from './EntityC4TabExtension';

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render() { return <div data-testid="mock-diagram" />; }
  },
}));

const entity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'my-system', namespace: 'default' },
  spec: { owner: 'team-a' },
  relations: [],
};

const descriptor = {
  id: 'v1',
  title: 'My System',
  subjectId: 'system:default/my-system',
  source: 'catalog',
  entityRef: 'system:default/my-system',
};

function mockApi(descriptors: any[] = [descriptor]): C4Api {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue(descriptors),
    getDiagram: jest.fn().mockResolvedValue(undefined),
    getEntityViewDescriptors: jest.fn().mockResolvedValue(descriptors),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
  };
}

function wrap(api: C4Api) {
  return ({ children }: { children: React.ReactNode }) =>
    wrapInTestApp(
      <ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}>
        <EntityProvider entity={entity}>{children}</EntityProvider>
      </ApiProvider>,
    );
}

describe('EntityC4TabContent', () => {
  it('renders without crashing', async () => {
    const { container } = render(<EntityC4TabContent />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });
});

describe('EntityC4CardContent', () => {
  it('returns null when no descriptors', async () => {
    const { container } = render(<EntityC4CardContent />, {
      wrapper: wrap(mockApi([])) as any,
    });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders card when descriptors exist', async () => {
    render(<EntityC4CardContent />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(screen.getByText(/C4 Architecture/i)).toBeTruthy());
  });
});
