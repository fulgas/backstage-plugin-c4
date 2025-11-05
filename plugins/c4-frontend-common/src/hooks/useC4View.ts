import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4Diagram } from '../types';

/**
 * Fetch a fully computed `C4Diagram` by its descriptor ID.
 *
 * The backend computes the diagram on demand from the node tree and caches it.
 * Pass `undefined` as `id` to skip the fetch (useful when the ID is not yet known).
 *
 * @example
 * ```tsx
 * const { diagram, loading } = useC4View(selectedDescriptor?.id);
 * ```
 */
export function useC4View(id: string | undefined) {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(id ? `c4-diagram-${id}` : null, () => api.getDiagram(id!));
  return {
    diagram: data as C4Diagram | undefined,
    loading: !!id && !data && !error,
    error: error as Error | undefined,
  };
}
