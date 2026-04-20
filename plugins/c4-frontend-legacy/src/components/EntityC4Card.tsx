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

const renderer = new ReactC4Renderer();

function EntityC4CardInner() {
  const { entity } = useEntity();
  const {
    kind,
    metadata: { namespace = 'default', name },
  } = entity;
  const { descriptors, loading } = useEntityC4Views(kind.toLowerCase(), namespace, name);
  const firstDescriptor = (descriptors ?? [])[0];
  const { diagram, loading: vmLoading } = useC4View(firstDescriptor?.id);

  if (!loading && (!descriptors || descriptors.length === 0)) return null;

  return (
    <InfoCard title="C4 Architecture">
      <div style={{ height: 200, overflow: 'hidden' }}>
        <C4DiagramViewer diagram={diagram} renderer={renderer} loading={loading || vmLoading} />
      </div>
      {!diagram && !loading && !vmLoading && (
        <Text variant="body">No C4 diagrams available</Text>
      )}
    </InfoCard>
  );
}

export function EntityC4Card() {
  return <EntityC4CardInner />;
}
