import { ErrorPanel, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import React, { useState } from 'react';
import { mutate } from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4Renderer, C4RenderOptions } from '../renderer/RendererInterface';
import { C4Diagram, C4ViewDisplaySettings } from '../types';

/**
 * Wrapper component that handles loading/error states before delegating
 * rendering to a `C4Renderer` implementation.
 *
 * Edit mode is surfaced through the renderer's own control panel (e.g. the
 * React Flow Controls buttons) rather than a separate toolbar. The viewer
 * passes action callbacks via `C4RenderOptions` and the renderer decides
 * how to expose them visually.
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

  // Avoid array destructuring — rspack's swc-loader would compile it to
  // `var _s = _sliced_to_array(…)` which collides with react-refresh's `_s`.
  const editModeState = useState(false);
  const editMode = editModeState[0];
  const setEditMode = editModeState[1];

  const pendingState = useState<
    Record<string, { x: number; y: number }> | undefined
  >(undefined);
  const pendingPositions = pendingState[0];
  const setPendingPositions = pendingState[1];

  const resetKeyState = useState(0);
  const resetKey = resetKeyState[0];
  const setResetKey = resetKeyState[1];

  const viewId = diagram?.descriptor.id;
  const canSave =
    !!pendingPositions && Object.keys(pendingPositions).length > 0;

  const handleSaveLayout = async () => {
    if (!viewId || !canSave) return;
    await api.saveNodePositions(viewId, pendingPositions!);
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

  const handleCancelEdit = () => {
    setEditMode(false);
    setPendingPositions(undefined);
    setResetKey(k => k + 1);
  };

  const handleSettingsChange = async (settings: C4ViewDisplaySettings) => {
    if (!viewId) return;
    await api.updateViewSettings(viewId, settings);
    await mutate(`c4-diagram-${viewId}`);
    onSettingsChange?.(settings);
  };

  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  return (
    <div style={{ width: '100%' }}>
      {diagram
        ? renderer.render(diagram, {
            onNodeClick: editMode ? undefined : onNodeClick,
            onSettingsChange: handleSettingsChange,
            editMode,
            onPositionsChange: editMode ? setPendingPositions : undefined,
            resetKey,
            onEnterEditMode: diagram ? () => setEditMode(true) : undefined,
            onSaveLayout: editMode ? handleSaveLayout : undefined,
            onResetLayout: editMode ? handleResetLayout : undefined,
            onCancelEdit: editMode ? handleCancelEdit : undefined,
            canSave,
          })
        : null}
    </div>
  );
}
