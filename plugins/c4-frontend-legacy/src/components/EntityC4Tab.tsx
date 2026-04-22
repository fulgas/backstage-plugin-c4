import { EmptyState } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { DiagramView } from './DiagramView';

const SUPPORTED_KINDS = ['domain', 'system', 'component'];

export function EntityC4Tab() {
  const { entity } = useEntity();
  const {
    kind,
    metadata: { namespace = 'default', name },
  } = entity;
  if (!SUPPORTED_KINDS.includes(kind.toLowerCase())) {
    return (
      <EmptyState
        missing="data"
        title="No C4 diagrams"
        description={`C4 diagrams are not available for ${kind} entities.`}
      />
    );
  }
  return (
    <DiagramView kind={kind.toLowerCase()} namespace={namespace} name={name} />
  );
}
