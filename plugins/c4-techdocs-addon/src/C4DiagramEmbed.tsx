import { ErrorPanel, Progress } from '@backstage/core-components';
import { useC4View, useEntityC4Views } from '@fulgas/plugin-c4-frontend-common';
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const renderer = new ReactC4Renderer();

/**
 * Read-only C4 diagram embedded inside a TechDocs page.
 *
 * Renders the diagram off-screen into document.body (not shadow DOM, so React
 * Flow's CSS and measurement work correctly), captures a PNG via html-to-image
 * once all nodes are measured, then shows the static image.
 *
 * Supports two modes:
 *   - `viewId`    — render a specific diagram by its descriptor ID
 *   - `entityRef` — load all diagrams for an entity; show the first by default,
 *                   with a tab strip to switch between levels
 */
export function C4DiagramEmbed(
  props: ({ viewId: string } | { entityRef: string }) & { height?: number },
) {
  const height = props.height ?? 480;

  if ('viewId' in props) {
    return <ByViewId viewId={props.viewId} height={height} />;
  }
  return <ByEntityRef entityRef={props.entityRef} height={height} />;
}

function ByViewId({ viewId, height }: { viewId: string; height: number }) {
  const { diagram, loading, error } = useC4View(viewId);
  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  if (!diagram) return null;
  return <DiagramCapture diagram={diagram} height={height} />;
}

function ByEntityRef({
  entityRef,
  height,
}: {
  entityRef: string;
  height: number;
}) {
  const [kind, rest = ''] = entityRef.split(':');
  const [namespace = 'default', name = ''] = rest.split('/');
  const { descriptors, loading, error } = useEntityC4Views(
    kind,
    namespace,
    name,
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = descriptors?.[selectedIdx];
  const { diagram, loading: dLoading, error: dError } = useC4View(selected?.id);

  if (loading || dLoading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  if (dError) return <ErrorPanel error={dError} />;
  if (!descriptors?.length) return <p>No C4 diagrams for {entityRef}.</p>;
  if (!diagram) return null;

  return (
    <div>
      {descriptors.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {descriptors.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setSelectedIdx(i)}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                border: '1px solid #ccc',
                background: i === selectedIdx ? '#1976d2' : 'white',
                color: i === selectedIdx ? 'white' : 'inherit',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              {d.title}
            </button>
          ))}
        </div>
      )}
      <DiagramCapture key={selected?.id} diagram={diagram} height={height} />
    </div>
  );
}

/**
 * Renders the diagram off-screen in the main document (NOT shadow DOM) so that
 * React Flow's CSS and ResizeObserver work correctly.
 *
 * Once `useNodesInitialized` fires inside AutoCapture, `html-to-image.toPng`
 * captures the viewport element and calls `onCapture` with the data URL.
 * The hidden renderer is then unmounted and the static `<img>` is shown.
 */
function DiagramCapture({ diagram, height }: { diagram: any; height: number }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // useState (not useRef) so setting it triggers a re-render and the portal mounts.
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  // Create off-screen container in document.body (not shadow DOM).
  useEffect(() => {
    const div = document.createElement('div');
    // Off-screen: left:-9999px keeps it invisible. No z-index:-1 — that can
    // suppress painting which breaks html-to-image's canvas capture.
    div.style.cssText =
      'position:fixed;left:-9999px;top:0;width:1400px;height:900px;pointer-events:none;';
    document.body.appendChild(div);
    setContainer(div);
    return () => {
      document.body.removeChild(div);
      setContainer(null);
    };
  }, []);

  const handleCapture = useCallback((dataUrl: string) => {
    setImageUrl(dataUrl);
  }, []);

  return (
    <>
      {/* Off-screen renderer portaled into document.body */}
      {!imageUrl &&
        container &&
        createPortal(
          renderer.render(diagram, {
            readOnly: true,
            onCapture: handleCapture,
            captureContainerEl: container,
          }),
          container,
        )}

      {/* Loading state while capture is in progress */}
      {!imageUrl && (
        <div
          style={{
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid #e0e0e0',
            borderRadius: 4,
          }}
        >
          <Progress />
        </div>
      )}

      {/* Static PNG once captured */}
      {imageUrl && (
        <div style={{ border: '1px solid #e0e0e0', borderRadius: 4 }}>
          <img
            src={imageUrl}
            alt={diagram.descriptor.title}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      )}
    </>
  );
}
