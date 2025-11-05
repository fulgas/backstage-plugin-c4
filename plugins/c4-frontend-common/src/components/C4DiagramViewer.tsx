import React from 'react';
import { ErrorPanel, Progress } from '@backstage/core-components';
import { C4Renderer, C4RenderOptions } from '../renderer/RendererInterface';
import { C4Diagram } from '../types';

/**
 * Wrapper component that handles loading/error states before delegating
 * rendering to a `C4Renderer` implementation.
 *
 * @example
 * ```tsx
 * const { diagram, loading, error } = useC4View(descriptorId);
 * <C4DiagramViewer diagram={diagram} renderer={myRenderer} loading={loading} error={error} onNodeClick={navigateTo} />
 * ```
 */
export function C4DiagramViewer({ diagram, renderer, loading, error, onNodeClick }: {
  /** The computed diagram to render. */
  diagram: C4Diagram | undefined;
  renderer: C4Renderer;
  loading?: boolean;
  error?: Error;
  onNodeClick?: C4RenderOptions['onNodeClick'];
}) {
  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  return (
    <div style={{ width: '100%' }}>
      {diagram ? renderer.render(diagram, { onNodeClick }) : null}
    </div>
  );
}
