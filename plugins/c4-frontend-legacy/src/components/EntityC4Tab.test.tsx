import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { c4ApiRef, C4Api } from '@fulgas/plugin-c4-frontend-common';
import { EntityC4Tab } from './EntityC4Tab';

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render() { return <div data-testid="mock-diagram" />; }
  },
}));

const systemEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'my-system', namespace: 'default' },
  spec: { owner: 'team-a' },
  relations: [],
};

function mockApi(): C4Api {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue([]),
    getDiagram: jest.fn().mockResolvedValue(undefined),
    getEntityViewDescriptors: jest.fn().mockResolvedValue([]),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
  };
}

function wrap(api: C4Api, entity = systemEntity) {
  return ({ children }: { children: React.ReactNode }) => (
    wrapInTestApp(
      <ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}>
        <EntityProvider entity={entity}>{children}</EntityProvider>
      </ApiProvider>
    )
  );
}

describe('EntityC4Tab', () => {
  it('renders without crashing', async () => {
    const { container } = render(<EntityC4Tab />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });
});
