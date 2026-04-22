import {
  Content,
  ContentHeader,
  DismissableBanner,
  EmptyState,
  Header,
  Link,
  Page,
  Select,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  alertApiRef,
  configApiRef,
  errorApiRef,
  useApi,
} from '@backstage/core-plugin-api';
import {
  CatalogFilterLayout,
  EntityDisplayName,
  EntityKindPicker,
  EntityListProvider,
  EntityOwnerPicker,
  EntityRefLinks,
  getEntityRelations,
  useEntityList,
  UserListPicker,
} from '@backstage/plugin-catalog-react';
import { Button } from '@backstage/ui';
import {
  c4ApiRef,
  C4ViewDescriptor,
  useC4Views,
} from '@fulgas/plugin-c4-frontend-common';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './C4Page.module.css';

function parseRef(ref: string): {
  kind: string;
  namespace: string;
  name: string;
} {
  const colonIdx = ref.indexOf(':');
  if (colonIdx < 0) return { kind: 'unknown', namespace: 'default', name: ref };
  const kind = ref.slice(0, colonIdx);
  const rest = ref.slice(colonIdx + 1);
  const slashIdx = rest.indexOf('/');
  if (slashIdx < 0) return { kind, namespace: 'default', name: rest };
  return {
    kind,
    namespace: rest.slice(0, slashIdx),
    name: rest.slice(slashIdx + 1),
  };
}

function entityRefFrom(entity: {
  kind: string;
  metadata: { namespace?: string; name: string };
}): string {
  return `${entity.kind.toLowerCase()}:${
    entity.metadata.namespace ?? 'default'
  }/${entity.metadata.name}`;
}

type DiagramRow = C4ViewDescriptor & {
  entityName: string;
  entityKind: string;
  ownerRelations: any[];
};

const ALL_VALUE = 'all';

const LEVEL_LABELS: Record<string, string> = {
  landscape: 'System Landscape',
  context: 'System Context',
  container: 'Container',
  component: 'Component',
};

const LEVELS = ['landscape', 'context', 'container', 'component'] as const;

function diagramPath(entityRef: string) {
  const { kind, namespace, name } = parseRef(entityRef);
  return `/c4/${namespace}/${kind}/${name}`;
}

function tableColumns(
  navigate: ReturnType<typeof useNavigate>,
): TableColumn<DiagramRow>[] {
  return [
    {
      title: 'Name',
      field: 'title',
      highlight: true,
      width: '30%',
      render: row =>
        row.entityRef ? (
          <Link
            to={diagramPath(row.entityRef)}
            onClick={e => {
              e.preventDefault();
              navigate(diagramPath(row.entityRef!));
            }}
          >
            <EntityDisplayName entityRef={row.entityRef} />
          </Link>
        ) : (
          row.title
        ),
    },
    {
      title: 'Parent',
      field: 'parentTitle',
      width: '20%',
      render: row =>
        row.parentEntityRef ? (
          <Link
            to={diagramPath(row.parentEntityRef)}
            onClick={e => {
              e.preventDefault();
              navigate(diagramPath(row.parentEntityRef!));
            }}
          >
            <EntityDisplayName entityRef={row.parentEntityRef} />
          </Link>
        ) : (
          row.parentTitle ?? '—'
        ),
    },
    {
      title: 'Kind',
      field: 'entityKind',
      width: '15%',
      render: row =>
        row.entityKind.charAt(0).toUpperCase() + row.entityKind.slice(1),
    },
    {
      title: 'Type',
      field: 'level',
      width: '20%',
      render: row => (row.level ? LEVEL_LABELS[row.level] ?? row.level : ''),
    },
    {
      title: 'Owner',
      field: 'ownerRelations',
      width: '15%',
      render: row =>
        row.ownerRelations.length ? (
          <EntityRefLinks entityRefs={row.ownerRelations} defaultKind="group" />
        ) : (
          '—'
        ),
    },
    { title: 'Source', field: 'source', width: '10%' },
  ];
}

function C4TableContent({
  descriptorMap,
  levelFilter,
  building,
}: {
  descriptorMap: Map<string, C4ViewDescriptor>;
  levelFilter: string;
  building: boolean;
}) {
  const { entities } = useEntityList();
  const navigate = useNavigate();

  const rows = useMemo((): DiagramRow[] => {
    const mapped: (DiagramRow | null)[] = entities.map(entity => {
      const ref = entityRefFrom(entity);
      const descriptor = descriptorMap.get(ref);
      if (!descriptor) return null;
      const { kind, name } = parseRef(ref);
      const ownerRelations = getEntityRelations(entity as any, 'ownedBy');
      return {
        ...descriptor,
        entityName: name,
        entityKind: kind,
        ownerRelations,
      } as DiagramRow;
    });
    return mapped
      .filter((r): r is DiagramRow => r !== null)
      .filter(r => levelFilter === ALL_VALUE || r.level === levelFilter)
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [entities, descriptorMap, levelFilter]);

  if (building) {
    return (
      <EmptyState
        missing="data"
        title="Building diagrams…"
        description="C4 diagrams are being generated from your catalog. This page will update automatically when done."
      />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        missing="data"
        title="No diagrams found"
        description="No C4 diagrams match the current filters."
      />
    );
  }
  return (
    <Table<DiagramRow>
      title={`All C4 Diagrams (${rows.length})`}
      options={{ paging: rows.length > 20, pageSize: 20, search: true }}
      columns={tableColumns(navigate)}
      data={rows}
    />
  );
}

function C4PageInner() {
  const everBuilt = useRef(false);
  const [pollActive, setPollActive] = useState(true);
  const [levelFilter, setLevelFilter] = useState(ALL_VALUE);

  const { descriptors, loading, building } = useC4Views({
    refreshInterval: pollActive ? 3000 : 0,
  });

  useEffect(() => {
    if (building) everBuilt.current = true;
  }, [building]);
  useEffect(() => {
    if (pollActive && !building && descriptors !== undefined)
      setPollActive(false);
  }, [pollActive, building, descriptors]);

  const showReadyBanner =
    everBuilt.current && !building && descriptors !== undefined;

  const descriptorMap = useMemo(() => {
    const map = new Map<string, C4ViewDescriptor>();
    for (const d of descriptors ?? []) {
      if (d.entityRef) map.set(d.entityRef, d);
    }
    return map;
  }, [descriptors]);

  const c4Api = useApi(c4ApiRef);
  const errorApi = useApi(errorApiRef);
  const alertApi = useApi(alertApiRef);
  const config = useApi(configApiRef);
  const orgName = config.getOptionalString('organization.name') ?? 'My Org';
  const [syncing, setSyncing] = useState(false);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await c4Api.triggerSync();
      alertApi.post({
        message: 'Sync started — diagrams will update shortly.',
        severity: 'success',
      });
      setPollActive(true);
    } catch (e) {
      errorApi.post(e as Error);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture" subtitle={`${orgName} C4 Explorer`} />
      <Content>
        {building && (
          <div className={styles.bannerWrap}>
            <DismissableBanner
              id="c4-building"
              variant="info"
              message="Diagrams are being generated — this page will update automatically when ready."
            />
          </div>
        )}
        {showReadyBanner && (
          <div className={styles.bannerWrap}>
            <DismissableBanner
              id="c4-ready"
              variant="info"
              message="Diagrams are ready."
              fixed
            />
          </div>
        )}
        <ContentHeader title="">
          <Button variant="primary" isDisabled={syncing} onPress={triggerSync}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        </ContentHeader>
        <EntityListProvider>
          <CatalogFilterLayout>
            <CatalogFilterLayout.Filters>
              <EntityKindPicker
                allowedKinds={['Domain', 'System', 'Component']}
              />
              <Select
                label="Type"
                items={[
                  { value: ALL_VALUE, label: 'All types' },
                  ...LEVELS.map(l => ({
                    value: l,
                    label: LEVEL_LABELS[l] ?? l,
                  })),
                ]}
                selected={levelFilter}
                onChange={v => setLevelFilter(String(v))}
              />
              <UserListPicker />
              <EntityOwnerPicker />
            </CatalogFilterLayout.Filters>
            <CatalogFilterLayout.Content>
              <C4TableContent
                descriptorMap={descriptorMap}
                levelFilter={levelFilter}
                building={building || loading}
              />
            </CatalogFilterLayout.Content>
          </CatalogFilterLayout>
        </EntityListProvider>
      </Content>
    </Page>
  );
}

export function C4Page() {
  return <C4PageInner />;
}
