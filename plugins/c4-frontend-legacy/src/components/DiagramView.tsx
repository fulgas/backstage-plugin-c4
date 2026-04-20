import React, { useState, useEffect } from 'react';
import { EmptyState, Progress } from '@backstage/core-components';
import { C4DiagramViewer, useEntityC4Views, useC4View } from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import { useNavigate } from 'react-router-dom';

const renderer = new ReactC4Renderer();

function DiagramViewInner({ kind, namespace, name, viewId }: { kind: string; namespace: string; name: string; viewId?: string }) {
  const { descriptors, loading, building } = useEntityC4Views(kind, namespace, name);
  const navigate = useNavigate();

  const selectedViewId = viewId || (descriptors && descriptors.length > 0 ? descriptors[0].id : undefined);
  const { diagram, loading: vmLoading, error } = useC4View(selectedViewId);

  if (building) return <EmptyState missing="data" title="Building diagrams…" description="C4 diagrams are being generated. Please refresh when done." />;
  if (loading) return <Progress />;
  if (!descriptors || descriptors.length === 0) return <EmptyState missing="data" title="No C4 diagrams" description="No C4 diagrams found for this entity." />;

  return (
    <div>
      {descriptors.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {descriptors.map(d => (
            <button
              key={d.id}
              onClick={() => navigate(`/c4/${namespace}/${kind}/${name}/${encodeURIComponent(d.id)}`)}
              style={{ fontWeight: d.id === selectedViewId ? 600 : 'normal', background: 'none', border: '1px solid #ccc', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
      <C4DiagramViewer
        diagram={diagram}
        renderer={renderer}
        loading={vmLoading}
        error={error}
        onNodeClick={(entityRef: string) => {
          // entityRef format: "<kind>:<namespace>/<name>" (Backstage catalog ref)
          // Navigate to that entity's C4 diagram page; viewId is omitted so the
          // page auto-selects the first available diagram (drill-down behaviour).
          const [kindPart, rest] = entityRef.split(':');
          const [ns, nm] = (rest ?? '').split('/');
          if (kindPart && ns && nm) {
            navigate(`/c4/${ns}/${kindPart}/${nm}`);
          }
        }}
      />
    </div>
  );
}

export function DiagramView({ kind, namespace, name, viewId }: { kind: string; namespace: string; name: string; viewId?: string }) {
  return <DiagramViewInner key={`${kind}/${namespace}/${name}`} kind={kind} namespace={namespace} name={name} viewId={viewId} />;
}
