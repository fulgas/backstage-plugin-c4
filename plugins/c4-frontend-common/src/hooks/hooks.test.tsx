import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiRegistry } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api } from '../api/C4Api';
import { C4ViewDescriptor, C4Diagram } from '../types';
import { useC4Views } from './useC4Views';
import { useEntityC4Views } from './useEntityC4Views';
import { useC4View } from './useC4View';

const descriptor: C4ViewDescriptor = {
  id: 'v1',
  title: 'My System',
  subjectId: 'system:default/my-system',
  source: 'catalog',
  entityRef: 'system:default/my-system',
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

function wrap(api: C4Api) {
  const reg = TestApiRegistry.from([c4ApiRef, api]);
  return ({ children }: { children: React.ReactNode }) => <ApiProvider apis={reg}>{children}</ApiProvider>;
}

describe('useC4Views', () => {
  it('returns descriptors', async () => {
    const { result } = renderHook(() => useC4Views(), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.descriptors).toHaveLength(1);
  });
});

describe('useEntityC4Views', () => {
  it('calls getEntityViewDescriptors with correct args', async () => {
    const api = mockApi();
    const { result } = renderHook(() => useEntityC4Views('system', 'default', 'foo'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getEntityViewDescriptors).toHaveBeenCalledWith('system', 'default', 'foo');
  });
});

describe('useC4View', () => {
  it('returns diagram', async () => {
    const { result } = renderHook(() => useC4View('v1'), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.diagram?.descriptor.id).toBe('v1');
  });
});
