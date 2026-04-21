import { ErrorPanel, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import React, { useState } from 'react';
import { mutate } from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4Renderer, C4RenderOptions } from '../renderer/RendererInterface';
import { C4Diagram, C4ViewDisplaySettings } from '../types';

const btnBase: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 4,
  padding: '3px 10px',
  fontSize: 11,
  cursor: 'pointer',
  background: '#fff',
  color: '#333',
  boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: '#1976d2',
  color: '#fff',
  border: '1px solid #1565c0',
};

/**
 * Wrapper component that handles loading/error states before delegating
 * rendering to a `C4Renderer` implementation.
 *
 * Includes an Edit Layout toolbar that lets users drag nodes and save/reset
 * the layout to the backend. Saved layouts are shared across all users.
 *
 * @example
 * ```tsx
 * const { diagram, loading, error } = useC4View(descriptorId);
 * <C4DiagramViewer diagram={diagram} renderer={myRenderer} loading={loading} error={error} onNodeClick={navigateTo} />
 * ```
 */
export function C4DiagramViewer({
  diagram,
  renderer,
  loading,
  error,
  onNodeClick,
  onSettingsChange,
}: {
  /** The computed diagram to render. */
  diagram: C4Diagram | undefined;
  renderer: C4Renderer;
  loading?: boolean;
  error?: Error;
  onNodeClick?: C4RenderOptions['onNodeClick'];
  onSettingsChange?: (settings: C4ViewDisplaySettings) => void;
}) {
  const api = useApi(c4ApiRef);

  const editModeState = useState(false);
  const editMode = editModeState[0];
  const setEditMode = editModeState[1];

  const pendingState = useState<
    Record<string, { x: number; y: number }> | undefined
  >(undefined);
  const pendingPositions = pendingState[0];
  const setPendingPositions = pendingState[1];

  const layoutKeyState = useState(0);
  const layoutKey = layoutKeyState[0];
  const setLayoutKey = layoutKeyState[1];

  const viewId = diagram?.descriptor.id;

  const handleSaveLayout = async () => {
    if (!viewId || !pendingPositions) return;
    await api.saveNodePositions(viewId, pendingPositions);
    setEditMode(false);
    setPendingPositions(undefined);
  };

  const handleResetLayout = async () => {
    if (!viewId) return;
    await api.resetNodePositions(viewId);
    await mutate(`c4-diagram-${viewId}`);
    setEditMode(false);
    setPendingPositions(undefined);
  };

  const handleCancel = () => {
    setEditMode(false);
    setPendingPositions(undefined);
    setLayoutKey(k => k + 1);
  };

  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginBottom: 8,
        }}
      >
        {editMode ? (
          <>
            <button style={btnBase} onClick={handleResetLayout}>
              Reset Layout
            </button>
            <button style={btnBase} onClick={handleCancel}>
              Cancel
            </button>
            <button
              style={{ ...btnPrimary, opacity: pendingPositions ? 1 : 0.5 }}
              disabled={!pendingPositions}
              onClick={handleSaveLayout}
            >
              Save Layout
            </button>
          </>
        ) : (
          diagram && (
            <button style={btnBase} onClick={() => setEditMode(true)}>
              Edit Layout
            </button>
          )
        )}
      </div>
      {diagram
        ? renderer.render(diagram, {
            onNodeClick: editMode ? undefined : onNodeClick,
            onSettingsChange,
            editMode,
            onPositionsChange: editMode ? setPendingPositions : undefined,
            resetKey: layoutKey,
          })
        : null}
    </div>
  );
}
