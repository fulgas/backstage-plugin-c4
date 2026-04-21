import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { C4Diagram, C4ViewDescriptor, C4ViewDisplaySettings } from '../types';
import { C4Api } from './C4Api';

export class C4ApiClient implements C4Api {
  constructor(
    private readonly options: {
      discoveryApi: DiscoveryApi;
      fetchApi: FetchApi;
    },
  ) {}

  private async base(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl('c4');
  }

  async getViewDescriptors(): Promise<C4ViewDescriptor[] | { building: true }> {
    return (
      await this.options.fetchApi.fetch(`${await this.base()}/views`)
    ).json();
  }

  async getDiagram(id: string): Promise<C4Diagram> {
    return (
      await this.options.fetchApi.fetch(
        `${await this.base()}/views/${encodeURIComponent(id)}`,
      )
    ).json();
  }

  async getEntityViewDescriptors(
    kind: string,
    namespace: string,
    name: string,
  ): Promise<C4ViewDescriptor[] | { building: true }> {
    return (
      await this.options.fetchApi.fetch(
        `${await this.base()}/entity/${encodeURIComponent(
          kind,
        )}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/views`,
      )
    ).json();
  }

  async triggerSync(): Promise<{ status: string }> {
    return (
      await this.options.fetchApi.fetch(`${await this.base()}/sync`, {
        method: 'POST',
      })
    ).json();
  }

  async updateViewSettings(
    viewId: string,
    settings: C4ViewDisplaySettings,
  ): Promise<void> {
    await this.options.fetchApi.fetch(
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
    await this.options.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/positions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      },
    );
  }

  async resetNodePositions(viewId: string): Promise<void> {
    await this.options.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/positions`,
      { method: 'DELETE' },
    );
  }
}
