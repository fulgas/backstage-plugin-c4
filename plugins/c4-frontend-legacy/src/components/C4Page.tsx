import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Content, ContentHeader, DismissableBanner, Header, Page, Table, TableColumn, EmptyState, Select,
} from '@backstage/core-components';
import { Button } from '@material-ui/core';
import { CatalogFilterLayout } from '@backstage/plugin-catalog-react';
import { Box } from '@material-ui/core';
import { C4View, useC4Views, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { useApi, errorApiRef, alertApiRef } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';
import { SWRConfig } from 'swr';

function parseRef(ref: string): { kind: string; namespace: string; name: string } {
  const colonIdx = ref.indexOf(':');
  if (colonIdx < 0) return { kind: 'unknown', namespace: 'default', name: ref };
  const kind = ref.slice(0, colonIdx);
  const rest = ref.slice(colonIdx + 1);
  const slashIdx = rest.indexOf('/');
  if (slashIdx < 0) return { kind, namespace: 'default', name: rest };
  return { kind, namespace: rest.slice(0, slashIdx), name: rest.slice(slashIdx + 1) };
}

type DiagramRow = C4View & { entityName: string; entityKind: string };

function toRows(views: C4View[]): DiagramRow[] {
  return views
    .filter(v => !!v.entityRef)
    .map(v => {
      const { kind, name } = parseRef(v.entityRef!);
      return { ...v, entityName: name, entityKind: kind };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

const columns: TableColumn<DiagramRow>[] = [
  { title: 'Name', field: 'entityName', highlight: true, width: '45%' },
  { title: 'Kind', field: 'entityKind', width: '20%' },
  { title: 'Type', field: 'type', width: '20%' },
  { title: 'Source', field: 'source', width: '15%' },
];

const ALL = 'all';
const VIEW_TYPE_ITEMS = [
  { label: 'All types', value: ALL },
  { label: 'Landscape', value: 'landscape' },
  { label: 'Context', value: 'context' },
  { label: 'Container', value: 'container' },
];

function C4PageInner() {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const everBuilt = useRef(false);
  const [pollActive, setPollActive] = useState(true);

  const { views, loading, building } = useC4Views({ refreshInterval: pollActive ? 3000 : 0 });

  useEffect(() => {
    if (building) everBuilt.current = true;
  }, [building]);

  useEffect(() => {
    if (pollActive && !building && views !== undefined) setPollActive(false);
  }, [pollActive, building, views]);

  const showReadyBanner = everBuilt.current && !building && views !== undefined;

  const navigate = useNavigate();
  const c4Api = useApi(c4ApiRef);
  const errorApi = useApi(errorApiRef);
  const alertApi = useApi(alertApiRef);
  const [syncing, setSyncing] = useState(false);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await c4Api.triggerSync();
      alertApi.post({ message: 'Sync started — diagrams will update shortly.', severity: 'success' });
      setPollActive(true);
    } catch (e) {
      errorApi.post(e as Error);
    } finally {
      setSyncing(false);
    }
  };

  const rows = useMemo(() => toRows(views ?? []), [views]);

  const filtered = useMemo(() =>
    rows.filter(r => typeFilter === ALL || r.type === typeFilter),
    [rows, typeFilter],
  );

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture" subtitle="All diagrams" />
      <Content>
        {building && (
          <Box style={{ marginBottom: 16 }}>
            <DismissableBanner
              id="c4-building"
              variant="info"
              message="Diagrams are being generated — this page will update automatically when ready."
            />
          </Box>
        )}
        {showReadyBanner && (
          <Box style={{ marginBottom: 16 }}>
            <DismissableBanner
              id="c4-ready"
              variant="info"
              message="Diagrams are ready."
              fixed
            />
          </Box>
        )}

        <CatalogFilterLayout>
          <CatalogFilterLayout.Filters>
            <Box style={{ padding: '8px 0' }}>
              <Select
                label="Type"
                items={VIEW_TYPE_ITEMS}
                selected={typeFilter}
                onChange={v => setTypeFilter(v as string)}
              />
            </Box>
          </CatalogFilterLayout.Filters>

          <CatalogFilterLayout.Content>
            <ContentHeader title="">
              <Button color="primary" variant="contained" size="small" disabled={syncing} onClick={triggerSync}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
            </ContentHeader>
            {loading || building ? (
              <EmptyState
                missing="data"
                title="Building diagrams…"
                description="C4 diagrams are being generated from your catalog. This page will update automatically when done."
              />
            ) : filtered.length === 0 ? (
              <EmptyState missing="data" title="No diagrams found" description="No C4 diagrams for this filter." />
            ) : (
              <Table<DiagramRow>
                title="C4 Diagrams"
                options={{ paging: filtered.length > 20, pageSize: 20, search: true }}
                columns={columns}
                data={filtered}
                onRowClick={(_e, row) => {
                  if (!row?.entityRef) return;
                  const { kind, namespace, name } = parseRef(row.entityRef);
                  navigate(`/c4/${namespace}/${kind}/${name}?view=${encodeURIComponent(row.id)}`);
                }}
              />
            )}
          </CatalogFilterLayout.Content>
        </CatalogFilterLayout>
      </Content>
    </Page>
  );
}

export function C4Page() {
  return (
    <SWRConfig value={{ provider: () => new Map() }}>
      <C4PageInner />
    </SWRConfig>
  );
}
