import { createApiRef } from '@backstage/core-plugin-api';
import { C4Diagram, C4ViewDescriptor, C4ViewDisplaySettings } from '../types';

/**
 * Frontend API for the C4 backend plugin.
 *
 * Inject via `useApi(c4ApiRef)` or provide a mock in tests.
 * The default implementation is `C4ApiClient`.
 */
export interface C4Api {
  /**
   * Fetch all view descriptors.
   * Returns `{ building: true }` when a first sync is still in progress.
   */
  getViewDescriptors(): Promise<C4ViewDescriptor[] | { building: true }>;

  /**
   * Fetch a fully computed diagram by its descriptor ID.
   * The backend computes the diagram on demand from the node tree.
   */
  getDiagram(id: string): Promise<C4Diagram>;

  /**
   * Fetch view descriptors that belong to a specific Backstage entity.
   * Returns `{ building: true }` when a first sync is still in progress.
   */
  getEntityViewDescriptors(kind: string, namespace: string, name: string): Promise<C4ViewDescriptor[] | { building: true }>;

  /** Trigger an out-of-schedule sync on the backend. */
  triggerSync(): Promise<{ status: string }>;

  /**
   * Persist display settings (direction, spacing) for a view.
   * Settings are shared across all users viewing the same diagram.
   */
  updateViewSettings(viewId: string, settings: C4ViewDisplaySettings): Promise<void>;

  /**
   * Persist node positions for a view. Positions are keyed by React Flow node ID.
   * Replaces any previously saved positions for the view.
   * Settings are shared across all users viewing the same diagram.
   */
  saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void>;

  /**
   * Clear all saved node positions for a view, reverting to ELK auto-layout.
   */
  resetNodePositions(viewId: string): Promise<void>;
}

export const c4ApiRef = createApiRef<C4Api>({ id: 'plugin.c4.service' });
