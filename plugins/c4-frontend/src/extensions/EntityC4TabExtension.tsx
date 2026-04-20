import { EmptyState, Progress } from '@backstage/core-components';
import { type ExtensionDefinition } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { EntityContentBlueprint } from '@backstage/plugin-catalog-react/alpha';
import { C4DiagramViewer, useC4View, useEntityC4Views } from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import React, { useState, useCallback } from 'react';

const renderer = new ReactC4Renderer();

function parseRef(ref: string): { kind: string; namespace: string; name: string } | null {
  const m = ref.match(/^([^:]+):([^/]+)\/(.+)$/);
  if (!m) return null;
  return { kind: m[1], namespace: m[2], name: m[3] };
}

type NavEntry = { kind: string; namespace: string; name: string; label: string };

function EntityViewById({ viewKind, namespace, name, onNodeClick }: {
  viewKind: string; namespace: string; name: string;
  onNodeClick: (ref: string, label: string) => void;
}) {
  const { descriptors, loading, building } = useEntityC4Views(viewKind, namespace, name);
  const viewId = descriptors?.[0]?.id;
  const { diagram, loading: vmLoading, error } = useC4View(viewId);

  const handleNavigate = useCallback((catalogEntityRef: string) => {
    const parsed = parseRef(catalogEntityRef);
    if (!parsed) return;
    onNodeClick(catalogEntityRef, parsed.name);
  }, [onNodeClick]);

  if (building) return <EmptyState missing="data" title="Building diagrams…" description="C4 diagrams are being generated. Please refresh the page when done." />;
  if (loading) return <Progress />;
  if (!descriptors || descriptors.length === 0) return <EmptyState missing="data" title="No C4 diagrams" description="No C4 diagrams found for this entity." />;
  return <C4DiagramViewer diagram={diagram} renderer={renderer} loading={vmLoading} error={error} onNodeClick={handleNavigate} />;
}

export function EntityC4TabContent() {
  const { entity } = useEntity();
  const { kind, metadata: { namespace = 'default', name } } = entity;
  const [stack, setStack] = useState<NavEntry[]>([]);

  const current = stack.length > 0 ? stack[stack.length - 1] : null;
  const viewKind = current ? current.kind : kind.toLowerCase();
  const viewNamespace = current ? current.namespace : namespace;
  const viewName = current ? current.name : name;

  const handleNavigate = useCallback((ref: string, label: string) => {
    const parsed = parseRef(ref);
    if (!parsed) return;
    setStack(s => [...s, { kind: parsed.kind, namespace: parsed.namespace, name: parsed.name, label }]);
  }, []);

  const handleBreadcrumb = useCallback((index: number) => {
    setStack(s => s.slice(0, index));
  }, []);

  return (
    <div style={{ width: '100%' }}>
      {stack.length > 0 && (
        <nav style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12, fontSize: 13, flexWrap: 'wrap' }}>
          <button onClick={() => handleBreadcrumb(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1168bd', padding: '2px 4px', fontSize: 13 }}>
            {name}
          </button>
          {stack.map((entry, i) => (
            <React.Fragment key={i}>
              <span style={{ color: '#999' }}>›</span>
              {i < stack.length - 1 ? (
                <button onClick={() => handleBreadcrumb(i + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1168bd', padding: '2px 4px', fontSize: 13 }}>
                  {entry.label}
                </button>
              ) : (
                <span style={{ padding: '2px 4px', fontWeight: 600 }}>{entry.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <EntityViewById
        key={`${viewKind}/${viewNamespace}/${viewName}`}
        viewKind={viewKind}
        namespace={viewNamespace}
        name={viewName}
        onNodeClick={handleNavigate}
      />
    </div>
  );
}

export const EntityC4TabExtension: ExtensionDefinition =
  EntityContentBlueprint.make({
    name: 'c4-tab',
    params: {
      path: '/c4',
      title: 'C4 Architecture',
      filter: 'kind:system,kind:component,kind:domain',
      loader: async () => <EntityC4TabContent />,
    },
  }) as ExtensionDefinition;
