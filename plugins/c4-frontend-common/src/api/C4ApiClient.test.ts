import { C4ApiClient } from './C4ApiClient';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

function mockDiscovery(): jest.Mocked<DiscoveryApi> {
  return { getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/c4') } as any;
}
function mockFetch(body: unknown): jest.Mocked<FetchApi> {
  return { fetch: jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(body) }) } as any;
}

describe('C4ApiClient', () => {
  it('getViews calls GET /views', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViews();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views');
  });

  it('getViews passes level param', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViews({ level: 'landscape' });
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views?level=landscape');
  });

  it('getLandscape calls GET /landscape', async () => {
    const fetchApi = mockFetch({ view: {}, model: {} });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getLandscape();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/landscape');
  });

  it('getEntityViews calls correct URL', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getEntityViews('system', 'default', 'my-system');
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/entity/system/default/my-system/views');
  });

  it('triggerSync calls POST /sync', async () => {
    const fetchApi = mockFetch({ status: 'started' });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.triggerSync();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/sync', expect.objectContaining({ method: 'POST' }));
  });
});
