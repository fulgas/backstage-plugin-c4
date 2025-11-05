import { Text } from '@backstage/canon';
import { InfoCard } from '@backstage/core-components';
import { type ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { EntityCardBlueprint } from '@backstage/plugin-catalog-react/alpha';
import {
  C4DiagramViewer,
  useC4View,
  useEntityC4Views,
} from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import React from 'react';
import { SWRConfig } from 'swr';

const renderer = new ReactC4Renderer();

function EntityC4CardInner() {
  const { entity } = useEntity();
  const {
    kind,
    metadata: { namespace = 'default', name },
  } = entity;
  const { views, loading } = useEntityC4Views(
    kind.toLowerCase(),
    namespace,
    name,
  );
  const firstView = (views ?? [])[0];
  const { viewModel, loading: vmLoading } = useC4View(firstView?.id);

  if (!loading && (!views || views.length === 0)) return null;

  return (
    <InfoCard title="C4 Architecture">
      <div style={{ height: 200, overflow: 'hidden' }}>
        <C4DiagramViewer
          viewModel={viewModel}
          renderer={renderer}
          loading={loading || vmLoading}
        />
      </div>
      {!viewModel && !loading && !vmLoading && (
        <Text variant="body">No C4 diagrams available</Text>
      )}
    </InfoCard>
  );
}

export function EntityC4CardContent() {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <EntityC4CardInner />
    </SWRConfig>
  );
}

export const EntityC4CardExtension: ExtensionDefinition =
  EntityCardBlueprint.make({
    name: 'c4-card',
    params: {
      filter: 'kind:system,kind:component,kind:domain',
      loader: async () => <EntityC4CardContent />,
    },
  }) as ExtensionDefinition;
