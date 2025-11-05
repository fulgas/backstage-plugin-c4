import { Text } from '@backstage/canon';
import { InfoCard } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
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
  const { viewModel } = useC4View(firstView?.id);

  if (!loading && (!views || views.length === 0)) return null;

  return (
    <InfoCard title="C4 Architecture">
      <div style={{ height: 200, overflow: 'hidden' }}>
        <C4DiagramViewer
          viewModel={viewModel}
          renderer={renderer}
          loading={loading}
        />
      </div>
      {!viewModel && !loading && (
        <Text variant="body">No C4 diagrams available</Text>
      )}
    </InfoCard>
  );
}

export function EntityC4Card() {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <EntityC4CardInner />
    </SWRConfig>
  );
}
