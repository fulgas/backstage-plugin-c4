import React, { useState, useEffect } from 'react';
import { EmptyState, Progress } from '@backstage/core-components';
import { C4DiagramViewer, useEntityC4Views, useC4View } from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import { SWRConfig } from 'swr';

const renderer = new ReactC4Renderer();

const TYPE_ORDER: Record<string, number> = { landscape: 0, context: 1, container: 2, component: 3 };

export function bestViewId(kind: string, views: { id: string; type: string }[]): string | undefined {
  const sorted = [...views].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  if (kind === 'domain') return sorted.find(v => v.type === 'landscape')?.id ?? sorted[0]?.id;
  if (kind === 'system') return sorted.find(v => v.type === 'context')?.id ?? sorted[0]?.id;
  return sorted.find(v => v.type === 'container')?.id ?? sorted[0]?.id;
}

function DiagramViewInner({ kind, namespace, name }: { kind: string; namespace: string; name: string }) {
  const { views, loading, building } = useEntityC4Views(kind, namespace, name);
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>();
  const { viewModel, loading: vmLoading, error } = useC4View(selectedViewId);

  useEffect(() => {
    if (views && views.length > 0 && !selectedViewId) {
      setSelectedViewId(bestViewId(kind, views));
    }
  }, [views, kind, selectedViewId]);

  if (building) return <EmptyState missing="data" title="Building diagrams…" description="C4 diagrams are being generated. Please refresh when done." />;
  if (loading) return <Progress />;
  if (!views || views.length === 0) return <EmptyState missing="data" title="No C4 diagrams" description="No C4 diagrams found for this entity." />;

  return <C4DiagramViewer viewModel={viewModel} renderer={renderer} loading={vmLoading} error={error} />;
}

export function DiagramView({ kind, namespace, name }: { kind: string; namespace: string; name: string }) {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <DiagramViewInner key={`${kind}/${namespace}/${name}`} kind={kind} namespace={namespace} name={name} />
    </SWRConfig>
  );
}
