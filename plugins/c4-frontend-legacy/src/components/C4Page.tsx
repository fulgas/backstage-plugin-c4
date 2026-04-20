import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Content, ContentHeader, DismissableBanner, Header, Page, Table, TableColumn, EmptyState,
} from '@backstage/core-components';
import { Button, List, ListItem, ListItemText, Typography, makeStyles } from '@material-ui/core';
import { CatalogFilterLayout } from '@backstage/plugin-catalog-react';
import { Box } from '@material-ui/core';
import { C4ViewDescriptor, useC4Views, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
import { useApi, errorApiRef, alertApiRef } from '@backstage/core-plugin-api';
import { useNavigate } from 'react-router-dom';

const useStyles = makeStyles(theme => ({
  filterGroup: {
    paddingBottom: theme.spacing(1),
  },
  filterLabel: {
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: 700,
    color: theme.palette.text.secondary,
    padding: theme.spacing(1, 2, 0.5),
  },
  filterItem: {
    borderRadius: theme.shape.borderRadius,
    paddingTop: 4,
    paddingBottom: 4,
  },
}));

function parseRef(ref: string): { kind: string; namespace: string; name: string } {
  const colonIdx = ref.indexOf(':');
  if (colonIdx < 0) return { kind: 'unknown', namespace: 'default', name: ref };
  const kind = ref.slice(0, colonIdx);
  const rest = ref.slice(colonIdx + 1);
  const slashIdx = rest.indexOf('/');
  if (slashIdx < 0) return { kind, namespace: 'default', name: rest };
  return { kind, namespace: rest.slice(0, slashIdx), name: rest.slice(slashIdx + 1) };
}

type DiagramRow = C4ViewDescriptor & { entityName: string; entityKind: string };

function toRows(descriptors: C4ViewDescriptor[]): DiagramRow[] {
  return descriptors
    .filter(d => !!d.entityRef)
    .map(d => {
      const { kind, name } = parseRef(d.entityRef!);
      return { ...d, entityName: name, entityKind: kind };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

const LEVEL_LABELS: Record<string, string> = {
  landscape: 'System Landscape',
  context: 'System Context',
  container: 'Container',
};

const columns: TableColumn<DiagramRow>[] = [
  { title: 'Title', field: 'title', highlight: true, width: '40%' },
  { title: 'Kind', field: 'entityKind', width: '15%' },
  { title: 'Type', field: 'level', width: '25%', render: row => LEVEL_LABELS[row.level] ?? row.level },
  { title: 'Source', field: 'source', width: '20%' },
];

const ALL = 'all';
const LEVELS = ['landscape', 'context', 'container'] as const;

function C4PageInner() {
  const classes = useStyles();
  const [sourceFilter, setSourceFilter] = useState<string>(ALL);
  const [levelFilter, setLevelFilter] = useState<string>(ALL);
  const everBuilt = useRef(false);
  const [pollActive, setPollActive] = useState(true);

  const { descriptors, loading, building } = useC4Views({ refreshInterval: pollActive ? 3000 : 0 });

  useEffect(() => {
    if (building) everBuilt.current = true;
  }, [building]);

  useEffect(() => {
    if (pollActive && !building && descriptors !== undefined) setPollActive(false);
  }, [pollActive, building, descriptors]);

  const showReadyBanner = everBuilt.current && !building && descriptors !== undefined;

  const sources = useMemo(() => {
    const set = new Set((descriptors ?? []).map(d => d.source));
    return Array.from(set).sort();
  }, [descriptors]);

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

  const rows = useMemo(() => toRows(descriptors ?? []), [descriptors]);
  const filtered = useMemo(() =>
    rows.filter(r =>
      (sourceFilter === ALL || r.source === sourceFilter) &&
      (levelFilter === ALL || r.level === levelFilter),
    ),
    [rows, sourceFilter, levelFilter],
  );

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture" subtitle="All diagrams" />
      <Content>
        {building && (
          <Box style={{ marginBottom: 16 }}>
            <DismissableBanner id="c4-building" variant="info" message="Diagrams are being generated — this page will update automatically when ready." />
          </Box>
        )}
        {showReadyBanner && (
          <Box style={{ marginBottom: 16 }}>
            <DismissableBanner id="c4-ready" variant="info" message="Diagrams are ready." fixed />
          </Box>
        )}
        <CatalogFilterLayout>
          <CatalogFilterLayout.Filters>
            <div className={classes.filterGroup}>
              <Typography className={classes.filterLabel}>Diagram type</Typography>
              <List dense disablePadding>
                {[{ value: ALL, label: 'All types' }, ...LEVELS.map(l => ({ value: l, label: LEVEL_LABELS[l] ?? l }))].map(item => (
                  <ListItem
                    key={item.value}
                    button
                    selected={levelFilter === item.value}
                    onClick={() => setLevelFilter(item.value)}
                    className={classes.filterItem}
                  >
                    <ListItemText primary={item.label} />
                  </ListItem>
                ))}
              </List>
            </div>
            {sources.length > 1 && (
              <div className={classes.filterGroup}>
                <Typography className={classes.filterLabel}>Source</Typography>
                <List dense disablePadding>
                  {[{ value: ALL, label: 'All sources' }, ...sources.map(s => ({ value: s, label: s }))].map(item => (
                    <ListItem
                      key={item.value}
                      button
                      selected={sourceFilter === item.value}
                      onClick={() => setSourceFilter(item.value)}
                      className={classes.filterItem}
                    >
                      <ListItemText primary={item.label} />
                    </ListItem>
                  ))}
                </List>
              </div>
            )}
          </CatalogFilterLayout.Filters>
          <CatalogFilterLayout.Content>
            <ContentHeader title="">
              <Button color="primary" variant="contained" size="small" disabled={syncing} onClick={triggerSync}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
            </ContentHeader>
            {loading || building ? (
              <EmptyState missing="data" title="Building diagrams…" description="C4 diagrams are being generated from your catalog. This page will update automatically when done." />
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
                  navigate(`/c4/${namespace}/${kind}/${name}/${encodeURIComponent(row.id)}`);
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
  return <C4PageInner />;
}
