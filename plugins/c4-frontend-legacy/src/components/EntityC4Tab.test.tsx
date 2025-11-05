import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { c4ApiRef, C4Api, C4ViewModel } from '@fulgas/plugin-c4-frontend-common';
import { EntityC4Tab } from './EntityC4Tab';

jest.mock('@fulgas/plugin-c4-renderer-react', () => ({
  ReactC4Renderer: class {
    render() { return <div data-testid="mock-diagram" />; }
  },
}));

const systemEntity: Entity = { apiVersion: 'backstage.io/v1alpha1', kind: 'System', metadata: { name: 'my-system', namespace: 'default' }, spec: { owner: 'team-a' }, relations: [] };
const vm: C4ViewModel = { view: { id: 'v1', type: 'context', title: 'Context', entityRefs: [], relationshipIds: [], source: 'catalog', entityRef: 'system:default/my-system' }, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(views: any[] = [vm.view]): C4Api {
  return { getViews: jest.fn().mockResolvedValue(views), getView: jest.fn().mockResolvedValue(vm), getEntityViews: jest.fn().mockResolvedValue(views), getLandscape: jest.fn().mockResolvedValue(vm), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }) };
}

function wrap(api: C4Api, entity = systemEntity) {
  return ({ children }: { children: React.ReactNode }) => (
    wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}><EntityProvider entity={entity}>{children}</EntityProvider></ApiProvider>)
  );
}

describe('EntityC4Tab', () => {
  it('renders progress while redirecting', async () => {
    const { container } = render(<EntityC4Tab />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(container.firstChild).toBeTruthy());
  });
});
