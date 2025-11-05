import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4ViewDescriptor } from '../types';

/**
 * Fetch all C4 view descriptors from the backend.
 *
 * Returns `building: true` while the first sync is still in progress.
 * Poll by setting `refreshInterval` (milliseconds).
 *
 * @example
 * ```tsx
 * const { descriptors, loading, building } = useC4Views();
 * ```
 */
export function useC4Views(opts?: { refreshInterval?: number }) {
  const api = useApi(c4ApiRef);
  const { data, error, mutate } = useSWR('c4-view-descriptors', () => api.getViewDescriptors(), {
    refreshInterval: opts?.refreshInterval ?? 0,
  });
  const building = data != null && !Array.isArray(data) && (data as any).building === true;
  return {
    descriptors: building ? undefined : data as C4ViewDescriptor[] | undefined,
    loading: !data && !error,
    building,
    error: error as Error | undefined,
    mutate,
  };
}
