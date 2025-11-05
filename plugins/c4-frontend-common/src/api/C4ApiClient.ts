import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { C4Api } from './C4Api';
import { C4Diagram, C4ViewDescriptor } from '../types';

export class C4ApiClient implements C4Api {
  constructor(private readonly options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {}

  private async base(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl('c4');
  }

  async getViewDescriptors(): Promise<C4ViewDescriptor[] | { building: true }> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/views`)).json();
  }

  async getDiagram(id: string): Promise<C4Diagram> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/views/${id}`)).json();
  }

  async getEntityViewDescriptors(kind: string, namespace: string, name: string): Promise<C4ViewDescriptor[] | { building: true }> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/entity/${kind}/${namespace}/${name}/views`)).json();
  }

  async triggerSync(): Promise<{ status: string }> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/sync`, { method: 'POST' })).json();
  }
}
