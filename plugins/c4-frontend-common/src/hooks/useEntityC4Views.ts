import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4ViewDescriptor } from '../types';

/**
 * Fetch all C4 view descriptors that belong to a specific Backstage entity.
 *
 * Returns `building: true` while the first sync is still in progress.
 * Typically used on entity pages to list which C4 diagrams are available.
 *
 * @example
 * ```tsx
 * const entity = useEntity();
 * const { descriptors, loading } = useEntityC4Views(entity.kind, entity.metadata.namespace, entity.metadata.name);
 * ```
 */
export function useEntityC4Views(kind: string, namespace: string, name: string) {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(
    `c4-entity-${kind}-${namespace}-${name}`,
    () => api.getEntityViewDescriptors(kind, namespace, name),
  );
  const building = data != null && !Array.isArray(data) && (data as any).building === true;
  return {
    descriptors: building ? undefined : data as C4ViewDescriptor[] | undefined,
    loading: !data && !error,
    building,
    error: error as Error | undefined,
  };
}
