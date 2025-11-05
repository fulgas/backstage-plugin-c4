// plugins/c4/src/plugin.ts
import {
  createApiFactory,
  createPlugin,
  createRoutableExtension,
  createComponentExtension,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { Entity } from '@backstage/catalog-model';

const C4_SUPPORTED_KINDS = ['Domain', 'System', 'Component'];
export function isC4SupportedEntity(entity: Entity): boolean {
  return C4_SUPPORTED_KINDS.includes(entity.kind);
}
import { c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { C4ApiClient } from './api/C4ApiClient';
import { entityC4RouteRef, c4IndexRouteRef, c4DiagramRouteRef } from './routes';

export const c4Plugin = createPlugin({
  id: 'c4',
  routes: { entityC4: entityC4RouteRef, c4Index: c4IndexRouteRef, c4Diagram: c4DiagramRouteRef },
  apis: [
    createApiFactory({
      api: c4ApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) => new C4ApiClient(discoveryApi, fetchApi),
    }),
  ],
});

export const C4IndexPage = c4Plugin.provide(
  createRoutableExtension({
    name: 'C4IndexPage',
    component: () => import('./components/C4Page').then(m => m.C4Page),
    mountPoint: c4IndexRouteRef,
  }),
);

export const EntityC4Tab = c4Plugin.provide(
  createRoutableExtension({
    name: 'EntityC4Tab',
    component: () => import('./components/EntityC4Tab').then(m => m.EntityC4Tab),
    mountPoint: entityC4RouteRef,
  }),
);

export const EntityC4Card = c4Plugin.provide(
  createComponentExtension({
    name: 'EntityC4Card',
    component: { lazy: () => import('./components/EntityC4Card').then(m => m.EntityC4Card) },
  }),
);

export const C4DiagramPage = c4Plugin.provide(
  createRoutableExtension({
    name: 'C4DiagramPage',
    component: () => import('./components/C4DiagramPage').then(m => m.C4DiagramPage),
    mountPoint: c4DiagramRouteRef,
  }),
);
