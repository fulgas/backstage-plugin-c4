import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';

export const c4Plugin = createBackendPlugin({
  pluginId: 'c4',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        cache: coreServices.cache,
        discovery: coreServices.discovery,
      },
      async init({ logger, config, httpRouter, cache, discovery }) {
        logger.info('C4 backend plugin initialized');

        // TODO: Initialize services and register routes
      },
    });
  },
});

export default c4Plugin;
