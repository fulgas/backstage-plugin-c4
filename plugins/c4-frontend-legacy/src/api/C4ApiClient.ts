import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { C4Api } from '@fulgas/plugin-c4-frontend-common';
import { C4View, C4ViewModel, C4ViewType } from '@fulgas/plugin-c4-frontend-common';

export class C4ApiClient implements C4Api {
  constructor(
    private readonly discoveryApi: DiscoveryApi,
    private readonly fetchApi: FetchApi,
  ) {}

  private async baseUrl(): Promise<string> {
    return this.discoveryApi.getBaseUrl('c4');
  }

  private async get<T>(path: string): Promise<T | { building: true }> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}${path}`);
    if (res.status === 202) return { building: true } as { building: true };
    if (!res.ok) throw new Error(`C4 API error ${res.status}: ${path}`);
    return res.json();
  }

  private async post<T>(path: string): Promise<T> {
    const base = await this.baseUrl();
    const res = await this.fetchApi.fetch(`${base}${path}`, { method: 'POST' });
    if (!res.ok) throw new Error(`C4 API error ${res.status}: ${path}`);
    return res.json();
  }

  async getViews(opts?: { level?: C4ViewType; domain?: string }): Promise<C4View[] | { building: true }> {
    const params = new URLSearchParams();
    if (opts?.level) params.set('type', opts.level);
    if (opts?.domain) params.set('domain', opts.domain);
    const qs = params.toString() ? `?${params}` : '';
    return this.get(`/views${qs}`);
  }

  async getView(id: string): Promise<C4ViewModel> {
    return this.get(`/views/${encodeURIComponent(id)}`) as Promise<C4ViewModel>;
  }

  async getEntityViews(kind: string, namespace: string, name: string): Promise<C4View[] | { building: true }> {
    return this.get(`/entity/${encodeURIComponent(kind)}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/views`);
  }

  async getLandscape(): Promise<C4ViewModel | { building: true }> {
    return this.get('/landscape');
  }

  async triggerSync(): Promise<{ status: string }> {
    return this.post('/sync');
  }
}
