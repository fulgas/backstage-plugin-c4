import {
  ApiBlueprint,
  createApiFactory,
  createFrontendPlugin,
  discoveryApiRef,
  fetchApiRef,
  type FrontendPlugin,
} from '@backstage/frontend-plugin-api';
import { C4ApiClient, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { C4PageExtension } from './extensions/C4PageExtension';
import { EntityC4CardExtension } from './extensions/EntityC4CardExtension';
import { EntityC4TabExtension } from './extensions/EntityC4TabExtension';

const c4ApiExtension = ApiBlueprint.make({
  params: defineParams =>
    defineParams(
      createApiFactory({
        api: c4ApiRef,
        deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
        factory: ({ discoveryApi, fetchApi }) =>
          new C4ApiClient({ discoveryApi, fetchApi }),
      }),
    ),
});

export const c4FrontendPlugin: FrontendPlugin = createFrontendPlugin({
  pluginId: 'c4',
  extensions: [
    c4ApiExtension,
    C4PageExtension,
    EntityC4TabExtension,
    EntityC4CardExtension,
  ],
}) as FrontendPlugin;
