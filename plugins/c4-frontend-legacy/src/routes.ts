import { createRouteRef } from '@backstage/core-plugin-api';

export const entityC4RouteRef = createRouteRef({ id: 'c4.entity' });

export const c4IndexRouteRef = createRouteRef({ id: 'c4.index' });

export const c4DiagramRouteRef = createRouteRef({
  id: 'c4.diagram',
  params: ['namespace', 'kind', 'name', 'viewId'],
});
