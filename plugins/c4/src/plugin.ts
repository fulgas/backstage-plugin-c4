import {
  createPlugin,
  createRoutableExtension,
} from '@backstage/core-plugin-api';
import { rootRouteRef } from './routes';

export const c4Plugin = createPlugin({
  id: 'c4',
  routes: {
    root: rootRouteRef,
  },
});

export const C4Page = c4Plugin.provide(
  createRoutableExtension({
    name: 'C4Page',
    component: () => import('./components/C4Page').then(m => m.C4Page),
    mountPoint: rootRouteRef,
  }),
);
