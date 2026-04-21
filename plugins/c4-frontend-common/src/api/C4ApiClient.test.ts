import { C4ApiClient } from './C4ApiClient';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

function mockDiscovery(): jest.Mocked<DiscoveryApi> {
  return { getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/c4') } as any;
}
function mockFetch(body: unknown): jest.Mocked<FetchApi> {
  return { fetch: jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(body) }) } as any;
}

describe('C4ApiClient', () => {
  it('getViewDescriptors calls GET /views', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViewDescriptors();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views');
  });

  it('getDiagram calls GET /views/:id', async () => {
    const fetchApi = mockFetch({});
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getDiagram('v1');
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views/v1');
  });

  it('getEntityViewDescriptors calls correct URL', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getEntityViewDescriptors('system', 'default', 'my-system');
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/entity/system/default/my-system/views');
  });

  it('triggerSync calls POST /sync', async () => {
    const fetchApi = mockFetch({ status: 'started' });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.triggerSync();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/sync', expect.objectContaining({ method: 'POST' }));
  });

  it('updateViewSettings calls PATCH /views/:id/settings', async () => {
    const fetchApi = mockFetch(undefined);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.updateViewSettings('v1', { direction: 'LR' });
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views/v1/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('saveNodePositions calls PUT /views/:id/positions', async () => {
    const fetchApi = mockFetch({ status: 'ok' });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.saveNodePositions('v1', { 'node-a': { x: 10, y: 20 } });
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views/v1/positions',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('resetNodePositions calls DELETE /views/:id/positions', async () => {
    const fetchApi = mockFetch({ status: 'ok' });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.resetNodePositions('v1');
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views/v1/positions',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
