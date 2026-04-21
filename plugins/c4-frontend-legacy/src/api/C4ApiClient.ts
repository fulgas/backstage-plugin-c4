import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { C4Api } from '@fulgas/plugin-c4-frontend-common';
import { C4Diagram, C4ViewDescriptor } from '@fulgas/plugin-c4-node';

export class C4ApiClient implements C4Api {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  private async base(): Promise<string> {
    return this.discoveryApi.getBaseUrl('c4');
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchApi.fetch(`${await this.base()}${path}`);
    if (res.status === 202) return res.json();
    if (!res.ok) throw new Error(`C4 API ${res.status}: ${path}`);
    return res.json();
  }

  async getViewDescriptors(): Promise<C4ViewDescriptor[] | { building: true }> {
    return this.get('/views');
  }

  async getDiagram(id: string): Promise<C4Diagram> {
    return this.get(`/views/${encodeURIComponent(id)}`);
  }

  async getEntityViewDescriptors(
    kind: string,
    namespace: string,
    name: string,
  ): Promise<C4ViewDescriptor[] | { building: true }> {
    return this.get(
      `/entity/${encodeURIComponent(kind)}/${encodeURIComponent(
        namespace,
      )}/${encodeURIComponent(name)}/views`,
    );
  }

  async triggerSync(): Promise<{ status: string }> {
    const res = await this.fetchApi.fetch(`${await this.base()}/sync`, {
      method: 'POST',
    });
    return res.json();
  }

  async updateViewSettings(
    viewId: string,
    settings: import('@fulgas/plugin-c4-node').C4ViewDisplaySettings,
  ): Promise<void> {
    await this.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/settings`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      },
    );
  }

  async saveNodePositions(
    viewId: string,
    positions: Record<string, { x: number; y: number }>,
  ): Promise<void> {
    await this.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/positions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      },
    );
  }

  async resetNodePositions(viewId: string): Promise<void> {
    await this.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/positions`,
      {
        method: 'DELETE',
      },
    );
  }
}
