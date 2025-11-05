import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiRegistry } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api } from '../api/C4Api';
import { C4View, C4ViewModel } from '../types';
import { useC4Views } from './useC4Views';
import { useEntityC4Views } from './useEntityC4Views';
import { useC4View } from './useC4View';

const view: C4View = { id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' };
const vm: C4ViewModel = { view, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  return { getViews: jest.fn().mockResolvedValue([view]), getView: jest.fn().mockResolvedValue(vm), getEntityViews: jest.fn().mockResolvedValue([view]), getLandscape: jest.fn().mockResolvedValue(vm), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }), ...overrides };
}

function wrap(api: C4Api) {
  const reg = TestApiRegistry.from([c4ApiRef, api]);
  return ({ children }: { children: React.ReactNode }) => <ApiProvider apis={reg}>{children}</ApiProvider>;
}

describe('useC4Views', () => {
  it('returns views', async () => {
    const { result } = renderHook(() => useC4Views(), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.views).toHaveLength(1);
  });
});

describe('useEntityC4Views', () => {
  it('calls getEntityViews with correct args', async () => {
    const api = mockApi();
    const { result } = renderHook(() => useEntityC4Views('system', 'default', 'foo'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getEntityViews).toHaveBeenCalledWith('system', 'default', 'foo');
  });
});

describe('useC4View', () => {
  it('returns viewModel', async () => {
    const { result } = renderHook(() => useC4View('v1'), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.viewModel?.view.id).toBe('v1');
  });
});

