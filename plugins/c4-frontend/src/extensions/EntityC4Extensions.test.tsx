// plugins/c4-module/src/extensions/EntityC4Extensions.test.tsx
// eslint-disable-next-line no-restricted-syntax
import { Entity } from '@backstage/catalog-model';
import { ApiProvider } from '@backstage/core-app-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { C4Api, c4ApiRef, C4ViewModel } from '@fulgas/plugin-c4-frontend-common';
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
const vm: C4ViewModel = {
  view: {
    id: 'v1',
    type: 'context',
    title: 'Context',
    entityRefs: [],
    relationshipIds: [],
    source: 'catalog',
    entityRef: 'system:default/my-system',
  },
  model: {
    persons: [],
    systems: [],
    containers: [],
    components: [],
    relationships: [],
    views: [],
  },
};

function mockApi(views: any[] = [vm.view]): C4Api {
  return {
    getViews: jest.fn().mockResolvedValue(views),
    getView: jest.fn().mockResolvedValue(vm),
    getEntityViews: jest.fn().mockResolvedValue(views),
    getLandscape: jest.fn().mockResolvedValue(vm),
    getViewHistory: jest.fn().mockResolvedValue([]),
    getViewDiff: jest
      .fn()
      .mockResolvedValue({ added: {}, removed: {}, changed: {} }),
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
  it('renders Auto-generated tab', async () => {
    render(<EntityC4TabContent />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() =>
      expect(screen.getByText('Auto-generated')).toBeTruthy(),
    );
  });

  it('shows annotation hint when no DSL views', async () => {
    render(<EntityC4TabContent />, {
      wrapper: wrap(mockApi([{ ...vm.view, source: 'catalog' }])) as any,
    });
    await waitFor(() =>
      expect(screen.getByText(/fulgas.io\/c4-model/i)).toBeTruthy(),
    );
  });
});

describe('EntityC4CardContent', () => {
  it('returns null when no views', async () => {
    const { container } = render(<EntityC4CardContent />, {
      wrapper: wrap(mockApi([])) as any,
    });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders card with link when views exist', async () => {
    render(<EntityC4CardContent />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() =>
      expect(screen.getByText(/C4 Architecture/i)).toBeTruthy(),
    );
  });
});
